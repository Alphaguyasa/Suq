'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { SaveError } from '@/components/ui/SaveError';
import { classifyWriteError, getDevice, isValidPin, listCashiers, ownerIds, setOwnerPin } from '@/lib/db';
import type { WriteFailure } from '@/lib/db';
import { useBilingual } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { AuthFailureError, authErrorText } from '@/lib/supabase/errors';
import type { AuthFailure } from '@/lib/supabase/errors';
import { verifyShopOwner } from '@/lib/supabase/owner-recovery';

type Outcome =
  | { kind: 'changed'; name: string }
  | { kind: 'notOwner' }
  | { kind: 'auth'; failure: AuthFailure; raw: string };

/**
 * "Forgot the owner PIN?" (ROADMAP item 43).
 *
 * Collapsed to one quiet button until tapped, then an inline form in place (no
 * modal): the shop owner's email and password, checked online against the
 * shop's roster, and the new PIN. On the lock screen it is the only way back
 * in for a shop whose one owner forgot their PIN; in Settings it sits next to
 * the owner-PIN field it unblocks. Hidden on a build with no Supabase, where
 * there is no account to vouch for the owner.
 */
export function OwnerPinRecovery({ idPrefix }: { idPrefix: string }) {
  const { t, other } = useBilingual();
  const cashiers = useLiveQuery(() => listCashiers(), []);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const [saveError, setSaveError] = useState<WriteFailure>();
  const [busy, setBusy] = useState(false);
  // A second tap in the same task would sign in twice (stale `busy`).
  const busyRef = useRef(false);

  if (!isSupabaseConfigured()) return null;

  const ownerSet = ownerIds(cashiers ?? []);
  const owners = (cashiers ?? []).filter((cashier) => ownerSet.has(cashier.id));
  if (owners.length === 0) return null;
  const chosen = owners.find((owner) => owner.id === ownerId) ?? owners[0]!;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    setOutcome(undefined);
    setSaveError(undefined);
    if (!isValidPin(pin)) return setPinError(true);

    busyRef.current = true;
    setBusy(true);
    try {
      const device = await getDevice();
      const check = await verifyShopOwner(email, password, device.shop_id);
      if (check !== 'owner') {
        setOutcome({ kind: 'notOwner' });
        return;
      }
      try {
        const changed = await setOwnerPin(chosen.id, pin);
        setOutcome({ kind: 'changed', name: changed.name });
        setPassword('');
        setPin('');
      } catch (cause) {
        console.error('[owner-recovery] PIN not saved', cause);
        setSaveError(classifyWriteError(cause));
      }
    } catch (cause) {
      if (cause instanceof AuthFailureError) {
        setOutcome({ kind: 'auth', failure: cause.failure, raw: cause.message });
      } else {
        console.error('[owner-recovery] check failed', cause);
        setOutcome({ kind: 'auth', failure: 'unknown', raw: cause instanceof Error ? cause.message : '' });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ethiopic min-h-touch self-center px-2 text-sm text-muted underline"
      >
        {t.settings.forgotOwnerPin}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t.settings.forgotOwnerPin}
      className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-rule p-4"
    >
      <p className="ethiopic text-sm font-semibold">{t.settings.forgotOwnerPin}</p>
      <p className="ethiopic text-xs text-muted">{t.settings.recoverHint}</p>

      <Field htmlFor={`${idPrefix}-email`} label={t.auth.email} sublabel={other.auth.email}>
        <TextInput
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field htmlFor={`${idPrefix}-password`} label={t.auth.password} sublabel={other.auth.password}>
        <TextInput
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {owners.length > 1 ? (
        <Field htmlFor={`${idPrefix}-owner`} label={t.settings.recoverOwner} sublabel={other.settings.recoverOwner}>
          <Select
            id={`${idPrefix}-owner`}
            value={chosen.id}
            onChange={(event) => setOwnerId(event.target.value)}
            className="ethiopic"
          >
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        htmlFor={`${idPrefix}-pin`}
        label={t.settings.newOwnerPin}
        sublabel={other.settings.newOwnerPin}
        hint={t.settings.pinHint}
        error={pinError ? t.settings.pinHint : undefined}
      >
        <TextInput
          id={`${idPrefix}-pin`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          invalid={pinError}
          onChange={(event) => {
            setPinError(false);
            setPin(event.target.value.replace(/\D/g, ''));
          }}
          className="num w-28 text-center tracking-widest"
        />
      </Field>

      <Button type="submit" variant="primary" disabled={busy || !email.trim() || !password}>
        <span className="ethiopic">{t.settings.setOwnerPin}</span>
      </Button>

      <p role="status" data-testid={`${idPrefix}-result`} className="ethiopic text-sm font-medium">
        {outcome?.kind === 'changed' ? (
          <span className="text-birr-ink">{t.settings.ownerPinChanged(outcome.name)}</span>
        ) : outcome?.kind === 'notOwner' ? (
          <span className="text-ochre-ink">{t.settings.notShopOwner}</span>
        ) : outcome?.kind === 'auth' ? (
          <span className="text-ochre-ink">{authErrorText(outcome, t.auth.errors)}</span>
        ) : null}
      </p>

      <SaveError failure={saveError} testId={`${idPrefix}-save-error`} />
    </form>
  );
}
