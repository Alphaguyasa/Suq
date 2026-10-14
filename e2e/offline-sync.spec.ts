import { expect, test } from '@playwright/test';
import { E2E_SUPABASE_URL } from '../playwright.config';
import { E2E_SHOP_ID, FakeSupabase, SYNCED_TABLES } from './fake-supabase';
import { PRODUCTS, pay, readLocal, scan, setupShop, syncPill } from './helpers';

/**
 * PROJECT RULE (CLAUDE.md §5): keep a Playwright test that goes offline
 * (context.setOffline), completes sales, reconnects, and asserts sync with no
 * lost and no duplicated records.
 *
 * This is the demo, as a test: ring something up, kill the network MID-SALE,
 * keep selling, reconnect, watch everything arrive exactly once.
 */
test('sales made offline sync on reconnect with nothing lost and nothing duplicated', async ({
  context,
  page,
}) => {
  const server = new FakeSupabase(E2E_SUPABASE_URL);
  await server.install(context);

  await setupShop(page);

  // Signed in and online: the catalogue reaches the server under the real shop.
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });
  await expect.poll(() => server.rows('products').length).toBe(PRODUCTS.length);

  // One ordinary sale while online.
  await scan(page, [PRODUCTS[0].barcode]);
  const online = await pay(page);
  await expect.poll(() => server.rows('sales').length).toBe(1);

  // Mid-sale: one item in the cart, then the network goes away.
  await scan(page, [PRODUCTS[1].barcode]);
  server.offline = true;
  await context.setOffline(true);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'offline');

  await scan(page, [PRODUCTS[2].barcode]);
  const offline = [await pay(page)];

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[0].barcode]);
  offline.push(await pay(page));

  await scan(page, [PRODUCTS[1].barcode]);
  offline.push(await pay(page));

  // The pill counts SALES waiting, not outbox rows — and nothing left the till.
  await expect(syncPill(page)).toHaveAttribute('data-pending', '3');
  expect(server.rows('sales')).toHaveLength(1);

  // Reconnect.
  server.offline = false;
  await context.setOffline(false);

  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });
  await expect.poll(() => server.rows('sales').length).toBe(4);

  // Nothing lost: the server holds exactly what the till holds, table by table.
  for (const table of SYNCED_TABLES) {
    const local = await readLocal<{ id: string }>(page, table);
    const remote = server.rows(table);
    expect(remote.map((row) => row.id).sort(), `${table}: server matches the till`).toEqual(
      local.map((row) => row.id).sort(),
    );
    expect(remote.every((row) => row.shop_id === E2E_SHOP_ID), `${table}: adopted the real shop`).toBe(
      true,
    );
  }

  // Nothing duplicated: one row per receipt, every receipt unique.
  const receipts = server.rows('sales').map((row) => row.receipt_no as string);
  expect(new Set(receipts).size).toBe(receipts.length);
  expect(receipts.sort()).toEqual([online, ...offline].sort());

  // Stock stayed a sum of movements: 4 sales took 1+1+1+2+1 = 6 units out.
  const movedOut = server
    .rows('stock_movements')
    .filter((row) => row.reason === 'sale')
    .reduce((sum, row) => sum + Number(row.qty_delta), 0);
  expect(movedOut).toBe(-6);

  // And the outbox is empty.
  expect(await readLocal(page, 'outbox')).toHaveLength(0);
  expect(server.rejected, 'no push was rejected by RLS').toBe(0);
});
