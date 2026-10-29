import { auth } from "./auth";
import { databaseConfigured } from "./db";
import { ServiceError } from "./trading/service";
import { TradingError } from "./trading/engine";
import { ZodError } from "zod";

export async function identity(request: Request) {
  if (!databaseConfigured())
    throw new ServiceError(
      "Trading is not configured yet. Set DATABASE_URL, BETTER_AUTH_URL and BETTER_AUTH_SECRET to enable accounts.",
      503,
    );
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session?.user)
    throw new ServiceError("Sign in to access your practice account.", 401);
  if (!session.user.emailVerified)
    throw new ServiceError("Verify your email before trading.", 403);
  return session.user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.BETTER_AUTH_URL;
  if (!origin || !expected || new URL(expected).origin !== origin)
    throw new ServiceError("Request origin is not allowed.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new ServiceError("Use application/json.", 415);
}
export function errorResponse(error: unknown) {
  if (error instanceof ServiceError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof TradingError)
    return Response.json({ error: error.message }, { status: 422 });
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  // Never leak driver messages, connection strings, stack traces or credentials.
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Unable to complete this request. Check the connection and retry; no partial transaction was saved.",
    },
    { status: 503 },
  );
}
