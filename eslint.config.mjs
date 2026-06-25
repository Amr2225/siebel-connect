import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "site", "_legacy", "examples", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
