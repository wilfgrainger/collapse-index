/**
 * ONS retrieval client (WP4).
 *
 * Hardened deliberately: this is the only component that talks to the open
 * internet, and it runs on a schedule with write access to the evidence store.
 * Redirects are followed manually so that every hop is re-checked against the
 * host allow-list — a source that redirects off ons.gov.uk is a failure, not a
 * fetch to follow.
 *
 * The bytes returned here are the bytes that get hashed, archived AND parsed,
 * so an archived payload can always reproduce its own observation.
 */

import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";
import { sha256Hex } from "../../shared/hash.js";

/** Exact hosts this project is permitted to retrieve evidence from. */
export const ALLOWED_HOSTS = Object.freeze(["www.ons.gov.uk"]);

export const CLIENT_LIMITS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 4 * 1024 * 1024,
  maxRedirects: 3,
  acceptedMimeTypes: ["application/json"]
});

/**
 * Rejects any URL that is not HTTPS on an allow-listed host.
 * Exported so redirect handling and tests share one rule.
 */
export function assertAllowedUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CollectorError(FAILURE_CLASS.DISALLOWED_HOST, "malformed source url", { url: String(rawUrl) });
  }

  if (url.protocol !== "https:") {
    throw new CollectorError(FAILURE_CLASS.DISALLOWED_HOST, "source urls must use https", { url: url.href });
  }
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    throw new CollectorError(FAILURE_CLASS.DISALLOWED_HOST, `host not on the allow-list: ${url.hostname}`, {
      url: url.href,
      allowed: ALLOWED_HOSTS
    });
  }
  return url;
}

function assertAcceptedMime(contentType, url) {
  const mime = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!CLIENT_LIMITS.acceptedMimeTypes.includes(mime)) {
    // An HTML error page is the classic failure mode: it returns 200 and would
    // parse as "something" if we were careless. It must never become data.
    throw new CollectorError(FAILURE_CLASS.CONTENT_TYPE, `unexpected content type: ${mime || "none"}`, {
      url,
      contentType: String(contentType ?? "")
    });
  }
  return mime;
}

/**
 * Retrieves a source payload with timeout, size, MIME and redirect controls.
 *
 * @param {string} rawUrl
 * @param {object} options
 * @param {string} [options.etag] previous ETag for a conditional request
 * @param {string} [options.lastModified] previous Last-Modified value
 * @param {typeof fetch} [options.fetchImpl] injectable for tests
 * @returns {Promise<{ notModified: boolean, bytes?: Uint8Array, text?: string, sha256?: string, mime?: string, byteLength?: number, etag?: string|null, lastModified?: string|null, retrievedAt: string, finalUrl?: string }>}
 */
export async function fetchSourcePayload(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retrievedAt = new Date().toISOString();

  let current = assertAllowedUrl(rawUrl).href;
  let response;

  for (let hop = 0; hop <= CLIENT_LIMITS.maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_LIMITS.timeoutMs);

    const headers = { Accept: "application/json" };
    if (hop === 0 && options.etag) headers["If-None-Match"] = options.etag;
    if (hop === 0 && options.lastModified) headers["If-Modified-Since"] = options.lastModified;

    try {
      response = await fetchImpl(current, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal
      });
    } catch (error) {
      throw new CollectorError(FAILURE_CLASS.TRANSPORT, `request failed: ${error?.name ?? "error"}`, { url: current });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new CollectorError(FAILURE_CLASS.TRANSPORT, "redirect without a location header", { url: current });
      }
      // Re-validate every hop against the allow-list.
      current = assertAllowedUrl(new URL(location, current).href).href;
      continue;
    }
    break;
  }

  if (response.status >= 300 && response.status < 400) {
    throw new CollectorError(FAILURE_CLASS.TRANSPORT, "too many redirects", { url: current });
  }

  if (response.status === 304) {
    return { notModified: true, retrievedAt, finalUrl: current };
  }

  if (!response.ok) {
    throw new CollectorError(FAILURE_CLASS.HTTP_STATUS, `source returned HTTP ${response.status}`, {
      url: current,
      status: response.status
    });
  }

  const mime = assertAcceptedMime(response.headers.get("content-type"), current);

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_LIMITS.maxBytes) {
    throw new CollectorError(FAILURE_CLASS.RESPONSE_TOO_LARGE, "declared response size exceeds the limit", {
      url: current,
      declaredLength,
      maxBytes: CLIENT_LIMITS.maxBytes
    });
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > CLIENT_LIMITS.maxBytes) {
    throw new CollectorError(FAILURE_CLASS.RESPONSE_TOO_LARGE, "response body exceeds the limit", {
      url: current,
      byteLength: buffer.byteLength,
      maxBytes: CLIENT_LIMITS.maxBytes
    });
  }

  const bytes = new Uint8Array(buffer);
  const sha256 = await sha256Hex(bytes);

  return {
    notModified: false,
    bytes,
    text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
    sha256,
    mime,
    byteLength: bytes.byteLength,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    retrievedAt,
    finalUrl: current
  };
}
