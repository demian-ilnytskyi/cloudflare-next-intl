import type { Plugin } from "vite";

export const ROLLDOWN_RUNTIME_STUB_ID = "\0cfni:rolldown-runtime-stub";

export const ROLLDOWN_RUNTIME_STUB_CODE = `
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __require = () => {};
export { __commonJSMin, __require, __toESM };
`;

export function rolldownRuntimeStubPlugin(): Plugin {
    return {
        name: "cfni:rolldown-runtime-stub",
        enforce: "pre",
        resolveId(id, _importer, options) {
            if (
                id.includes("_virtual/_rolldown/runtime.js") &&
                (this.environment?.name === "client" || options?.ssr === false)
            ) {
                return ROLLDOWN_RUNTIME_STUB_ID;
            }
        },
        load(id) {
            if (id === ROLLDOWN_RUNTIME_STUB_ID) {
                return ROLLDOWN_RUNTIME_STUB_CODE;
            }
            if (
                id.includes("_virtual/_rolldown/runtime.js") &&
                this.environment?.name === "client"
            ) {
                return ROLLDOWN_RUNTIME_STUB_CODE;
            }
        },
    };
}

