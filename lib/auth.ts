import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { sendVerificationEmail } from "./verification-email";
import { db } from "./db";
import * as schema from "./db/schema";

let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL)
    throw new Error("Configure BETTER_AUTH_SECRET and BETTER_AUTH_URL.");
  return betterAuth({
    appName: "Paper Trade",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "mysql", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(user, url);
      },
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 })],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/send-verification-email": { window: 300, max: 3 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
  });
}
export function auth() {
  return (instance ??= createAuth());
}
