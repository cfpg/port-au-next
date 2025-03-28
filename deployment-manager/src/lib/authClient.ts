import {
  createAuthClient
} from "better-auth/react";
import { config } from "~/config";


export const authClient = createAuthClient({
  baseURL: config.auth.baseURL,
});

export const {
  signIn,
  signOut,
  signUp,
  useSession
} = authClient;