import { auth } from "@/lib/auth";
import { databaseConfigured } from "@/lib/db";
import {
  emailConfigurationIssue,
  withEmailDeliveryStatus,
} from "@/lib/verification-email";
async function handler(request: Request) {
  if (!databaseConfigured())
    return Response.json(
      {
        message:
          "Authentication is not configured. Set the database and authentication environment variables.",
      },
      { status: 503 },
    );
  // Recovery is intentionally unavailable in v1, including direct API calls.
  const path = new URL(request.url).pathname;
  if (path.endsWith("/sign-in/email"))
    return Response.json(
      { message: "Sign in with your username and password." },
      { status: 404 },
    );
  if (
    /\/(request-password-reset|reset-password|forget-password)(\/|$)/.test(path)
  )
    return Response.json(
      { message: "Password recovery is not available." },
      { status: 404 },
    );
  try {
    if (
      path.endsWith("/sign-up/email") ||
      path.endsWith("/send-verification-email")
    ) {
      const issue = emailConfigurationIssue();
      if (issue) {
        console.error("[Verification email]", { reason: issue });
        return Response.json(
          {
            code: "EMAIL_NOT_CONFIGURED",
            message:
              "Email verification is temporarily unavailable. Please contact the site owner.",
          },
          { status: 503 },
        );
      }
    }
    return await withEmailDeliveryStatus(request, () =>
      auth().handler(request),
    );
  } catch {
    return Response.json(
      {
        message:
          "Authentication is temporarily unavailable. Check database and email configuration.",
      },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
