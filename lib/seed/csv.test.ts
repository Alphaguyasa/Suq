import { describe, expect, it } from 'vitest';
import { parseProductCsv, splitCsvLine } from './csv';

describe('splitCsvLine', () => {
  it('splits plain fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quoted fields, which is why this exists', () => {
    expect(splitCsvLine('"Ambo Water, 1L",35.00')).toEqual(['Ambo Water, 1L', '35.00']);
  });

  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"He said ""hi""",2')).toEqual(['He said "hi"', '2']);
  });

  it('keeps empty trailing fields', () => {
    expect(splitCsvLine('a,,')).toEqual(['a', '', '']);
  });
});

describe('parseProductCsv', () => {
  const header = 'name,name_am,barcode,unit,cost_price,sell_price,reorder_level,opening_qty';

  it('parses a well-formed file into integer cents', () => {
    const { products, errors } = parseProductCsv(
      `${header}\nAmbo Water 1L,አምቦ ውሃ 1 ሊትር,6130001000017,pcs,26.00,35.00,24,48`,
    );

    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).toEqual({
      name: 'Ambo Water 1L',
      name_am: 'አምቦ ውሃ 1 ሊትር',
      barcode: '6130001000017',
      unit: 'pcs',
      cost_price: 2600,
      sell_price: 3500,
      reorder_level: 24,
      opening_qty: 48,
    });
  });

  it('skips a bad row and keeps the good ones', () => {
    const { products, errors } = parseProductCsv(
      [
        header,
        'Good One,ጥሩ,111,pcs,10.00,15.00,5,10',
        'Bad Price,መጥፎ,222,pcs,abc,15.00,5,10',
        'Another Good,ሌላ,333,kg,20.00,30.00,5,10',
      ].join('\n'),
    );

    expect(products.map((row) => row.name)).toEqual(['Good One', 'Another Good']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('row 3');
    expect(errors[0]).toContain('cost_price');
  });

  it('mirrors a missing name across languages rather than leaving one blank', () => {
    const { products } = parseProductCsv('name_am\nአምቦ ውሃ');

    expect(products[0]?.name).toBe('አምቦ ውሃ');
    expect(products[0]?.name_am).toBe('አምቦ ውሃ');
  });

  it('falls back to pcs for an unknown unit', () => {
    const { products } = parseProductCsv(`${header}\nX,ኤክስ,1,barrels,1.00,2.00,0,0`);
    expect(products[0]?.unit).toBe('pcs');
  });

  it('defaults blank numbers to zero rather than rejecting the row', () => {
    const { products, errors } = parseProductCsv(`${header}\nX,ኤክስ,,,,,,`);

    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject({
      barcode: null,
      cost_price: 0,
      sell_price: 0,
      reorder_level: 0,
      opening_qty: 0,
    });
  });

  it('explains itself when the file is unusable', () => {
    expect(parseProductCsv('').errors[0]).toContain('empty');
    expect(parseProductCsv('price,qty\n1,2').errors[0]).toContain('name');
  });

  it('tolerates CRLF and a trailing newline', () => {
    const { products, errors } = parseProductCsv(
      `${header}\r\nX,ኤክስ,1,pcs,1.00,2.00,0,0\r\n`,
    );

    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
  });
});
