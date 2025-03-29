"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signIn as signInBetterAuth } from "~/services/betterAuth";

export async function signIn(formData: FormData) {
  try {
    // POST email and password to BETTER_AUTH_HOST /api/auth/sign-in/email
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const responseCookies = await signInBetterAuth(email, password);
    console.log("RES", responseCookies);

    // Set cookies
    const cookieStore = await cookies();
    responseCookies.forEach((cookieStr) => {
      // Parse the full cookie string
      const [nameValue, ...parts] = cookieStr.split(';').map(p => p.trim());
      const [name, value] = nameValue.split('=');
      
      // Parse cookie attributes
      const attributes: { [key: string]: string | boolean | number } = {};
      parts.forEach(part => {
        const [key, val] = part.split('=').map(p => p.trim());
        attributes[key.toLowerCase()] = val || true;
      });

      // Set cookie with all its attributes
      cookieStore.set(name, value, {
        path: attributes.path as string || '/',
        secure: 'secure' in attributes,
        httpOnly: 'httponly' in attributes,
        sameSite: (attributes.samesite as 'lax' | 'strict' | 'none') || 'lax',
        maxAge: attributes['max-age'] ? parseInt(attributes['max-age'] as string) : undefined
      });
    });
  } catch (e) {
    console.error('Sign in error:', e);
    return redirect("/login?error=true");
  }

  return redirect("/");
}
