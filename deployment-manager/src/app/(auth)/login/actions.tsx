"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn as signInBetterAuth } from '~/services/betterAuth';

export async function signIn(formData: FormData) {
  const cookieStore = await cookies();
  const email = formData.get('email');
  const password = formData.get('password');

  let loginCookies: string[] = [];
  try {
    loginCookies = await signInBetterAuth(email as string, password as string);
  } catch (error) {
    return redirect('/login?error=login_error');
  }

  // If loginCookies is empty, redirect to login page with ?error message
  if (!loginCookies) {
    return redirect('/login?error=invalid_credentials');
  }

  // loginCookies returned as set-cookie headers, we need to set them in the cookie store
  loginCookies.forEach((cookie) => {
    // Parse the cookie string to get name and value
    const [name, ...rest] = cookie.split('=');
    const value = rest.join('=').split(';')[0];
    if (name && value) {
      cookieStore.set(name.trim(), value.trim());
    }
  });

  return redirect('/');
}
