import js from "@eslint/js";

export default [
  js.configs.recommended,

  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "data/**"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },

    rules: {
      // Discord bots use console logging
      "no-console": "off",

      // Don't fail builds for unused variables
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // Template strings & Discord formatting often trigger this
      "no-useless-escape": "off",

      // Style rules (warnings only)
      semi: ["warn", "always"],
      quotes: ["warn", "double"]
    }
  }
];
