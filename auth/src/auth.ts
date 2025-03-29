import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const auth = betterAuth({
  trustedOrigins: [process.env.DEPLOYMENT_MANAGER_HOST ? `https://${process.env.DEPLOYMENT_MANAGER_HOST}` : ""],
  plugins: [
    organization({
      // Disable organization creation by default - it will be managed by the deployment manager
      organizationCreation: {
        disabled: true,
        beforeCreate: async ({ organization, user }, request) => {
          // We'll implement this later to handle organization creation through the deployment manager
          return { data: organization };
        },
        afterCreate: async ({ organization, member, user }, request) => {
          // We'll implement this later to handle post-creation tasks
        }
      }
    })
  ],
  database: new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: 5432,
    database: process.env.POSTGRES_DB
  }),
  emailAndPassword: {
    enabled: true,
    // We'll configure these later based on your requirements
    // passwordReset: {
    //   enabled: true,
    //   tokenExpiry: 24 * 60 * 60, // 24 hours
    // },
    // emailVerification: {
    //   enabled: true,
    //   tokenExpiry: 24 * 60 * 60, // 24 hours
    // }
  },
  socialProviders: {
    // We'll configure these later based on your requirements
    // github: {
    //   clientId: process.env.GITHUB_CLIENT_ID,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET,
    // }
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 1 day
    freshAge: 5 * 60, // 5 minutes
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 // 5 minutes
    }
  },
  secret: process.env.BETTER_AUTH_SECRET || "your-secret-key",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
}); 