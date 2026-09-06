import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface LayoutDbViolation {
  layoutFile: string;
  sourceFile: string;
  lineNumber: number;
  lineContent: string;
  signal: string;
  importTrace: string[];
}

export interface CheckLayoutQueriesOptions {
  appDir?: string;
  rootDir?: string;
  aliases?: Record<string, string>;
  maxDepth?: number;
  throwOnError?: boolean;
}

export interface CheckLayoutQueriesReport {
  valid: boolean;
  violations: LayoutDbViolation[];
  formattedMessage: string;
}

const DB_SIGNALS = [
  { name: "withUserDb()", pattern: /\bwithUserDb\s*\(/ },
  { name: "withPublicDb()", pattern: /\bwithPublicDb\s*\(/ },
] as const;

const SUPPORTED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

/**
 * Checks whether a file is a Client Component.
 * Client components execute on the client and do not block server layout streaming.
 */
function isClientComponent(content: string): boolean {
  return /^\s*["']use client["']/m.test(content);
}

/**
 * Finds all layout files in the app directory.
 */
export function findLayoutFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (/^layout\.(tsx|ts|jsx|js)$/.test(entry)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Resolves imported module path.
 */
function resolveImportPath(
  specifier: string,
  importerFile: string,
  rootDir: string,
  aliases: Record<string, string>
): string | null {
  for (const [alias, target] of Object.entries(aliases)) {
    if (specifier === alias || specifier.startsWith(alias + "/")) {
      const remainder = specifier.slice(alias.length).replace(/^\//, "");
      const basePath = resolve(rootDir, target, remainder);
      return probeExtensions(basePath);
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const basePath = resolve(dirname(importerFile), specifier);
    return probeExtensions(basePath);
  }

  return null;
}

function probeExtensions(basePath: string): string | null {
  if (existsSync(basePath) && statSync(basePath).isFile()) {
    return basePath;
  }
  for (const ext of SUPPORTED_EXTENSIONS) {
    const withExt = basePath + ext;
    if (existsSync(withExt) && statSync(withExt).isFile()) {
      return withExt;
    }
  }
  for (const ext of SUPPORTED_EXTENSIONS) {
    const indexFile = join(basePath, "index" + ext);
    if (existsSync(indexFile) && statSync(indexFile).isFile()) {
      return indexFile;
    }
  }
  return null;
}

/**
 * Parses static imports from file content.
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex =
    /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|import\s*\(\s*)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  return imports;
}

/**
 * Formats visible terminal instructions on how to fix layout DB violations.
 */
export function formatLayoutDbViolationMessage(violations: LayoutDbViolation[]): string {
  if (violations.length === 0) return "";

  const separator = "=".repeat(84);
  const thinSeparator = "-".repeat(84);

  const lines: string[] = [
    "",
    separator,
    "🚨 [cloudflare-next-intl] BLOCKING DATABASE QUERY DETECTED IN LAYOUT",
    separator,
    "",
    "⚠️  WHY THIS IS DANGEROUS:",
    "   Layouts are re-evaluated by the server on every route transition within their group.",
    "   Executing database queries (`withUserDb` / `withPublicDb`) inside the layout tree",
    "   blocks the entire RSC response on every page switch. This causes page navigation",
    "   to freeze/hang and completely breaks instant client transitions.",
    "",
    "📋 VIOLATIONS FOUND (" + violations.length + "):",
    thinSeparator,
  ];

  violations.forEach((v, i) => {
    lines.push(` [${i + 1}] Signal: ${v.signal}`);
    lines.push(`     Layout:   ${v.layoutFile}`);
    lines.push(`     File:     ${v.sourceFile}:${v.lineNumber}`);
    lines.push(`     Line:     ${v.lineContent.trim()}`);
    if (v.importTrace.length > 1) {
      lines.push(`     Trace:    ${v.importTrace.join(" -> ")}`);
    }
    lines.push(thinSeparator);
  });

  lines.push(
    "",
    "💡 HOW TO FIX:",
    "   1. Move to a Client Component ('use client'):",
    "      Fetch the data in useEffect / SWR / React Query or a Supabase Realtime subscription.",
    "      Client components do not block server layout streaming during navigation.",
    "",
    "   2. Use Cross-Request Caching (`unstable_cache`):",
    "      Wrap the database query with `unstable_cache` (from 'next/cache') and a cache tag.",
    "      This caches results in Cloudflare KV so layout renders in 0ms without hitting Postgres.",
    "",
    "   3. Move out of Shared Layout:",
    "      If only a specific route needs this data, move the component from layout.tsx into that",
    "      page's page.tsx.",
    separator,
    ""
  );

  return lines.join("\n");
}

/**
 * Checks layout files and their reachable server component dependency tree
 * for blocking database calls.
 */
export function checkLayoutQueries(
  options: CheckLayoutQueriesOptions = {}
): CheckLayoutQueriesReport {
  const rootDir = options.rootDir ?? process.cwd();
  const appDir = options.appDir ?? resolve(rootDir, "src/app");
  const aliases = options.aliases ?? {
    "@": resolve(rootDir, "src"),
  };
  const maxDepth = options.maxDepth ?? 20;

  const layoutFiles = findLayoutFiles(appDir);
  const violations: LayoutDbViolation[] = [];

  for (const layoutFile of layoutFiles) {
    const visited = new Set<string>();

    function traverse(file: string, trace: string[], depth: number) {
      if (depth > maxDepth || visited.has(file)) return;
      visited.add(file);

      let content: string;
      try {
        content = readFileSync(file, "utf-8");
      } catch {
        return;
      }

      // If component is a client component, it does not block server layout execution
      if (isClientComponent(content)) {
        return;
      }

      // Check content for DB signals
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

        for (const signal of DB_SIGNALS) {
          if (signal.pattern.test(line)) {
            violations.push({
              layoutFile,
              sourceFile: file,
              lineNumber: index + 1,
              lineContent: line,
              signal: signal.name,
              importTrace: [...trace, file],
            });
          }
        }
      });

      // Extract and traverse imports
      const imports = extractImports(content);
      for (const imp of imports) {
        const resolved = resolveImportPath(imp, file, rootDir, aliases);
        if (resolved) {
          traverse(resolved, [...trace, file], depth + 1);
        }
      }
    }

    traverse(layoutFile, [], 0);
  }

  const valid = violations.length === 0;
  const formattedMessage = formatLayoutDbViolationMessage(violations);

  if (!valid && options.throwOnError) {
    throw new Error(formattedMessage);
  }

  return {
    valid,
    violations,
    formattedMessage,
  };
}
