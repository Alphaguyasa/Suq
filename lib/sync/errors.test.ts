import { describe, expect, it } from 'vitest';
import { classifySyncError } from './errors';

describe('classifySyncError', () => {
  it.each([
    ['TypeError: Failed to fetch', 'network'],
    ['NetworkError when attempting to fetch resource.', 'network'],
    ['Load failed', 'network'],
    ['sales: new row violates row-level security policy for table "sales"', 'permission'],
    ['sale_items: permission denied for table sale_items', 'permission'],
    ['server_now: JWT expired', 'signedOut'],
    ['Invalid Refresh Token: Refresh Token Not Found', 'signedOut'],
    ['products: canceling statement due to statement timeout', 'server'],
    ['503 Service Unavailable', 'server'],
    ['Cannot pull before the device is registered.', 'unknown'],
  ])('%s → %s', (message, expected) => {
    expect(classifySyncError(message)).toBe(expected);
  });
});
