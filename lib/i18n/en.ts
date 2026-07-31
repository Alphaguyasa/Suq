import type { Dict } from './am';

export const en: Dict = {
  app: {
    name: 'Suq',
    tagline: 'Point of sale and stock that keeps working offline',
  },
  nav: {
    sell: 'Sell',
    products: 'Products',
    reports: 'Reports',
    settings: 'Settings',
  },
  sync: {
    label: 'Sync status',
    synced: 'Synced',
    syncing: 'Syncing',
    offline: 'Offline',
    blocked: 'Sync blocked',
    pending: (count: number) => `${count} saved`,
    pendingSuffix: 'saved',
  },
  money: {
    currency: 'ETB',
  },
  lang: {
    amharic: 'አማርኛ',
    english: 'English',
  },
  placeholder: {
    sell: 'Sale screen',
    products: 'Products',
    reports: 'Reports',
    settings: 'Settings',
    comingIn: (session: number) => `Built in session ${session}`,
  },
};
