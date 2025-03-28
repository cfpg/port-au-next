"use client";

import Card from "~/components/general/Card";
import Button from "~/components/general/Button";
import Input from "~/components/general/Input";
import Label from "~/components/general/Label";
import Link from "~/components/general/Link";
import { signIn } from "./actions";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { signIn as signInBetterAuth } from '~/lib/authClient';

export default function SignIn() {
  const { pending } = useFormStatus();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <Card
      className="max-w-md mx-auto"
      title="Sign In"
      content={
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          // Get email and password from the FormData
          const email = (e.target as HTMLFormElement).email.value;
          const password = (e.target as HTMLFormElement).password.value;
          const res = await signInBetterAuth.email({ email, password });
          console.log("RES", res, res?.error);
        }}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              name="email"
              placeholder="m@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="#" className="text-sm text-blue-600 hover:text-blue-800">
                Forgot your password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="password"
              autoComplete="password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={pending}
          >
            {pending ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : null}
            Sign In
          </Button>

          {error && (
            <div className="text-red-500 border border-red-500 rounded-md p-2 bg-red-50">
              {error === "invalid_credentials" ? "Invalid credentials" : "An error occurred"}
            </div>
          )}
        </form>
      }
    />
  );
}