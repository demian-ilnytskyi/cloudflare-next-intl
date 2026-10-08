import ts from "typescript";

export interface DynamicCall { file: string; line: number; text: string; prop?: { component: string; name: string } }
export interface FileScanResult { namespaces: string[]; dynamicCalls: DynamicCall[]; usesRoot: boolean }

const HOOK_MODULES = new Set(["cloudflare-next-intl/use", "cloudflare-next-intl/client", "cloudflare-next-intl"]);

function topLevel(ns: string): string {
    return ns.split(".")[0];
}

function literalsOfType(node: ts.TypeNode | undefined, sf: ts.SourceFile, aliases: Map<string, ts.TypeNode>): string[] | null {
    if (!node) return null;
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
    if (ts.isUnionTypeNode(node)) {
        const out: string[] = [];
        for (const t of node.types) {
            const r = literalsOfType(t, sf, aliases);
            if (!r) return null;
            out.push(...r);
        }
        return out;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return literalsOfType(aliases.get(node.typeName.text), sf, aliases);
    return null;
}

function componentName(fn: ts.Node): string | null {
    if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text;
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
    return null;
}

function propOf(arg: ts.Expression, propParams: Map<string, { component: string; name: string }>): DynamicCall["prop"] | null {
    if (ts.isIdentifier(arg)) {
        const p = propParams.get(arg.text);
        return p ?? null;
    }
    if (ts.isTemplateExpression(arg) && arg.head.text === "" && ts.isIdentifier(arg.templateSpans[0].expression)) {
        const p = propParams.get(arg.templateSpans[0].expression.text);
        return p ?? null;
    }
    return null;
}

export function findJsxPropValues(file: string, code: string, component: string, prop: string): string[] | null {
    if (!code.includes(`<${component}`)) return [];
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const values: string[] = [];
    let unresolved = false;
    const visit = (node: ts.Node): void => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === component) {
            let value: string | null = null;
            for (const attr of node.attributes.properties) {
                if (ts.isJsxSpreadAttribute(attr)) { value = null; break; }
                if (attr.name.getText() !== prop) continue;
                const init = attr.initializer;
                if (init && ts.isStringLiteral(init)) value = init.text;
                else if (init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) value = init.expression.text;
            }
            if (value === null) unresolved = true;
            else values.push(value);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return unresolved ? null : values;
}

export function scanFile(file: string, code: string): FileScanResult {
    const result: FileScanResult = { namespaces: [], dynamicCalls: [], usesRoot: false };
    if (!code.includes("useTranslations")) return result;
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const hookNames = new Set<string>();
    const consts = new Map<string, ts.Expression>();
    const typeAliases = new Map<string, ts.TypeNode>();
    const paramTypes = new Map<string, ts.TypeNode>();
    const propParams = new Map<string, { component: string; name: string }>();

    const collect = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && HOOK_MODULES.has(node.moduleSpecifier.text)) {
            const named = node.importClause?.namedBindings;
            if (named && ts.isNamedImports(named)) {
                for (const el of named.elements) if ((el.propertyName ?? el.name).text === "useTranslations") hookNames.add(el.name.text);
            }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) consts.set(node.name.text, node.initializer);
        if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node.type);
        if (ts.isParameter(node) && node.type) {
            if (ts.isIdentifier(node.name)) paramTypes.set(node.name.text, node.type);
            const component = componentName(node.parent);
            if (component && ts.isObjectBindingPattern(node.name)) {
                for (const el of node.name.elements) {
                    if (!ts.isIdentifier(el.name)) continue;
                    const key = (el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName : el.name).text;
                    propParams.set(el.name.text, { component, name: key });
                }
            }
            if (ts.isObjectBindingPattern(node.name) && ts.isTypeLiteralNode(node.type)) {
                for (const el of node.name.elements) {
                    if (!ts.isIdentifier(el.name)) continue;
                    const key = (el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName : el.name).text;
                    const member = node.type.members.find((m) => ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === key) as ts.PropertySignature | undefined;
                    if (member?.type) paramTypes.set(el.name.text, member.type);
                }
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(sf);
    if (hookNames.size === 0) return result;

    const resolve = (expr: ts.Expression, depth = 0): string[] | null => {
        if (depth > 5) return null;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
        if (ts.isTemplateExpression(expr) && expr.head.text.includes(".")) {
            const top = expr.head.text.split(".")[0];
            if (top) return [top];
        }
        if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return resolve(expr.expression, depth + 1);
        if (ts.isConditionalExpression(expr)) {
            const a = resolve(expr.whenTrue, depth + 1);
            const b = resolve(expr.whenFalse, depth + 1);
            return a && b ? [...a, ...b] : null;
        }
        if (ts.isIdentifier(expr)) {
            const init = consts.get(expr.text);
            if (init) return resolve(init, depth + 1);
            return literalsOfType(paramTypes.get(expr.text), sf, typeAliases);
        }
        return null;
    };

    const found = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && hookNames.has(node.expression.text)) {
            const arg = node.arguments[0];
            if (!arg) result.usesRoot = true;
            else {
                const values = resolve(arg);
                if (values) values.forEach((v) => found.add(topLevel(v)));
                else {
                    const call: DynamicCall = { file, line: sf.getLineAndCharacterOfPosition(arg.getStart()).line + 1, text: arg.getText() };
                    const prop = propOf(arg, propParams);
                    if (prop) call.prop = prop;
                    result.dynamicCalls.push(call);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    result.namespaces = [...found];
    return result;
}
