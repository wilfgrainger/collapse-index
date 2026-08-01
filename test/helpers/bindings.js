/**
 * Test doubles for the Cloudflare bindings.
 *
 * The D1 double runs the real migration SQL against Node's built-in SQLite, so
 * schema constraints, foreign keys, CHECK clauses and UNIQUE-based idempotency
 * are genuinely exercised rather than mocked away. If a migration is invalid,
 * these tests fail before Wrangler ever sees it.
 */

import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url).pathname;

function normaliseArgument(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string" || value instanceof Uint8Array) return value;
  return String(value);
}

function plain(row) {
  return row ? { ...row } : null;
}

class TestStatement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new TestStatement(this.db, this.sql, args.map(normaliseArgument));
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }

  async first() {
    return plain(this.db.prepare(this.sql).get(...this.args));
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args).map(plain) };
  }
}

/** Applies every migration in order, from an empty database. */
export async function createTestDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    db.exec(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    _raw: db,
    _migrationsApplied: files,
    prepare(sql) {
      return new TestStatement(db, sql);
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };
}

/** In-memory R2 double with the subset of the API the archive uses. */
export function createTestBucket() {
  const objects = new Map();
  return {
    _objects: objects,
    async head(key) {
      const object = objects.get(key);
      return object ? { key, size: object.bytes.byteLength, uploaded: object.uploaded } : null;
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        key,
        size: object.bytes.byteLength,
        uploaded: object.uploaded,
        async text() {
          return new TextDecoder().decode(object.bytes);
        }
      };
    },
    async put(key, bytes, options = {}) {
      objects.set(key, { bytes, uploaded: new Date(), options });
      return { key };
    }
  };
}

/**
 * A fetch double that serves the committed fixtures by URL.
 *
 * `overrides` lets a test make one source fail without affecting the others,
 * which is how per-source failure isolation is proven.
 */
export function createFixtureFetch(fixturesByUrl, overrides = {}) {
  return async function fixtureFetch(url) {
    const key = String(url);

    if (overrides[key]) {
      const override = overrides[key];
      if (override.throw) throw new Error(override.throw);
      return new Response(override.body ?? "", {
        status: override.status ?? 200,
        headers: override.headers ?? { "content-type": "application/json" }
      });
    }

    const body = fixturesByUrl.get(key);
    if (!body) {
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json;charset=utf-8",
        etag: `"fixture-${key.length}"`
      }
    });
  };
}
