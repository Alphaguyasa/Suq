/**
 * Links to a single receipt or product.
 *
 * These are static pages that read the id from the query string, not dynamic
 * routes like /sales/<id>. The service worker can only precache pages that
 * exist at build time, and a dynamic route for an id the till has never
 * opened fell through to /offline — right after a sale in airplane mode.
 * next.config.ts redirects the old paths for anything still holding them.
 */
export const saleHref = (id: string) => `/sales/view?id=${encodeURIComponent(id)}`;
export const productHref = (id: string) => `/products/edit?id=${encodeURIComponent(id)}`;
export const productStockHref = (id: string) => `/products/stock?id=${encodeURIComponent(id)}`;

/** The pages above, served from the precache whatever their query string (app/sw.ts). */
export const DETAIL_SHELLS = ['/sales/view', '/products/edit', '/products/stock'] as const;
