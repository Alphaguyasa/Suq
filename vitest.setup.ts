// Dexie needs a real IndexedDB. jsdom does not ship one.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
