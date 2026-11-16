/** Static contract for the public website: CSP-safe markup, shared chrome, no broken internal links. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";

import { PAGES, syncPage } from "../../scripts/sync-chrome.mjs";
import { SITE_PAGES } from "../../src/web/index.js";

const PUBLIC = new URL("../../public/", import.meta.url);
const read = (name) => readFile(new URL(name, PUBLIC), "utf8");

test("every page carries the shared header, navigation and footer", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    assert.equal(syncPage(page, html), html, `${page} has drifted; run node scripts/sync-chrome.mjs`);
  }
});

test("no page relies on inline styles or scripts that the CSP blocks", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    assert.doesNotMatch(html, /<style[\s>]/i, `${page} has an inline <style>`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${page} has a style attribute`);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, `${page} has an inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${page} has an inline event handler`);
  }
});

test("every page has the accessibility and metadata baseline", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    assert.match(html, /<html lang="en-GB">/, page);
    assert.match(html, /<title>[^<]+<\/title>/, page);
    assert.match(html, /<meta name="description" content="[^"]+">/, page);
    assert.match(html, /<meta name="viewport"/, page);
    assert.match(html, /<main[^>]*id="main"/, page);
    assert.match(html, /class="skip-link" href="#main"/, page);
    assert.match(html, /<nav aria-label="Primary navigation">/, page);
    assert.match(html, /href="\/styles\.css"/, page);
  }
});

test("internal links and scripts resolve to committed files or known routes", async () => {
  const files = new Set(await readdir(PUBLIC));
  for (const page of PAGES) {
    const html = await read(page);
    for (const [, target] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      if (target === "/" || target.startsWith("/api/v1/")) continue;
      // Cloudflare asset html_handling serves /history from history.html.
      const name = target.slice(1);
      assert.ok(files.has(name) || files.has(`${name}.html`), `${page} links to missing ${target}`);
      assert.ok(!name.endsWith(".html"), `${page} links to ${target}; use the clean URL to avoid a redirect`);
    }
  }
});

test("page scripts never write HTML strings or style attributes", async () => {
  for (const name of (await readdir(PUBLIC)).filter((file) => file.endsWith(".js"))) {
    const source = await read(name);
    assert.doesNotMatch(source, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/, `${name} writes HTML`);
    assert.doesNotMatch(source, /setAttribute\(\s*["']style["']/, `${name} sets a style attribute`);
  }
});

test("the sitemap lists every human page that exists", async () => {
  for (const page of SITE_PAGES) {
    const file = page === "/" ? "index.html" : `${page.slice(1).split("?")[0]}.html`;
    await access(new URL(file, PUBLIC));
  }
});
