/**
 * Syntax check across every source file.
 *
 * Replaces the previous hand-maintained list of `node --check` calls, which
 * silently stopped covering new files as the tree grew.
 */

import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative } from "node:path";

const run = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname;
const ROOTS = ["src", "scripts", "test", "public"];
const SKIP = new Set(["node_modules", ".wrangler", "data"]);

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      yield path;
    }
  }
}

const failures = [];
let checked = 0;

for (const root of ROOTS) {
  for await (const file of walk(join(ROOT, root))) {
    checked += 1;
    try {
      await run(process.execPath, ["--check", file]);
    } catch (error) {
      failures.push(`${relative(ROOT, file)}\n${error.stderr ?? error.message}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Syntax errors in ${failures.length} file(s):\n\n${failures.join("\n\n")}`);
  process.exit(1);
}

console.log(`Syntax OK: ${checked} files`);
