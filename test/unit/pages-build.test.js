/** The static GitHub Pages build: base-path rewriting and honest bootstrap provenance. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { API_ROUTES, buildPages, rewriteHtml } from "../../scripts/build-pages.mjs";

const ORIGIN = "https://owner.github.io";
const BASE = "/collapse-index";

async function build() {
  const outDir = await mkdtemp(join(tmpdir(), "pages-"));
  const result = await buildPages({ outDir, base: BASE, origin: ORIGIN });
  return { outDir, result, read: (path) => readFile(join(outDir, path), "utf8") };
}

test("root-relative links gain the base path; fragments and external links do not", () => {
  const html = '<html lang="en-GB"><a href="/history">h</a><a href="#main">s</a><a href="https://x.test/">e</a><script src="/app.js"></script>';
  const out = rewriteHtml(html, BASE);
  assert.match(out, /<html lang="en-GB" data-base="\/collapse-index">/);
  assert.match(out, /href="\/collapse-index\/history"/);
  assert.match(out, /src="\/collapse-index\/app\.js"/);
  assert.match(out, /href="#main"/);
  assert.match(out, /href="https:\/\/x\.test\/"/);
  assert.equal(rewriteHtml(html, ""), html, "no base leaves the Worker site untouched");
});

test("the build freezes every API route and labels the data as a frozen capture", async () => {
  const { outDir, result, read } = await build();
  try {
    assert.equal(result.written.length, API_ROUTES.length);
    const current = JSON.parse(await read("api/v1/current"));
    assert.equal(current.provenance.kind, "frozen-capture");
    assert.equal(current.provenance.store, "bundled-fixture-capture");
    assert.equal(current.publication.status, "suppressed");

    const history = JSON.parse(await read("api/v1/history"));
    assert.deepEqual(history.points, [], "fixtures are never presented as history");
    const observations = JSON.parse(await read("api/v1/exports/observations.json"));
    assert.equal(observations.error, "canonical_history_unavailable");

    const manifest = JSON.parse(await read("api/v1/exports/manifest.json"));
    assert.equal(manifest.exports.currentCsv, `${ORIGIN}${BASE}/api/v1/exports/current.csv`);

    const page = await read("index.html");
    assert.match(page, /data-base="\/collapse-index"/);
    assert.doesNotMatch(page, /\b(?:href|src)="\/(?!collapse-index\/|\/)/, "no unprefixed root link remains");
    assert.equal(JSON.parse(await read("manifest.webmanifest")).start_url, `${BASE}/`);
    assert.equal(await read(".nojekyll"), "");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
