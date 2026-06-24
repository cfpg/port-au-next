import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { AUTH_COOKIE_PREFIX } from "~/lib/auth-config";
import { config } from "~/services/database";

const pool = new Pool(config);

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  // We can add social providers later if needed
  socialProviders: {},
  plugins: [
    nextCookies()
  ],
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_BASE_URL || 'http://localhost:3000',
  trustedOrigins: [process.env.NEXT_PUBLIC_BETTER_AUTH_TRUSTED_ORIGINS || 'http://localhost:3000'],
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
  },
});
