import { auth } from "~/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Force Node.js runtime for this route
export const runtime = 'nodejs';

export const { GET, POST } = toNextJsHandler(auth.handler);