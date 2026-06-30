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
      // Only the shipped source counts. Without an explicit include, v8 instruments whatever gets
      // imported (pulling in `_legacy/**`, whose Angular example `dist` paths contain `ng:` and crash
      // the Windows report writer). `all: true` also surfaces source files no test touches.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts", // ambient declarations (siebel-globals): no runtime to cover
        "src/**/index.ts", // re-export barrels: nothing executable to assert on
        "src/core/types.ts", // pure type declarations: compiles to an empty module
      ],
      // Gate CI on coverage. Floors sit a few points under the current numbers (stmts/lines ~91%,
      // branches ~90%, funcs ~94%): enough headroom that an unrelated refactor will not trip them, low
      // enough that dropping a tested module's coverage fails the build loudly.
      thresholds: {
        statements: 88,
        branches: 85,
        functions: 90,
        lines: 88,
      },
    },
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
})
