export default [
  {
    files: ["**/*.js"],
    // Flat config ignores (Railway/ESLint v9+ prefers this over .eslintignore)
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
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-useless-escape": "off",
      semi: ["warn", "always"],
      quotes: ["warn", "double"]
    }
  }
];
