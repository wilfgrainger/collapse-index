/** Safe, deterministic CSV serialisation for public evidence exports. */

const FORMULA_PREFIX = /^\s*[=+\-@]/u;
const INTEGER_TEXT = /^-?\d+$/;

function scalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Quote every non-empty cell and neutralise spreadsheet formula prefixes.
 * Numeric values remain numeric so downstream statistical tools can infer types.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  let text = scalar(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError("CSV columns must be a non-empty array");
  }
  if (!Array.isArray(rows)) throw new TypeError("CSV rows must be an array");

  const normalised = columns.map((column) =>
    typeof column === "string" ? { key: column, label: column } : column
  );
  for (const column of normalised) {
    if (!column?.key || !column?.label) throw new TypeError("CSV columns require key and label");
  }

  const lines = [normalised.map((column) => csvCell(column.label)).join(",")];
  for (const row of rows) {
    lines.push(normalised.map((column) => csvCell(row?.[column.key])).join(","));
  }

  // UTF-8 BOM keeps spreadsheet software from misreading punctuation or Welsh text.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function boundedInteger(value, fallback, { min = 1, max = 2000 } = {}) {
  const text = String(value ?? "").trim();
  if (!INTEGER_TEXT.test(text)) return fallback;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
