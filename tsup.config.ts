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
  // react is a peer dep — never bundle it into the react entry. `siebel-connect` is kept external so
  // the react entry imports the package's own `.` entry at runtime instead of inlining a second copy
  // of core: that keeps the factory memo (and its per-key store singletons) a true single instance
  // shared between `siebel-connect` and `siebel-connect/react`.
  external: ["react", "react-dom", "siebel-connect"],
})
