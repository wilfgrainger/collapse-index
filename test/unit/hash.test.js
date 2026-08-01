import test from "node:test";
import assert from "node:assert/strict";

import { evidenceObjectKey, sanitiseFilename, sha256Hex, sha256Text } from "../../src/shared/hash.js";
import { buildEvidenceKey, evidenceFilename } from "../../src/storage/r2/archive.js";
import { sourceById } from "../../src/collectors/ons/registry.js";
import { readFixture } from "../helpers/fixtures.js";

test("sha256 matches known vectors", async () => {
  assert.equal(
    await sha256Text(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  assert.equal(
    await sha256Text("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("hashing is byte-based, not string-based", async () => {
  const bytes = new Uint8Array([0xe2, 0x82, 0xac]); // euro sign in UTF-8
  assert.equal(await sha256Hex(bytes), await sha256Text("€"));
});

test("identical fixture bytes hash identically across calls", async () => {
  const text = await readFixture("D7G7");
  const first = await sha256Text(text);
  const second = await sha256Text(text);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("a one-byte change produces a different hash", async () => {
  const text = await readFixture("N3Y6");
  assert.notEqual(await sha256Text(text), await sha256Text(`${text} `));
});

test("evidence keys are deterministic and content-addressed", () => {
  const key = evidenceObjectKey({
    sourceId: "ons-d7g7",
    publishedDate: "2026-07-21T23:00:00.000Z",
    sha256: "c".repeat(64),
    filename: "d7g7-mm23.json"
  });
  assert.equal(key, `sources/ons-d7g7/2026-07-21/${"c".repeat(64)}/d7g7-mm23.json`);
  assert.ok(!key.includes("T23:00"), "the timestamp is truncated to a date");
});

test("evidence keys require every component", () => {
  assert.throws(() => evidenceObjectKey({ sourceId: "x", publishedDate: "2026-01-01", sha256: "a" }), /requires/);
  assert.throws(() => evidenceObjectKey({}), /requires/);
});

test("filenames are sanitised against traversal and separators", () => {
  assert.equal(sanitiseFilename("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitiseFilename("a b/c.json"), "a_b_c.json");
  assert.equal(sanitiseFilename("ok-name_1.json"), "ok-name_1.json");
});

test("the archive key derives from the exact series identifiers", () => {
  const source = sourceById("ons-bbfw");
  assert.equal(evidenceFilename(source), "bbfw-lms.json");

  const key = buildEvidenceKey(source, "2026-07-20T23:00:00.000Z", "f".repeat(64));
  assert.equal(key, `sources/ons-bbfw/2026-07-20/${"f".repeat(64)}/bbfw-lms.json`);
});
