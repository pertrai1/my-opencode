const js = require("@eslint/js");
const llmCore = require("eslint-plugin-llm-core");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  ...llmCore.configs.recommended,
  {
    rules: {
      "llm-core/filename-match-export": "off",
      "llm-core/max-complexity": "off",
      "llm-core/max-file-length": "off",
      "llm-core/max-function-length": "off",
      "llm-core/max-nesting-depth": "off",
      "llm-core/max-params": "off",
      "llm-core/no-exported-function-expressions": "off",
      "llm-core/no-magic-numbers": "off",
    },
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"].map(config => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // JavaScript-specific overrides
    },
  }
];
