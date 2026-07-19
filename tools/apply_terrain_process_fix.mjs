import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2];
const replacementPath = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), "worker_terrain_process_api_replacement.txt");
const outputPath = process.argv[4] || "worker_process_api_full.txt";

if (!sourcePath) {
  console.error('Usage: node apply_terrain_process_fix.mjs "Pasted code(1).js" [replacement.txt] [output.txt]');
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, "utf8");
const replacement = fs.readFileSync(replacementPath, "utf8").trimEnd();

const startMarker = "// ---------- Copernicus GLO-30 terrain statistics ----------";
const endMarker = "async function handleZipBoundaryRequest(url) {";

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);

if (start < 0) throw new Error(`Start marker not found: ${startMarker}`);
if (end < 0 || end <= start) throw new Error(`End marker not found after terrain block: ${endMarker}`);

const output = source.slice(0, start) + replacement + "\n\n" + source.slice(end);
fs.writeFileSync(outputPath, output, "utf8");
console.log(`Created: ${outputPath}`);
