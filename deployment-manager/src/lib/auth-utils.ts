import { redirect } from 'next/navigation';
import { auth } from './auth';
import { headers } from 'next/headers';

type ServerAction<T> = (...args: any[]) => Promise<T>;

export function withAuth<T>(action: ServerAction<T>): ServerAction<T | undefined> {
  return async (...args: any[]) => {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      console.log("Unauthorized, redirecting to login.");
      return redirect('/login');
    }

    return action(...args);
  };
} 