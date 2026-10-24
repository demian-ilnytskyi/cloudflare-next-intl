import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends(
    "next",
    "next/core-web-vitals",
    "next/typescript"
  ),
  ...compat.extends("prettier"),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "@next/next/no-async-client-component": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.test.{js,jsx,ts,tsx}", "**/*.bench.{js,jsx,ts,tsx}", "**/*.perf.test.{js,jsx,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
    ],
  },
];

export default eslintConfig;
