// Dexie needs a real IndexedDB. jsdom does not ship one.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// A reset keeps the till's identity in localStorage on purpose (it outlives
// the IndexedDB wipe). jsdom's localStorage lives for the whole test file, so
// without this one test's reset would hand its device_id to the next test.
import { beforeEach } from 'vitest';
import { PREVIOUS_TILL_KEY } from './lib/db/previous-till';

beforeEach(() => {
  // Files that opt into the node environment have no localStorage at all.
  if (typeof localStorage !== 'undefined') localStorage.removeItem(PREVIOUS_TILL_KEY);
});
