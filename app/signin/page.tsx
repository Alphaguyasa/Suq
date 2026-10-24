'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { SyncErrorMessage } from '@/components/ui/SyncErrorMessage';
import { useBilingual } from '@/lib/i18n';
import type { AuthUser } from '@/lib/supabase/auth';
import { currentUser, signIn, signOut, signUp } from '@/lib/supabase/auth';
import type { AuthFailure } from '@/lib/supabase/errors';
import { AuthFailureError, authErrorText, classifyAuthError } from '@/lib/supabase/errors';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { adoptShopFromMembership } from '@/lib/sync/shop';

/**
 * Sync needs a real Supabase identity: every RLS policy is `to authenticated`.
 * The till itself does not — it works offline whether or not anyone signs in,
 * which is what the note at the bottom says out loud.
 */
export default function SignInPage() {
  const { t, other } = useBilingual();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ failure: AuthFailure; raw: string }>();
  const [notice, setNotice] = useState<string>();
  /** Signed in, but connecting the shop failed: a server problem, not a login one. */
  const [shopError, setShopError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void currentUser().then(setUser).catch(() => undefined);
  }, []);

  async function afterSignIn() {
    try {
      const { outcome } = await adoptShopFromMembership();
      setNotice(outcome === 'no-membership' ? t.auth.noShop : t.auth.shopAdopted);
    } catch (cause) {
      setShopError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleSubmit(event: FormEvent, mode: 'in' | 'up') {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setShopError(undefined);
    setBusy(true);

    try {
      if (mode === 'in') {
        setUser(await signIn(email, password));
        await afterSignIn();
      } else {
        const created = await signUp(email, password);
        setUser(created);
        if (created) await afterSignIn();
        else setNotice(t.auth.checkEmail);
      }
    } catch (cause) {
      setError(describeAuthFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return <p className="ethiopic text-sm text-muted">{t.syncSheet.notConfigured}</p>;
  }

  return (
    <div className="flex max-w-md flex-col gap-5">
      <h1 className="ethiopic text-2xl font-semibold">{t.auth.title}</h1>

      {user ? (
        <div className="flex flex-col gap-4 rounded-xl border border-rule p-4">
          <div className="flex flex-col gap-1">
            <span className="ethiopic text-sm text-muted">{t.auth.signedInAs}</span>
            <span className="text-base font-medium break-all">{user.email}</span>
          </div>

          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
                setUser(null);
                setNotice(undefined);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="ethiopic">{t.auth.signOut}</span>
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event, 'in')} className="flex flex-col gap-4">
          <Field htmlFor="email" label={t.auth.email} sublabel={other.auth.email}>
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field
            htmlFor="password"
            label={t.auth.password}
            sublabel={other.auth.password}
            error={error ? authErrorText(error, t.auth.errors) : undefined}
          >
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              invalid={Boolean(error)}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={busy} className="flex-1">
              <span className="ethiopic">{t.auth.signIn}</span>
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={(event) => void handleSubmit(event, 'up')}
            >
              <span className="ethiopic">{t.auth.signUp}</span>
            </Button>
          </div>
        </form>
      )}

      {shopError ? <SyncErrorMessage raw={shopError} testId="shop-error" /> : null}

      {notice ? <p className="ethiopic text-sm font-medium text-birr-ink">{notice}</p> : null}

      <p className="ethiopic text-xs text-muted">{t.auth.offlineNote}</p>
    </div>
  );
}

function describeAuthFailure(cause: unknown): { failure: AuthFailure; raw: string } {
  if (cause instanceof AuthFailureError) return { failure: cause.failure, raw: cause.message };
  const raw = cause instanceof Error ? cause.message : String(cause);
  return { failure: classifyAuthError({ message: raw }), raw };
}
