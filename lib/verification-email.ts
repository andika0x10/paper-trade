import { AsyncLocalStorage } from "node:async_hooks";
import { Resend } from "resend";

type DeliveryResult = { failed: boolean };
const deliveries = new AsyncLocalStorage<DeliveryResult>();
export const EMAIL_FAILURE = "VERIFICATION_EMAIL_FAILED";
export const SIGNUP_EMAIL_FAILURE = "VERIFICATION_EMAIL_FAILED_AFTER_SIGNUP";

export function emailConfigurationIssue(
  env: { RESEND_API_KEY?: string; EMAIL_FROM?: string } = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  },
): string | undefined {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    return "Set RESEND_API_KEY and EMAIL_FROM to enable email verification.";
  if (!env.RESEND_API_KEY.startsWith("re_"))
    return "RESEND_API_KEY does not have the expected Resend key format.";
  const address = env.EMAIL_FROM.match(
    /^(?:[^<>]*<)?([^<>\s]+@[^<>\s]+)>?$/,
  )?.[1];
  if (!address) return "EMAIL_FROM must contain a valid sender email address.";
  if (
    /@(?:your-verified-domain\.com|example\.(?:com|org|net|test))$/i.test(
      address,
    )
  )
    return "EMAIL_FROM still uses an example domain. Set a sender on your verified Resend domain.";
}

export function emailFailureReason(error: {
  name?: string;
  statusCode?: number | null;
  message?: string;
}): string {
  const message = error.message?.toLowerCase() ?? "";
  if (/only send testing emails|own email address/.test(message))
    return "Resend test senders can only send to the Resend account owner's email. Verify a domain for public registration.";
  if (/domain.*not verified|verify.*domain/.test(message))
    return "The EMAIL_FROM domain is not verified in Resend. Verify the domain and use a sender on it.";
  if (
    error.name === "restricted_api_key" ||
    /permission|restricted/.test(message)
  )
    return "The Resend key cannot send from this domain. Check its sending permissions and domain scope.";
  if (
    error.statusCode === 401 ||
    /api key.*invalid|missing api key/.test(message)
  )
    return "Resend rejected the API key. Check RESEND_API_KEY.";
  if (/quota|limit.*exceeded/.test(message))
    return "The Resend sending quota has been exceeded. Check account usage.";
  if (error.statusCode === 429)
    return "Resend rate-limited the request. Wait before retrying.";
  return "Resend could not accept the verification email. Check the provider logs and sender configuration.";
}

function fail(reason: string, status?: number | null): never {
  const result = deliveries.getStore();
  if (result) result.failed = true;
  // Log actionable categories, never recipients, keys, message bodies or tokens.
  console.error("[Verification email]", {
    reason,
    ...(status ? { status } : {}),
  });
  throw new Error(
    "Verification email could not be sent. Try again later or contact the site owner.",
  );
}

export async function sendVerificationEmail(
  user: { email: string },
  url: string,
) {
  const issue = emailConfigurationIssue();
  if (issue) fail(issue);
  let result;
  try {
    result = await new Resend(process.env.RESEND_API_KEY!).emails.send({
      from: process.env.EMAIL_FROM!,
      to: user.email,
      subject: "Verify your Paper Trade account",
      text: `Verify your email to start your simulation:\n\n${url}\n\nThis link expires in one hour. If you did not create this account, ignore this email.`,
    });
  } catch {
    fail("Unable to reach Resend. Check the network and provider status.");
  }
  if (result.error)
    fail(emailFailureReason(result.error), result.error.statusCode);
  if (!result.data?.id)
    fail(
      "Resend did not return an email acceptance ID. Check provider status.",
    );
}

/** Better Auth logs and swallows mail callback errors, even when awaited.
 * Keep the outcome request-local so concurrent registrations cannot mix results.
 */
export async function withEmailDeliveryStatus(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  return deliveries.run({ failed: false }, async () => {
    const response = await handler();
    if (!deliveries.getStore()!.failed) return response;
    const created =
      new URL(request.url).pathname.endsWith("/sign-up/email") && response.ok;
    return Response.json(
      {
        code: created ? SIGNUP_EMAIL_FAILURE : EMAIL_FAILURE,
        message: created
          ? "Your account was created, but the verification email could not be sent. Use resend verification after email delivery is restored."
          : "The verification email could not be sent. Try again later or contact the site owner.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  });
}
