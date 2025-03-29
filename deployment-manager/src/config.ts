export const config = {
  auth: {
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "https://auth2.cfpg.me",
  },
} as const;