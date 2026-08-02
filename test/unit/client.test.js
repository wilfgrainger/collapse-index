import test from "node:test";
import assert from "node:assert/strict";

import { CLIENT_LIMITS, fetchSourcePayload } from "../../src/collectors/ons/client.js";

const URL = "https://www.ons.gov.uk/example/data";

test("streaming responses are stopped at the hard byte limit", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 5; i += 1) controller.enqueue(chunk);
      controller.close();
    }
  });

  await assert.rejects(
    fetchSourcePayload(URL, {
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }),
    (error) => {
      assert.equal(error.failureClass, "response_too_large");
      assert.ok(error.details.byteLength > CLIENT_LIMITS.maxBytes);
      return true;
    }
  );
});

test("declared oversized responses are rejected from their headers", async () => {
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([123, 125]));
      controller.close();
    }
  });

  await assert.rejects(
    fetchSourcePayload(URL, {
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(CLIENT_LIMITS.maxBytes + 1)
        }
      })
    }),
    (error) => {
      assert.equal(error.failureClass, "response_too_large");
      assert.equal(error.details.declaredLength, CLIENT_LIMITS.maxBytes + 1);
      return true;
    }
  );
});

test("a redirect off the ONS allow-list is rejected", async () => {
  await assert.rejects(
    fetchSourcePayload(URL, {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: "https://example.com/payload.json" }
      })
    }),
    (error) => error.failureClass === "disallowed_host"
  );
});
