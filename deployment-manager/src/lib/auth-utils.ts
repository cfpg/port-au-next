import { auth } from './auth';
import { headers } from 'next/headers';

type ServerAction<T> = (...args: any[]) => Promise<T>;

export function withAuth<T>(action: ServerAction<T>): ServerAction<T> {
  return async (...args: any[]) => {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      throw new Error('Unauthorized');
    }

    return action(...args);
  };
} 