/**
 * Immutable evidence archive (WP3).
 *
 * Every byte an observation was derived from is stored under a key that
 * contains its own hash, so the archive is content-addressed: an unchanged
 * source re-fetched tomorrow resolves to the key already present and is not
 * uploaded again.
 *
 * Objects are private. Nothing here serves public downloads; exposure is a
 * separate, licence-checked decision.
 */

import { evidenceObjectKey } from "../../shared/hash.js";
import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";

/** Filename recorded inside the key, derived from the exact series. */
export function evidenceFilename(source) {
  return `${source.cdid.toLowerCase()}-${source.datasetId.toLowerCase()}.json`;
}

export function buildEvidenceKey(source, publishedAt, sha256) {
  return evidenceObjectKey({
    sourceId: source.id,
    publishedDate: publishedAt,
    sha256,
    filename: evidenceFilename(source)
  });
}

/**
 * Archives a payload unless an identical hash is already stored.
 *
 * @param {object} bucket R2 binding, or null when archiving is unavailable
 * @param {object} input { source, payload, publishedAt, alreadyArchived }
 * @returns {Promise<{ key: string, uploaded: boolean, deduped: boolean }>}
 */
export async function archiveEvidence(bucket, { source, payload, publishedAt, alreadyArchived = false }) {
  const key = buildEvidenceKey(source, publishedAt, payload.sha256);

  if (!bucket) {
    // Archiving is required for verified observations; the caller decides
    // whether to degrade. Surfacing it as a typed failure keeps that explicit.
    throw new CollectorError(FAILURE_CLASS.STORAGE, "no evidence bucket is bound", { sourceId: source.id });
  }

  if (alreadyArchived) {
    return { key, uploaded: false, deduped: true };
  }

  // Content-addressed: if the key exists, the bytes are identical by definition.
  const existing = await bucket.head(key);
  if (existing) {
    return { key, uploaded: false, deduped: true };
  }

  await bucket.put(key, payload.bytes, {
    httpMetadata: { contentType: payload.mime },
    customMetadata: {
      sourceId: source.id,
      cdid: source.cdid,
      datasetId: source.datasetId,
      sha256: payload.sha256,
      publishedAt: String(publishedAt),
      retrievedAt: payload.retrievedAt,
      sourceUrl: source.sourceUrl,
      licence: source.licence
    }
  });

  return { key, uploaded: true, deduped: false };
}

/** Retrieves archived bytes so an observation can be reproduced from evidence. */
export async function readEvidence(bucket, key) {
  if (!bucket) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return {
    key,
    text: await object.text(),
    size: object.size,
    uploaded: object.uploaded
  };
}
