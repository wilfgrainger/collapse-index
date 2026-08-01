/**
 * Generates public/data/bootstrap.json from the committed ONS fixtures.
 *
 * This is what the site serves when no database is bound. It contains real ONS
 * values with real payload hashes — not invented numbers — but it is a frozen
 * capture rather than live ingestion, and it says so in the file.
 *
 * Run: npm run generate:bootstrap
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { ONS_SOURCES, SOURCE_ROLE, sourceById } from "../src/collectors/ons/registry.js";
import { parseForSource, buildObservation } from "../src/collectors/ons/collect.js";
import { calculateSnapshot } from "../src/domain/scoring/structural.js";
import { buildEvidenceKey } from "../src/storage/r2/archive.js";
import { sha256Text } from "../src/shared/hash.js";

export const FIXTURE_RELEASE = "2026-07-live";

/** Retrieval time of the committed fixtures. */
export const CAPTURED_AT = "2026-08-01T00:00:00.000Z";

async function readFixture(source) {
  const url = new URL(`../fixtures/ons/${source.cdid.toLowerCase()}/${FIXTURE_RELEASE}.json`, import.meta.url);
  return readFile(url, "utf8");
}

/**
 * Builds a snapshot from fixtures. Exported so tests can assert the exact same
 * path the bootstrap file was generated from.
 */
export async function buildFixtureSnapshot(asOf = CAPTURED_AT) {
  const parsedBySource = new Map();
  const evidenceBySource = new Map();

  for (const source of ONS_SOURCES) {
    const text = await readFixture(source);
    const parsed = parseForSource(source, text);
    const sha256 = await sha256Text(text);

    parsedBySource.set(source.id, parsed);
    evidenceBySource.set(source.id, {
      sha256,
      retrievedAt: CAPTURED_AT,
      key: buildEvidenceKey(source, parsed.meta.releaseDate, sha256),
      byteLength: Buffer.byteLength(text, "utf8")
    });
  }

  const observations = [];
  for (const source of ONS_SOURCES) {
    if (source.role !== SOURCE_ROLE.INDICATOR) continue;

    let denominator = null;
    if (source.requiresDenominator) {
      const denominatorSource = sourceById(source.requiresDenominator);
      denominator = {
        source: denominatorSource,
        parsed: parsedBySource.get(denominatorSource.id),
        evidence: evidenceBySource.get(denominatorSource.id)
      };
    }

    const { observation } = buildObservation({
      source,
      parsed: parsedBySource.get(source.id),
      evidence: evidenceBySource.get(source.id),
      denominator
    });
    observations.push(observation);
  }

  const snapshot = calculateSnapshot({
    observations,
    sources: new Map(ONS_SOURCES.map((source) => [source.id, source])),
    asOf
  });

  return { snapshot, observations, evidenceBySource, parsedBySource };
}

async function main() {
  const { snapshot, evidenceBySource } = await buildFixtureSnapshot();

  const payload = {
    kind: "bundled-fixture-capture",
    capturedAt: CAPTURED_AT,
    note:
      "Generated from committed ONS payload fixtures, not live ingestion. Values and payload " +
      "hashes are real; the retrieval date is frozen at capture time. Bind D1 and run the " +
      "ingestion Worker for live evidence.",
    fixtureRelease: FIXTURE_RELEASE,
    evidence: [...evidenceBySource.entries()].map(([sourceId, evidence]) => ({
      sourceId,
      sha256: evidence.sha256,
      objectKey: evidence.key,
      byteLength: evidence.byteLength
    })),
    snapshot
  };

  const outputDirectory = new URL("../public/data/", import.meta.url);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(new URL("bootstrap.json", outputDirectory), `${JSON.stringify(payload, null, 2)}\n`);

  console.log(
    `Generated public/data/bootstrap.json — ${snapshot.publication.status}, ` +
    `observed pressure ${snapshot.structural.observedPressure}, ` +
    `availability ${(snapshot.structural.availableWeight * 100).toFixed(0)}%, ` +
    `confidence ${snapshot.confidence.percent}%`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
