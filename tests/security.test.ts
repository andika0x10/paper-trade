import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrigin, errorResponse } from "../lib/api";
import { ServiceError } from "../lib/trading/service";
test("mutations require the configured origin and JSON content type", () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://paper.example";
  try {
    assert.throws(
      () =>
        checkOrigin(
          new Request("https://paper.example/api/trade", { method: "POST" }),
        ),
      /origin/,
    );
    assert.throws(
      () =>
        checkOrigin(
          new Request("https://paper.example/api/trade", {
            method: "POST",
            headers: {
              origin: "https://evil.example",
              "content-type": "application/json",
            },
          }),
        ),
      /origin/,
    );
    assert.throws(
      () =>
        checkOrigin(
          new Request("https://paper.example/api/trade", {
            method: "POST",
            headers: {
              origin: "https://paper.example",
              "content-type": "text/plain",
            },
          }),
        ),
      /application\/json/,
    );
    assert.doesNotThrow(() =>
      checkOrigin(
        new Request("https://paper.example/api/trade", {
          method: "POST",
          headers: {
            origin: "https://paper.example",
            "content-type": "application/json",
          },
        }),
      ),
    );
  } finally {
    if (previous) process.env.BETTER_AUTH_URL = previous;
    else delete process.env.BETTER_AUTH_URL;
  }
});
test("unexpected errors do not expose SQL credentials", async () => {
  const response = errorResponse(
    new Error("mysql://root:secret-password@internal:3306/trading"),
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(
    await response.text(),
    /secret-password|mysql:\/\/|internal/,
  );
  assert.equal(errorResponse(new ServiceError("Sign in.", 401)).status, 401);
});
