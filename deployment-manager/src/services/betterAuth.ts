import logger from '~/services/logger';

async function authServerFetch(path: string, options: RequestInit = {}, headers: HeadersInit = {}): Promise<Response> {
  const response = await fetch(`${process.env.BETTER_AUTH_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
  return response;
}

export async function signIn(email: string, password: string): Promise<string[]> {
  // This response returns cookies used to identificate the user which need to be returned so the server action calling this
  // can set the cookie sin the response headers  
  const response = await authServerFetch(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      credentials: 'omit',
    },
    {
      "Access-Control-Allow-Headers": "Set-Cookie"
    }
  );

  // Get all Set-Cookie headers using the Headers API
  const cookies = response.headers.getSetCookie();
  console.log(":GOT RESPONSE", response);
  console.log("GOT headers", response.headers);
  console.log("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
  console.log('cookies', cookies);

  // Handle not 200 response with more detail
  if (response.status !== 200) {
    const errorData = await response.json();
    logger.error('Sign in failed:', {
      name: "SignInError",
      message: "Sign in failed",
      status: `${response.status}`,
      statusText: response.statusText,
      error: errorData
    });
    throw new Error(`Failed to sign in: ${response.statusText}${errorData?.message ? ` - ${errorData.message}` : ''}`);
  }

  // Return the cookies as an array
  return cookies || [];  // Return empty array instead of empty string
}

export async function configureBetterAuthForDeploymentManager(): Promise<void> {
  try {
    logger.info("Configuring BetterAuth for deployment manager");
    const email = process.env.DEPLOYMENT_MANAGER_EMAIL;
    const password = process.env.DEPLOYMENT_MANAGER_PASSWORD;

    if (!email || !password) {
      logger.info('Missing required environment variables for BetterAuth configuration');
      return;
    }

    try {
      logger.info("Signing up deployment manager user");
      const signUpResponse = await authServerFetch('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          name: 'Deployment Manager Admin',
        })
      });
      logger.info('Deployment manager user created');
      logger.info('Sign up response:', { response: JSON.stringify(signUpResponse, null, 2), status: signUpResponse.status });
    } catch (error) {
      // user exists, continue without failing
      logger.error('Error response while signing up deployment manager user:', error as Error);
      logger.info('Deployment manager user already exists');
    }
  } catch (error) {
    logger.error('Failed to configure BetterAuth:', error as Error);
    throw error;
  }
}

// Helper function to hash passwords (you should use a proper password hashing library in production)
async function hashPassword(password: string): Promise<string> {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
} 