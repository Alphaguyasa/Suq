import { describe, expect, it } from 'vitest';
import { productHref, productStockHref, saleHref } from './routes';

describe('detail links', () => {
  it('point at the static shells with the id in the query string', () => {
    expect(saleHref('abc')).toBe('/sales/view?id=abc');
    expect(productHref('abc')).toBe('/products/edit?id=abc');
    expect(productStockHref('abc')).toBe('/products/stock?id=abc');
  });

  it('encode ids so they round-trip through URLSearchParams', () => {
    const id = 'a b&c=d';
    const url = new URL(saleHref(id), 'http://localhost');
    expect(url.searchParams.get('id')).toBe(id);
  });
});
