import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const INDEX = new URL("../../public/index.html", import.meta.url);
const CSS = new URL("../../public/downloads.css", import.meta.url);

test("the public page links every evidence export and its stylesheet", async () => {
  const html = await readFile(INDEX, "utf8");

  assert.match(html, /href="\/downloads\.css"/);
  assert.match(html, /id="downloads"/);
  for (const path of [
    "/api/v1/exports/current.csv",
    "/api/v1/exports/observations.csv",
    "/api/v1/exports/observations.json",
    "/api/v1/exports/snapshots.csv",
    "/api/v1/exports/snapshots.json",
    "/api/v1/exports/manifest.json"
  ]) {
    assert.ok(html.includes(path), path);
  }
  assert.match(html, /<noscript>[\s\S]*\/api\/v1\/exports\/current\.csv[\s\S]*<\/noscript>/);
});

test("download centre styles collapse to one column and preserve focus visibility", async () => {
  const css = await readFile(CSS, "utf8");
  assert.match(css, /\.download-grid\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /:focus-visible/);
});
