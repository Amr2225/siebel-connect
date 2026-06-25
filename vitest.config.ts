import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Resolve the package's own name (and subpath entries) to source, not the built `dist/`.
// Node would otherwise self-reference `siebel-connect` via package.json `exports` and import a stale
// build. The tsconfig `paths` alias only covers type resolution; runtime tests need this mirror so
// they exercise the real `src/` barrels.
const srcAlias = (entry: string) =>
  fileURLToPath(new URL(`./src/${entry}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^siebel-connect$/, replacement: srcAlias("core/index.ts") },
      { find: /^siebel-connect\/react$/, replacement: srcAlias("react/index.ts") },
      { find: /^siebel-connect\/testing$/, replacement: srcAlias("testing/index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
})
