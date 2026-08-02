/**
 * Test doubles for Cloudflare bindings.
 *
 * The D1 double runs real migration SQL against Node's built-in SQLite. D1
 * supports numbered positional parameters (`?1`, `?2`), while node:sqlite's
 * positional API accepts anonymous `?` placeholders. The adapter below
 * translates the syntax and preserves the numbered binding order.
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

function compileD1Parameters(sql, args) {
  const ordered = [];
  let foundNumbered = false;
  const compiledSql = sql.replace(/\?(\d+)/g, (_match, rawIndex) => {
    foundNumbered = true;
    const index = Number(rawIndex) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= args.length) {
      throw new RangeError(`D1 parameter ?${rawIndex} has no bound value`);
    }
    ordered.push(args[index]);
    return "?";
  });

  return {
    sql: compiledSql,
    args: foundNumbered ? ordered : args
  };
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

  compiled() {
    return compileD1Parameters(this.sql, this.args);
  }

  async run() {
    const compiled = this.compiled();
    const result = this.db.prepare(compiled.sql).run(...compiled.args);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }

  async first() {
    const compiled = this.compiled();
    return plain(this.db.prepare(compiled.sql).get(...compiled.args));
  }

  async all() {
    const compiled = this.compiled();
    return { results: this.db.prepare(compiled.sql).all(...compiled.args).map(plain) };
  }
}

async function migrationFiles() {
  return (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
}

export async function applyTestMigration(database, file) {
  const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
  database._raw.exec(sql);
  database._migrationsApplied.push(file);
}

/**
 * Applies migrations from empty, optionally stopping after one named file so a
 * test can populate an older schema and prove the next migration preserves it.
 */
export async function createTestDatabase({ through = null } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const allFiles = await migrationFiles();
  const selected = through
    ? allFiles.slice(0, allFiles.indexOf(through) + 1)
    : allFiles;
  if (through && !selected.includes(through)) {
    throw new Error(`unknown migration: ${through}`);
  }

  const wrapper = {
    _raw: db,
    _migrationsApplied: [],
    prepare(sql) {
      return new TestStatement(db, sql);
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };

  for (const file of selected) await applyTestMigration(wrapper, file);
  return wrapper;
}

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
