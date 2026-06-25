import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "site", "_legacy", "examples", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow deliberately-unused, underscore-prefixed params. The verbatim bridge ports keep full
      // Siebel method signatures even where an argument is unused, and mock methods implement wide
      // interfaces the same way.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
)
