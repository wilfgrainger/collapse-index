/**
 * Builds a static GitHub Pages preview of the public site.
 *
 * GitHub Pages cannot run the public Worker, so this script runs the real
 * Worker once, in explicit bootstrap mode, and freezes each read-only API
 * response into a file. The result is the committed ONS fixture capture,
 * labelled "frozen capture" by the same provenance the Worker always attaches.
 * It never presents fixtures as live data or as canonical history: the history
 * and observation/snapshot exports return exactly what bootstrap mode returns
 * (empty or unavailable).
 *
 *   node scripts/build-pages.mjs [outDir] [--base=/collapse-index] [--origin=https://owner.github.io]
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import worker from "../src/web/index.js";
import { INDICATORS } from "../src/domain/methodology/v1.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

/** Static-asset binding backed by public/, as Workers Static Assets would serve it. */
const ASSETS = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    try {
      return new Response(await readFile(join(PUBLIC, path)), {
        headers: { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
};

export const API_ROUTES = Object.freeze([
  "current",
  "history",
  "evidence-health",
  "methodology",
  "sources",
  "health",
  "openapi.json",
  ...INDICATORS.map((indicator) => `indicators/${indicator.id}`),
  "exports/manifest.json",
  "exports/current.csv",
  "exports/observations.json",
  "exports/observations.csv",
  "exports/snapshots.json",
  "exports/snapshots.csv"
]);

function normaliseBase(base) {
  const trimmed = (base ?? "").trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  if (!/^\/[A-Za-z0-9._\-/]+$/.test(trimmed)) throw new Error(`invalid base path: ${base}`);
  return trimmed;
}

/** Prefixes root-relative href/src attributes and marks the document's base. */
export function rewriteHtml(html, base) {
  if (!base) return html;
  return html
    .replace(/<html lang="en-GB">/, `<html lang="en-GB" data-base="${base}">`)
    .replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`);
}

export async function buildPages({ outDir, base = "", origin = "https://example.github.io" } = {}) {
  base = normaliseBase(base);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 1. Static files, with root-relative links rewritten for the base path.
  for (const name of await readdir(PUBLIC, { recursive: true })) {
    const from = join(PUBLIC, name);
    const to = join(outDir, name);
    if (name.endsWith(".html")) {
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, rewriteHtml(await readFile(from, "utf8"), base));
    } else if (name.endsWith(".webmanifest")) {
      const manifest = JSON.parse(await readFile(from, "utf8"));
      manifest.start_url = `${base}/`;
      manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `${base}${icon.src}` }));
      await writeFile(to, `${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      await cp(from, to, { recursive: true });
    }
  }

  // 2. Freeze each read-only API response from the real Worker in bootstrap mode.
  const env = { ASSETS, BOOTSTRAP_MODE: "enabled", GIT_SHA: process.env.GITHUB_SHA ?? "unknown" };
  const written = [];
  for (const route of API_ROUTES) {
    const response = await worker.fetch(new Request(`${origin}/api/v1/${route}`), env);
    let body = await response.text();
    // Absolute links generated from the request origin must include the base path.
    body = body.replaceAll(`${origin}/api/v1/`, `${origin}${base}/api/v1/`);
    const target = join(outDir, "api", "v1", route);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    written.push({ route, status: response.status });
  }

  // 3. GitHub Pages must not run Jekyll over the output.
  await writeFile(join(outDir, ".nojekyll"), "");
  return { outDir, base, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const outDir = args.find((arg) => !arg.startsWith("--")) ?? join(ROOT, "dist", "pages");
  const result = await buildPages({ outDir, base: flag("base") ?? "", origin: flag("origin") ?? "https://example.github.io" });
  for (const { route, status } of result.written) console.log(`${status} /api/v1/${route}`);
  console.log(`built ${result.outDir} (base "${result.base || "/"}")`);
}
