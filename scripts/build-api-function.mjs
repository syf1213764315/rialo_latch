import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const wasmSrc = path.join(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const wasmDest = path.join(root, "netlify/functions/sql-wasm.wasm");
const outFile = path.join(root, "netlify/functions/api.cjs");

if (!fs.existsSync(wasmSrc)) {
  console.error("sql.js wasm not found. Run npm install first.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(wasmDest), { recursive: true });
fs.copyFileSync(wasmSrc, wasmDest);

await esbuild.build({
  entryPoints: [path.join(root, "netlify/functions/entry.mjs")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  mainFields: ["module", "main"],
  conditions: ["node", "import", "require"],
  logLevel: "info",
});

console.log("Netlify function bundled -> netlify/functions/api.cjs");
