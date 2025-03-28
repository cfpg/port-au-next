import { NextRequest } from 'next/server'

export async function verifySession(request: NextRequest) {
  const sessionToken = request.cookies.get('__Secure-better-auth.session_token')?.value
  const sessionData = request.cookies.get('__Secure-better-auth.session_data')?.value

  if (!sessionToken || !sessionData) {
    return { user: null, error: 'No session found' }
  }

  try {
    const response = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/get-session`, {
      headers: {
        Cookie: `__Secure-better-auth.session_token=${sessionToken}; __Secure-better-auth.session_data=${sessionData}`,
      },
    })

    if (!response.ok) {
      return { user: null, error: 'Invalid session' }
    }

    const data = await response.json()
    return { user: data.user, error: null }
  } catch (error) {
    return { user: null, error: 'Failed to verify session' }
  }
} 