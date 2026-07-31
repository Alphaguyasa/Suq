/**
 * Amharic is the primary language of this app, so this file is the source of
 * truth for the dictionary shape. en.ts must satisfy the Dict type derived
 * from it, which means an English translation can never silently go missing.
 */
export const am = {
  app: {
    name: 'ሱቅ',
    tagline: 'ከመስመር ውጭም የሚሠራ የሽያጭና የክምችት ሥርዓት',
  },
  nav: {
    sell: 'ሽያጭ',
    products: 'ምርቶች',
    reports: 'ሪፖርት',
    settings: 'ቅንብሮች',
  },
  sync: {
    label: 'የማመሳሰል ሁኔታ',
    synced: 'ተመሳስሏል',
    syncing: 'በማመሳሰል ላይ',
    offline: 'ከመስመር ውጭ',
    blocked: 'ማመሳሰል አልተሳካም',
    /** Rendered after the state, e.g. "ከመስመር ውጭ · 12 ተቀምጧል" */
    pending: (count: number) => `${count} ተቀምጧል`,
    /** Same phrase with the count split out, so digits can use tabular-nums. */
    pendingSuffix: 'ተቀምጧል',
  },
  money: {
    currency: 'ብር',
  },
  lang: {
    amharic: 'አማርኛ',
    english: 'English',
  },
  placeholder: {
    sell: 'የሽያጭ ማያ',
    products: 'ምርቶች',
    reports: 'ሪፖርቶች',
    settings: 'ቅንብሮች',
    comingIn: (session: number) => `በክፍለ ጊዜ ${session} ይገነባል`,
  },
};

export type Dict = typeof am;
