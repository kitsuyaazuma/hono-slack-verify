import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

type VerifySlackRequestMiddlewareEnv = {
  SLACK_SIGNING_SECRET: string;
};

const fromHexStringToBytes = (hexString: string): Uint8Array => {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let idx = 0; idx < hexString.length; idx += 2) {
    bytes[idx / 2] = parseInt(hexString.substring(idx, idx + 2), 16);
  }
  return bytes;
};

export const verifySlackRequest = () => {
  return createMiddleware<{
    Bindings: VerifySlackRequestMiddlewareEnv;
  }>(async (c, next) => {
    const signingSecret = c.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      throw new HTTPException(500, {
        message: "SLACK_SIGNING_SECRET is not set",
      });
    }

    const signatureHeader = c.req.header("x-slack-signature");
    const timestampHeader = c.req.header("x-slack-request-timestamp");
    const body = await c.req.text();

    if (!signatureHeader || !timestampHeader) {
      throw new HTTPException(400, {
        message: "Missing Slack signature or timestamp headers",
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const timestamp = parseInt(timestampHeader, 10);
    if (Math.abs(now - timestamp) > 60 * 5) {
      throw new HTTPException(400, { message: "Request timestamp is too old" });
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const baseString = `v0:${timestampHeader}:${body}`;
    const signatureBytes = fromHexStringToBytes(signatureHeader.substring(3));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(baseString),
    );
    if (!isValid) {
      throw new HTTPException(400, { message: "Invalid Slack signature" });
    }

    await next();
  });
};
