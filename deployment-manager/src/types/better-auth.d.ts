declare module 'better-auth/react' {
  export function createAuthClient(config: { baseURL: string }): {
    signIn: {
      email: (credentials: { email: string; password: string }, options?: { onRequest?: (ctx: any) => void; onResponse?: (ctx: any) => void }) => Promise<any>;
    };
    signUp: any;
    signOut: any;
    useSession: any;
  };
} 