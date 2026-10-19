'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import {
  DuplicateCashierError,
  addCashier,
  getDevice,
  getSettings,
  isPrefixUsedByAnotherDevice,
  isValidPin,
  listCashiers,
  removeCashier,
  resetDevice,
  updateSettings,
  db,
} from '@/lib/db';
import { useBilingual, useLang } from '@/lib/i18n';
import { lockNow } from '@/lib/lock/lock';
import { persistState, requestAndRecord } from '@/lib/storage/persist';
import type { PersistState } from '@/lib/storage/persist';

export default function SettingsPage() {
  const { t, other } = useBilingual();
  const { lang, setLang } = useLang();
  const router = useRouter();

  const settings = useLiveQuery(() => getSettings(), []);
  const device = useLiveQuery(() => getDevice().catch(() => null), []);
  const cashiers = useLiveQuery(() => listCashiers(), []);

  const [form, setForm] = useState({
    shop_name: '',
    shop_name_am: '',
    phone: '',
    address: '',
    receipt_footer_am: '',
    printer_width: '80',
  });
  const [prefix, setPrefix] = useState('');
  const [saved, setSaved] = useState(false);

  /*
   * Warn, don't block: after a reset this till's own old receipts carry a
   * different device_id, and numbering already continues past them.
   */
  const cleanedPrefix = prefix.trim().toUpperCase();
  const prefixInUse = useLiveQuery(
    () => (device ? isPrefixUsedByAnotherDevice(cleanedPrefix, device.device_id) : false),
    [cleanedPrefix, device?.device_id],
  );

  // Seed the form once the stored values arrive.
  useEffect(() => {
    if (!settings) return;
    setForm({
      shop_name: settings.shop_name,
      shop_name_am: settings.shop_name_am,
      phone: settings.phone,
      address: settings.address,
      receipt_footer_am: settings.receipt_footer_am,
      printer_width: String(settings.printer_width),
    });
  }, [settings]);

  useEffect(() => {
    if (device) setPrefix(device.device_prefix);
  }, [device]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    await updateSettings({
      shop_name: form.shop_name.trim(),
      shop_name_am: form.shop_name_am.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      receipt_footer_am: form.receipt_footer_am.trim(),
      printer_width: form.printer_width === '58' ? 58 : 80,
    });

    const cleaned = prefix.trim().toUpperCase();
    if (cleaned && device && cleaned !== device.device_prefix) {
      await db.device_meta.update(device.id, { device_prefix: cleaned });
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (settings === undefined) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <h1 className="ethiopic text-2xl font-semibold">{t.settings.title}</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <h2 className="ethiopic text-lg font-semibold">{t.settings.shopSection}</h2>

        <Field htmlFor="shop-name-am" label={t.settings.shopNameAm} sublabel={other.settings.shopNameAm}>
          <TextInput
            id="shop-name-am"
            value={form.shop_name_am}
            onChange={(event) => setForm((f) => ({ ...f, shop_name_am: event.target.value }))}
            className="ethiopic"
          />
        </Field>

        <Field htmlFor="shop-name" label={t.settings.shopName} sublabel={other.settings.shopName}>
          <TextInput
            id="shop-name"
            value={form.shop_name}
            onChange={(event) => setForm((f) => ({ ...f, shop_name: event.target.value }))}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="phone" label={t.settings.phone} sublabel={other.settings.phone}>
            <TextInput
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
              className="num"
            />
          </Field>

          <Field htmlFor="address" label={t.settings.address} sublabel={other.settings.address}>
            <TextInput
              id="address"
              value={form.address}
              onChange={(event) => setForm((f) => ({ ...f, address: event.target.value }))}
              className="ethiopic"
            />
          </Field>
        </div>

        <Field
          htmlFor="footer"
          label={t.settings.receiptFooter}
          sublabel={other.settings.receiptFooter}
        >
          <TextInput
            id="footer"
            value={form.receipt_footer_am}
            onChange={(event) => setForm((f) => ({ ...f, receipt_footer_am: event.target.value }))}
            className="ethiopic"
          />
        </Field>

        <h2 className="ethiopic pt-4 text-lg font-semibold">{t.settings.deviceSection}</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            htmlFor="prefix"
            label={t.settings.devicePrefix}
            sublabel={other.settings.devicePrefix}
            hint={t.settings.devicePrefixHint}
            error={prefixInUse ? t.settings.devicePrefixInUse : undefined}
          >
            <TextInput
              id="prefix"
              value={prefix}
              maxLength={4}
              onChange={(event) => setPrefix(event.target.value.toUpperCase())}
              className="num"
            />
          </Field>

          <Field
            htmlFor="printer"
            label={t.settings.printerWidth}
            sublabel={other.settings.printerWidth}
          >
            <Select
              id="printer"
              value={form.printer_width}
              onChange={(event) => setForm((f) => ({ ...f, printer_width: event.target.value }))}
              className="num"
            >
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </Select>
          </Field>
        </div>

        <Field htmlFor="lang" label={t.settings.language} sublabel={other.settings.language}>
          <Select
            id="lang"
            value={lang}
            onChange={(event) => setLang(event.target.value === 'en' ? 'en' : 'am')}
            className="ethiopic"
          >
            <option value="am">{t.lang.amharic}</option>
            <option value="en">{t.lang.english}</option>
          </Select>
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="money">
            <span className="ethiopic">{t.common.save}</span>
          </Button>
          {saved ? (
            <span className="ethiopic text-sm font-medium text-birr">{t.settings.saved}</span>
          ) : null}
        </div>
      </form>

      <StorageSection />

      <CashierSection cashiers={cashiers ?? []} />

      <section className="flex flex-col gap-3">
        <h2 className="ethiopic text-lg font-semibold">{t.auth.title}</h2>
        <ButtonLink href="/signin" variant="quiet">
          <span className="ethiopic">{t.auth.signIn}</span>
        </ButtonLink>
      </section>

      <DangerSection
        shopName={settings.shop_name_am || settings.shop_name}
        onReset={async () => {
          await resetDevice();
          router.push('/setup');
        }}
      />

      <Button type="button" variant="quiet" onClick={lockNow}>
        <span className="ethiopic">{t.lock.lockNow}</span>
      </Button>
    </div>
  );
}

/**
 * Whether the browser may evict this till's data. Read live rather than from
 * the recorded first-run answer: the browser can grant it later (after the
 * app is installed, say), and this should say what is true now.
 */
function StorageSection() {
  const { t, other } = useBilingual();
  const [state, setState] = useState<PersistState | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let live = true;
    void persistState().then((current) => {
      if (live) setState(current);
    });
    return () => {
      live = false;
    };
  }, []);

  async function handleRetry() {
    setAsking(true);
    try {
      setState(await requestAndRecord());
    } finally {
      setAsking(false);
    }
  }

  const message =
    state === 'granted'
      ? t.settings.storageGranted
      : state === 'denied'
        ? t.settings.storageDenied
        : state === 'unsupported'
          ? t.settings.storageUnsupported
          : t.settings.storageChecking;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="storage-heading">
      <h2 id="storage-heading" className="ethiopic text-lg font-semibold">
        {t.settings.storageSection}
        <span className="ml-2 text-sm font-normal text-muted">{other.settings.storageSection}</span>
      </h2>

      <p
        data-testid="storage-persist"
        data-state={state ?? 'checking'}
        aria-live="polite"
        // Colour on the rule, not the text: ochre text on paper is too faint
        // to read in a sunlit shop.
        className={`ethiopic max-w-prose border-l-4 pl-3 text-sm ${
          state === 'granted' ? 'border-birr' : state === null ? 'border-rule text-muted' : 'border-ochre'
        }`}
      >
        {message}
      </p>

      {state === 'denied' ? (
        <>
          <p className="ethiopic max-w-prose text-sm text-muted">{t.settings.storageHint}</p>
          <Button type="button" variant="quiet" disabled={asking} onClick={() => void handleRetry()}>
            <span className="ethiopic">{t.settings.storageRetry}</span>
          </Button>
        </>
      ) : null}
    </section>
  );
}

function CashierSection({ cashiers }: { cashiers: { id: string; name: string }[] }) {
  const { t, other } = useBilingual();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();

  async function handleAdd(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) return setError(t.common.required);
    if (!isValidPin(pin)) return setError(t.settings.pinHint);

    setError(undefined);
    try {
      await addCashier(name, pin);
    } catch (cause) {
      setError(
        cause instanceof DuplicateCashierError
          ? t.settings.duplicateCashier
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
      return;
    }

    setName('');
    setPin('');
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="ethiopic text-lg font-semibold">{t.settings.cashiersSection}</h2>

      {cashiers.length === 0 ? (
        <p className="ethiopic text-sm text-muted">{t.settings.noCashiers}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {cashiers.map((cashier) => (
            <li key={cashier.id} className="flex items-center justify-between gap-3 py-2">
              <span className="ethiopic text-sm">{cashier.name}</span>
              <button
                type="button"
                onClick={() => void removeCashier(cashier.id)}
                className="ethiopic min-h-touch px-2 text-sm text-muted"
              >
                {t.settings.removeCashier}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field htmlFor="cashier-name" label={t.settings.cashierName} sublabel={other.settings.cashierName} error={error}>
          <TextInput
            id="cashier-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="ethiopic"
          />
        </Field>

        <Field htmlFor="cashier-pin" label={t.lock.pin} sublabel={other.lock.pin} hint={t.settings.pinHint}>
          <TextInput
            id="cashier-pin"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            className="num w-24 text-center"
          />
        </Field>

        <Button type="submit" variant="primary">
          <span className="ethiopic">{t.settings.addCashier}</span>
        </Button>
      </form>
    </section>
  );
}

function DangerSection({ shopName, onReset }: { shopName: string; onReset: () => Promise<void> }) {
  const { t, other } = useBilingual();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();

  const armed = typed.trim() === shopName.trim() && shopName.trim() !== '';

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-alarm/40 p-4">
      <h2 className="ethiopic text-lg font-semibold text-alarm">{t.settings.dangerSection}</h2>
      <p className="ethiopic max-w-prose text-sm text-muted">{t.settings.resetWarning}</p>

      <Field
        htmlFor="reset-confirm"
        label={t.settings.resetConfirmLabel}
        sublabel={other.settings.resetConfirmLabel}
        error={error}
      >
        <TextInput
          id="reset-confirm"
          value={typed}
          placeholder={shopName}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(undefined);
          }}
          className="ethiopic"
        />
      </Field>

      <Button
        type="button"
        variant="danger"
        disabled={!armed}
        onClick={() => {
          if (!armed) return setError(t.settings.resetMismatch);
          void onReset();
        }}
      >
        <span className="ethiopic">{t.settings.resetDevice}</span>
      </Button>
    </section>
  );
}
