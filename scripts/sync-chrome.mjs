/**
 * Keeps the shared header, navigation and footer identical across every
 * static page. There is no build step: the committed HTML is what is served,
 * and `--check` (run by the test suite) fails if any page has drifted.
 *
 *   node scripts/sync-chrome.mjs          rewrite pages in place
 *   node scripts/sync-chrome.mjs --check  exit 1 if any page differs
 */

import { readFile, writeFile } from "node:fs/promises";

const PUBLIC = new URL("../public/", import.meta.url);

export const PAGES = ["index.html", "methodology.html", "indicator.html", "history.html", "evidence.html", "about.html", "404.html"];

export const NAV = [
  ["/#indicators", "Indicators", null],
  ["/history", "History", "history.html"],
  ["/evidence", "Evidence", "evidence.html"],
  ["/#downloads", "Downloads", null],
  ["/methodology", "Methodology", "methodology.html"],
  ["/about", "About", "about.html"]
];

export const FOOTER_LINKS = [
  ["/methodology", "Methodology"],
  ["/evidence", "Evidence health"],
  ["/history", "History"],
  ["/about#corrections", "Corrections policy"],
  ["/api/v1/exports/manifest.json", "Download data"],
  ["/api/v1/openapi.json", "API"],
  ["https://github.com/wilfgrainger/collapse-index", "Source code"]
];

export function header(page) {
  const links = NAV.map(([href, label, key]) =>
    `        <a href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}</a>`).join("\n");
  return `<header class="site-header">
    <div class="shell header-inner">
      <a class="brand" href="/" aria-label="UK Stability Monitor home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>
          <strong>UK Stability Monitor</strong>
          <small>Evidence build · alpha</small>
        </span>
      </a>
      <nav aria-label="Primary navigation">
${links}
      </nav>
    </div>
  </header>`;
}

export function footer() {
  const links = FOOTER_LINKS.map(([href, label]) => `        <a href="${href}">${label}</a>`).join("\n");
  return `<footer class="site-footer">
    <div class="shell footer-inner">
      <div>
        <strong>UK Stability Monitor</strong>
        <p>
          An open methodology experiment in public-interest data communication. This measures pressure;
          it does not predict state failure. Contains public sector information licensed under the Open
          Government Licence v3.0.
        </p>
      </div>
      <div class="footer-links">
${links}
      </div>
    </div>
  </footer>`;
}

export function syncPage(page, html) {
  let out = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, header(page));
  if (/<footer class="site-footer">/.test(out)) out = out.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, footer());
  else out = out.replace(/<\/main>/, `</main>\n  ${footer()}`);
  if (!out.includes('class="skip-link"')) out = out.replace(/<body>/, '<body>\n  <a class="skip-link" href="#main">Skip to content</a>');
  return out;
}

async function main() {
  const check = process.argv.includes("--check");
  const drifted = [];
  for (const page of PAGES) {
    const url = new URL(page, PUBLIC);
    const html = await readFile(url, "utf8");
    const synced = syncPage(page, html);
    if (synced === html) continue;
    drifted.push(page);
    if (!check) await writeFile(url, synced);
  }
  if (check && drifted.length) {
    console.error(`Shared chrome is out of date in: ${drifted.join(", ")}. Run node scripts/sync-chrome.mjs`);
    process.exit(1);
  }
  if (!check) console.log(drifted.length ? `synced ${drifted.join(", ")}` : "all pages in sync");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
