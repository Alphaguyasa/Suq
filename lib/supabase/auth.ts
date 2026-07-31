import { getSupabase } from './client';

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Returns null when the project requires email confirmation first. */
export async function signUp(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
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
