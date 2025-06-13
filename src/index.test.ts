import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { verifySlackRequest } from ".";

describe("verifySlackRequest", () => {
  const SLACK_SIGNING_SECRET = "my-secret-string";
  const requestBody = { text: "Hello, world!" };
  const requestBodyString = JSON.stringify(requestBody);

  let crypto: Crypto;
  beforeAll(async () => {
    crypto = globalThis.crypto ?? (await import("node:crypto")).webcrypto;
  });

  const generateSignature = async (
    secret: string,
    timestamp: number,
    body: string,
  ): Promise<string> => {
    const baseString = `v0:${timestamp}:${body}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(baseString),
    );
    const hexString = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `v0=${hexString}`;
  };

  it("Should pass the request if the signature is valid", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateSignature(
      SLACK_SIGNING_SECRET,
      timestamp,
      requestBodyString,
    );
    const headers = new Headers({
      "x-slack-signature": signature,
      "x-slack-request-timestamp": String(timestamp),
      "Content-Type": "application/json",
    });

    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: headers,
        body: requestBodyString,
      },
      { SLACK_SIGNING_SECRET },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("Should return 500 if the signing secret is missing", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      {},
    );

    expect(res.status).toBe(500);
    expect(await res.text()).toEqual("Slack signing secret is not set");
  });

  it("Should return 400 if x-slack-signature header is missing", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const headers = new Headers({
      "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
    });
    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      },
      { SLACK_SIGNING_SECRET },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toEqual(
      "Missing Slack signature or timestamp headers",
    );
  });

  it("Should return 400 if the timestamp is stale", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 6; // 6 minutes ago
    const signature = await generateSignature(
      SLACK_SIGNING_SECRET,
      oldTimestamp,
      requestBodyString,
    );

    const headers = new Headers({
      "x-slack-signature": signature,
      "x-slack-request-timestamp": String(oldTimestamp),
      "Content-Type": "application/json",
    });

    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: headers,
        body: requestBodyString,
      },
      { SLACK_SIGNING_SECRET },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toEqual("Request timestamp is too old");
  });

  it("Should return 401 if the signature is invalid", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const headers = new Headers({
      "x-slack-signature": "v0=invalid_signature_string",
      "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
    });

    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: headers,
        body: requestBodyString,
      },
      { SLACK_SIGNING_SECRET },
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toEqual("Invalid Slack signature");
  });

  it("Should return 401 if the signing secret is invalid", async () => {
    const app = new Hono();
    app.use(verifySlackRequest());
    app.post("/slack/events", (c) => c.json({ success: true }));

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateSignature(
      SLACK_SIGNING_SECRET,
      timestamp,
      requestBodyString,
    );

    const wrongSigningSecret = "wrong-secret";
    const headers = new Headers({
      "x-slack-signature": signature,
      "x-slack-request-timestamp": String(timestamp),
      "Content-Type": "application/json",
    });

    const res = await app.request(
      "/slack/events",
      {
        method: "POST",
        headers: headers,
        body: requestBodyString,
      },
      { SLACK_SIGNING_SECRET: wrongSigningSecret },
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toEqual("Invalid Slack signature");
  });
});
