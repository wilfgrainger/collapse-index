/**
 * Access to the committed ONS payload fixtures.
 *
 * These are unmodified responses captured from the ONS time-series API. They
 * are large because they are real; trimming them would weaken exactly the
 * properties the contract tests exist to check.
 */

import { readFile } from "node:fs/promises";
import { ONS_SOURCES } from "../../src/collectors/ons/registry.js";

export const FIXTURE_RELEASE = "2026-07-live";

export async function readFixture(cdid, release = FIXTURE_RELEASE) {
  const url = new URL(`../../fixtures/ons/${cdid.toLowerCase()}/${release}.json`, import.meta.url);
  return readFile(url, "utf8");
}

/** Maps every source's live URL to its fixture body, for the fetch double. */
export async function fixturesByUrl(release = FIXTURE_RELEASE) {
  const map = new Map();
  for (const source of ONS_SOURCES) {
    map.set(source.sourceUrl, await readFixture(source.cdid, release));
  }
  return map;
}
