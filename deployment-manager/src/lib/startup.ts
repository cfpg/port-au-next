import { auth } from './auth';
import { APIError } from "better-auth/api";

export async function ensureAdminUser() {
  const email = process.env.DEPLOYMENT_MANAGER_AUTH_EMAIL;
  const password = process.env.DEPLOYMENT_MANAGER_AUTH_PASSWORD;

  if (!email || !password) {
    throw new Error('DEPLOYMENT_MANAGER_AUTH_EMAIL and DEPLOYMENT_MANAGER_AUTH_PASSWORD must be set.');
  }

  try {
    // Try to create the user first
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: 'Admin User'
      }
    });
    console.log('Admin user created successfully');
  } catch (error) {
    if (error instanceof APIError) {
      // If user already exists, skip creation.
      if (error.status === 422 || error.message.includes('User already exists')) {
        console.log('Admin user already exists, skipping creation.');
      } else {
        console.error('Error creating admin user:', error.message, error.status);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
} 