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
    responseCookies.forEach((cookie) => {
      const [name, value] = cookie.split("=");
      cookieStore.set(name, value);
    });
  } catch (e) {
    return redirect("/login?error=true");
  }

  return redirect("/");
}
