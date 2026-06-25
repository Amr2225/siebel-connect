// Copies the ambient Siebel globals declaration into dist so the
// "siebel-connect/siebel-globals" export resolves (tsup can't emit ambient .d.ts).
import { copyFileSync, mkdirSync } from "node:fs"

mkdirSync("dist", { recursive: true })
copyFileSync("src/core/siebel-globals.d.ts", "dist/siebel-globals.d.ts")
