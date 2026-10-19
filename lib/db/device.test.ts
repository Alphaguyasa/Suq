import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer } from '@/lib/sync/fake-server';
import { drainOutbox } from '@/lib/sync/push';
import { pullOnce } from '@/lib/sync/pull';
import {
  DEVICE_META_ID,
  formatReceiptNo,
  getDevice,
  highestReceiptCounter,
  isPrefixUsedByAnotherDevice,
  nextReceiptNo,
  registerDevice,
  suggestDevicePrefix,
} from './device';
import { resetDevice } from './reset';
import * as salesRepo from './repositories/sales';
import { db } from './schema';
import type { Sale } from './schema';
import { TEST_SHOP, cartLine, freshDatabase, seedProduct } from './test-helpers';

beforeEach(async () => {
  await freshDatabase('A1');
});

function foreignSale(receiptNo: string, deviceId = 'another-till'): Sale {
  return {
    id: `sale-${receiptNo}-${deviceId}`,
    shop_id: TEST_SHOP,
    device_id: deviceId,
    receipt_no: receiptNo,
    subtotal: 100,
    discount: 0,
    total: 100,
    payment_method: 'cash',
    cashier_name: '',
    voided_by: null,
    voids_sale_id: null,
    cash_received: null,
    created_at: '2026-10-01T08:00:00.000Z',
    synced_at: '2026-10-01T08:00:01.000Z',
  };
}

describe('nextReceiptNo', () => {
  it('counts up from the local counter', async () => {
    expect(await nextReceiptNo()).toBe('A1-000001');
    expect(await nextReceiptNo()).toBe('A1-000002');
    expect((await getDevice()).receipt_counter).toBe(2);
  });

  it('continues past receipts with the same prefix already on the device', async () => {
    // Pulled in from an earlier life of this till (or another till on A1).
    await db.sales.bulkPut([foreignSale('A1-000041'), foreignSale('A1-000007')]);

    expect(await nextReceiptNo()).toBe('A1-000042');
    expect(await nextReceiptNo()).toBe('A1-000043');
  });

  it('ignores receipts of other prefixes, including ones that start alike', async () => {
    await db.sales.bulkPut([foreignSale('A10-000500'), foreignSale('B1-000300'), foreignSale('A-000900')]);

    expect(await nextReceiptNo()).toBe('A1-000001');
  });

  it('never goes backwards when the local counter is ahead', async () => {
    await db.device_meta.update(DEVICE_META_ID, { receipt_counter: 90 });
    await db.sales.put(foreignSale('A1-000010'));

    expect(await nextReceiptNo()).toBe('A1-000091');
  });

  it('skips past a prefix the owner switches to in Settings', async () => {
    await db.sales.put(foreignSale('B1-000120'));
    await db.device_meta.update(DEVICE_META_ID, { device_prefix: 'B1' });

    expect(await nextReceiptNo()).toBe('B1-000121');
  });
});

describe('highestReceiptCounter', () => {
  it('is 0 with no receipts and ignores a malformed number', async () => {
    expect(await highestReceiptCounter('A1')).toBe(0);

    await db.sales.bulkPut([foreignSale('A1-000003'), foreignSale('A1-xyz')]);
    expect(await highestReceiptCounter('A1')).toBe(3);
  });
});

describe('reset device, set up again with the same prefix', () => {
  /**
   * The bug: reset wiped the counter, setup defaulted to A1 again, and the
   * shop ended up with two different sales numbered A1-000001 in the cloud.
   */
  it('continues numbering after the first pull instead of repeating receipt numbers', async () => {
    const server = new FakeServer();
    const client = server.client();

    const product = await seedProduct();
    const first = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    const second = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    expect([first.receipt_no, second.receipt_no]).toEqual(['A1-000001', 'A1-000002']);
    await drainOutbox(client);

    await resetDevice();
    await registerDevice({ shop_id: TEST_SHOP, device_prefix: 'A1' });
    await pullOnce(client);

    const product2 = (await db.products.toArray())[0];
    const afterReset = await salesRepo.create([cartLine(product2, 1)], { method: 'cash' });
    expect(afterReset.receipt_no).toBe('A1-000003');

    await drainOutbox(client);
    const receipts = server.rows('sales').map((row) => row.receipt_no);
    expect(new Set(receipts).size).toBe(receipts.length);
    expect(receipts.sort()).toEqual(['A1-000001', 'A1-000002', 'A1-000003']);
  });
});

describe('isPrefixUsedByAnotherDevice', () => {
  it('is false for receipts this device printed itself', async () => {
    const device = await getDevice();
    const product = await seedProduct();
    await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    expect(await isPrefixUsedByAnotherDevice('A1', device.device_id)).toBe(false);
  });

  it('is true when another device printed receipts with the prefix', async () => {
    const device = await getDevice();
    await db.sales.put(foreignSale('B1-000004', 'till-b'));

    expect(await isPrefixUsedByAnotherDevice('B1', device.device_id)).toBe(true);
    expect(await isPrefixUsedByAnotherDevice('B', device.device_id)).toBe(false);
    expect(await isPrefixUsedByAnotherDevice('', device.device_id)).toBe(false);
  });
});

describe('suggestDevicePrefix', () => {
  it('is a letter then a digit 1-9, never I or O', () => {
    expect(suggestDevicePrefix(() => 0)).toBe('A1');
    expect(suggestDevicePrefix(() => 0.999999)).toBe('Z9');

    for (let i = 0; i < 200; i += 1) {
      expect(suggestDevicePrefix()).toMatch(/^[A-HJ-NP-Z][1-9]$/);
    }
  });

  it('formats receipt numbers with six digits', () => {
    expect(formatReceiptNo('K7', 42)).toBe('K7-000042');
  });
});
