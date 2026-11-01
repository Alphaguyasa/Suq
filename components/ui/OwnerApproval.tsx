'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ownerApprovalNeeded, verifyOwnerPin } from '@/lib/db';
import { useBilingual } from '@/lib/i18n';
import { useLock } from '@/lib/lock/lock';
import { Field, TextInput } from './Field';

export interface OwnerApproval {
  /** Undefined while loading; false when the owner is unlocked or the till has no cashiers. */
  needed: boolean | undefined;
  /** The owner PIN input, or nothing when no approval is needed. Render it inside the action's own form. */
  field: ReactNode;
  /**
   * Call right before the action. Resolves true when it may go ahead; on a
   * wrong PIN it shows why under the field and resolves false.
   */
  approve: () => Promise<boolean>;
}

/**
 * Owner approval for voids, price edits and a reset (ROADMAP item 32).
 *
 * An inline field in the action's own form, not a dialog: the owner leans over
 * and types four digits, and the cashier never leaves what they were doing.
 * The approval covers this one action only; the PIN is cleared once it is
 * used, so the next void asks again. Like the lock screen it identifies who
 * agreed; it is not a security boundary (lib/db/cashiers.ts says why).
 */
export function useOwnerApproval(id: string): OwnerApproval {
  const { t, other } = useBilingual();
  const { cashier } = useLock();
  const unlockedId = cashier?.id ?? null;
  const needed = useLiveQuery(() => ownerApprovalNeeded(unlockedId), [unlockedId]);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  async function approve(): Promise<boolean> {
    // Asked again, not read from the live query: the owner may have locked
    // and a cashier unlocked since this form opened.
    if (!(await ownerApprovalNeeded(unlockedId))) return true;
    const owner = await verifyOwnerPin(pin);
    setWrong(owner === null);
    setPin('');
    return owner !== null;
  }

  const field = needed ? (
    <Field
      htmlFor={id}
      label={t.lock.ownerPin}
      sublabel={other.lock.ownerPin}
      hint={t.lock.ownerNeeded}
      error={wrong ? t.lock.wrongOwnerPin : undefined}
    >
      <TextInput
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        invalid={wrong}
        onChange={(event) => {
          setWrong(false);
          setPin(event.target.value.replace(/\D/g, ''));
        }}
        className="num w-28 text-center tracking-widest"
      />
    </Field>
  ) : null;

  return { needed, field, approve };
}
