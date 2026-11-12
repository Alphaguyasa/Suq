import { getSupabase } from './client';
import { AuthFailureError, classifyAuthError } from './errors';

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new AuthFailureError(classifyAuthError(error), error.message);
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Returns null when the project requires email confirmation first. */
export async function signUp(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw new AuthFailureError(classifyAuthError(error), error.message);
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

/**
 * Signs this till out, even with no network.
 *
 * The default (`global`) scope revokes every session of the user on the server, and since
 * supabase-js 2.119 it keeps the local session when that request fails. A till is often
 * offline, so a failed global sign-out falls back to the `local` scope, which always clears
 * this device's session first. Its best-effort revoke may still fail; the refresh token then
 * expires on its own, and nothing about it is something the cashier can act on.
 */
export async function signOut(): Promise<void> {
  const auth = getSupabase().auth;
  const { error } = await auth.signOut();
  if (!error) return;
  await auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export async function currentUser(): Promise<AuthUser | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export function onAuthChange(listener: (user: AuthUser | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    listener(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  });

  return () => data.subscription.unsubscribe();
}
