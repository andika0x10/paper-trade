import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailConfigurationIssue,
  emailFailureReason,
  sendVerificationEmail,
  withEmailDeliveryStatus,
  SIGNUP_EMAIL_FAILURE,
} from "../lib/verification-email";

test("verification rejects example senders before contacting Resend", () => {
  assert.match(
    emailConfigurationIssue({
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Paper Trade <verify@your-verified-domain.com>",
    })!,
    /example domain/,
  );
  assert.match(
    emailConfigurationIssue({ EMAIL_FROM: "verify@paper.example" })!,
    /RESEND_API_KEY/,
  );
  assert.equal(
    emailConfigurationIssue({
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Paper Trade <verify@paper.example>",
    }),
    undefined,
  );
});
test("provider errors have actionable diagnostics without exposing recipients", () => {
  assert.match(
    emailFailureReason({ message: "The domain is not verified" }),
    /domain is not verified/,
  );
  assert.match(
    emailFailureReason({
      message: "You can only send testing emails to your own email address",
    }),
    /test senders/,
  );
  assert.match(
    emailFailureReason({ name: "restricted_api_key" }),
    /permissions/,
  );
  assert.match(emailFailureReason({ statusCode: 401 }), /API key/);
  assert.match(emailFailureReason({ statusCode: 429 }), /rate-limited/);
});
test("failed delivery cannot turn a successful signup into a false sent confirmation", async (t) => {
  const previous = {
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = "re_test_do_not_send";
  process.env.EMAIL_FROM = "Paper <verify@paper.example>";
  t.after(() => {
    if (previous.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
  });
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.to === "blocked@paper.example")
        return Response.json(
          { name: "validation_error", message: "The domain is not verified" },
          { status: 403 },
        );
      return Response.json({ id: "accepted-test-message" });
    },
  );
  const request = new Request("http://localhost/api/auth/sign-up/email", {
    method: "POST",
  });
  const run = (email: string) =>
    withEmailDeliveryStatus(request, async () => {
      // The installed Better Auth awaits the callback but swallows its error.
      try {
        await sendVerificationEmail(
          { email },
          "http://localhost/verify?token=private-test-token",
        );
      } catch {}
      return Response.json({ user: { id: "created-user" } });
    });
  const [failed, accepted] = await Promise.all([
    run("blocked@paper.example"),
    run("accepted@paper.example"),
  ]);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, SIGNUP_EMAIL_FAILURE);
  assert.equal(accepted.status, 200);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /blocked@|accepted@|private-test-token|re_test_do_not_send/,
  );
  const retry = await withEmailDeliveryStatus(
    new Request("http://localhost/api/auth/send-verification-email"),
    async () => {
      try {
        await sendVerificationEmail(
          { email: "blocked@paper.example" },
          "http://localhost/verify",
        );
      } catch {}
      return Response.json({ status: true });
    },
  );
  assert.equal(retry.status, 503);
  assert.equal((await retry.json()).code, "VERIFICATION_EMAIL_FAILED");
});
