import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "core/index": "src/core/index.ts",
    "react/index": "src/react/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  outDir: "dist",
  // react is a peer dep — never bundle it into the react entry.
  external: ["react", "react-dom"],
})
