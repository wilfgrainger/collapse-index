/**
 * Content hashing and deterministic evidence-object keys.
 *
 * Hashes are computed over the exact bytes retrieved from the source, before
 * any parsing, so that an archived payload can always be re-verified.
 */

const HEX = "0123456789abcdef";

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 15];
  }
  return out;
}

/** SHA-256 of raw bytes, as lowercase hex. */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** SHA-256 of a UTF-8 string. */
export async function sha256Text(text) {
  return sha256Hex(new TextEncoder().encode(text));
}

/**
 * Deterministic R2 key for an archived source payload.
 *
 * Convention (docs/CLOUDFLARE_PLATFORM_DESIGN.md):
 *   sources/{source_id}/{published_date}/{sha256}/{filename}
 *
 * Including the hash means an identical payload always maps to an identical
 * key, which is what makes de-duplication a pure key lookup.
 */
export function evidenceObjectKey({ sourceId, publishedDate, sha256, filename }) {
  if (!sourceId || !publishedDate || !sha256 || !filename) {
    throw new Error("evidenceObjectKey requires sourceId, publishedDate, sha256 and filename");
  }
  const safeDate = String(publishedDate).slice(0, 10);
  return `sources/${sourceId}/${safeDate}/${sha256}/${sanitiseFilename(filename)}`;
}

export function sanitiseFilename(filename) {
  return String(filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}
