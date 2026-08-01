/**
 * Hardened ONS retrieval client.
 *
 * Redirects are followed manually so every hop is checked against the host
 * allow-list. The timeout remains active while the body is consumed, and the
 * body is streamed through a hard byte cap rather than buffered without limit.
 */

import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";
import { sha256Hex } from "../../shared/hash.js";

export const ALLOWED_HOSTS = Object.freeze(["www.ons.gov.uk"]);

export const CLIENT_LIMITS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 4 * 1024 * 1024,
  maxRedirects: 3,
  acceptedMimeTypes: ["application/json"]
});

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
    throw new CollectorError(FAILURE_CLASS.CONTENT_TYPE, `unexpected content type: ${mime || "none"}`, {
      url,
      contentType: String(contentType ?? "")
    });
  }
  return mime;
}

async function readLimitedBody(response, controller, url) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_LIMITS.maxBytes) {
    throw new CollectorError(FAILURE_CLASS.RESPONSE_TOO_LARGE, "declared response size exceeds the limit", {
      url,
      declaredLength,
      maxBytes: CLIENT_LIMITS.maxBytes
    });
  }

  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > CLIENT_LIMITS.maxBytes) {
      throw new CollectorError(FAILURE_CLASS.RESPONSE_TOO_LARGE, "response body exceeds the limit", {
        url,
        byteLength: buffer.byteLength,
        maxBytes: CLIENT_LIMITS.maxBytes
      });
    }
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > CLIENT_LIMITS.maxBytes) {
        controller.abort();
        throw new CollectorError(FAILURE_CLASS.RESPONSE_TOO_LARGE, "response body exceeds the limit", {
          url,
          byteLength: total,
          maxBytes: CLIENT_LIMITS.maxBytes
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchSourcePayload(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retrievedAt = new Date().toISOString();
  let current = assertAllowedUrl(rawUrl).href;

  for (let hop = 0; hop <= CLIENT_LIMITS.maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_LIMITS.timeoutMs);
    const headers = { Accept: "application/json" };
    if (hop === 0 && options.etag) headers["If-None-Match"] = options.etag;
    if (hop === 0 && options.lastModified) headers["If-Modified-Since"] = options.lastModified;

    try {
      const response = await fetchImpl(current, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        if (hop === CLIENT_LIMITS.maxRedirects) {
          throw new CollectorError(FAILURE_CLASS.TRANSPORT, "too many redirects", { url: current });
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new CollectorError(FAILURE_CLASS.TRANSPORT, "redirect without a location header", { url: current });
        }
        current = assertAllowedUrl(new URL(location, current).href).href;
        continue;
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
      const bytes = await readLimitedBody(response, controller, current);
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
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      const timedOut = controller.signal.aborted || error?.name === "AbortError";
      throw new CollectorError(
        FAILURE_CLASS.TRANSPORT,
        timedOut ? "request timed out" : `request failed: ${error?.name ?? "error"}`,
        { url: current }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new CollectorError(FAILURE_CLASS.TRANSPORT, "redirect handling failed", { url: current });
}
