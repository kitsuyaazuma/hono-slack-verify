# Slack Request Verification Middleware for Hono

[![npm version](https://badge.fury.io/js/@kitsuyaazuma%2Fhono-slack-verify.svg)](https://badge.fury.io/js/@kitsuyaazuma%2Fhono-slack-verify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is a middleware for [Hono](https://hono.dev) that verifies incoming requests from Slack. It ensures that requests genuinely originate from Slack by validating their signatures, as per [Slack's request verification guidelines](https://api.slack.com/authentication/verifying-requests-from-slack).

This middleware helps protect your application from replay attacks and forged requests.

## Installation

You can install this middleware via npm, pnpm, or yarn:

```bash
# npm
npm install @kitsuyaazuma/hono-slack-verify

# pnpm
pnpm add @kitsuyaazuma/hono-slack-verify

# yarn
yarn add @kitsuyaazuma/hono-slack-verify
```

## Configuration

Before using the middleware, you must set the following environment variable:

- `SLACK_SIGNING_SECRET`: Your Slack app's signing secret. You can find this in your Slack app's "Basic Information" page.

  ```plain
  SLACK_SIGNING_SECRET="your_slack_signing_secret_here"
  ```

The middleware will read this environment variable from `c.env.SLACK_SIGNING_SECRET`.

## How to Use

Import `verifySlackRequest` from `@kitsuyaazuma/hono-slack-verify` and use it in your Hono application.

```typescript
import { Hono } from "hono";
import { verifySlackRequest } from "@kitsuyaazuma/hono-slack-verify";

const app = new Hono<{ Bindings: { SLACK_SIGNING_SECRET: string } }>();

// Apply the middleware to all routes or specific routes
app.use("*", verifySlackRequest());

app.post("/slack/events", async (c) => {
  // If the request is verified, this handler will be executed.
  // The raw body is available if needed, but typically you'd parse it as JSON.
  const payload = await c.req.json();
  console.log("Received Slack event:", payload);
  // Process the Slack event...
  return c.json({ message: "Event received" });
});

app.onError((err, c) => {
  console.error(`${err}`);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.text("Internal Server Error", 500);
});

export default app;
```

### Explanation:

1.  **Import `verifySlackRequest`**: Get the middleware function.
2.  **Initialize Hono App**: Ensure your Hono app's Bindings type includes `SLACK_SIGNING_SECRET`.
3.  **Apply Middleware**: Use `app.use()` to apply the `verifySlackRequest()` middleware. You can apply it to all routes (`'*'`) or specific Slack-facing routes.
4.  **Request Handling**: If the request signature is valid and the timestamp is recent, your route handler will be executed. Otherwise, the middleware will throw an `HTTPException` (e.g., 400 for bad request, 401 for unauthorized).
5.  **Error Handling**: It's good practice to have a global error handler (`app.onError`) to catch and respond to these exceptions appropriately.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
