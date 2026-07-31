import type { Unit } from '@/lib/db';

export interface CatalogueEntry {
  name: string;
  name_am: string;
  barcode: string;
  unit: Unit;
  /** integer cents */
  cost_price: number;
  /** integer cents */
  sell_price: number;
  reorder_level: number;
  /** Opening stock written as a movement with reason 'opening'. */
  opening_qty: number;
}

/**
 * Fifteen things that are actually on the shelf in an Addis shop, with margins
 * a shopkeeper would recognise. Four are seeded at or below their reorder
 * level so the low-stock indicator has something real to show.
 *
 * No "Product A" placeholders anywhere — a client sees this screen.
 */
export const CATALOGUE: CatalogueEntry[] = [
  {
    name: 'Ambo Water 1L',
    name_am: 'አምቦ ውሃ 1 ሊትር',
    barcode: '6130001000017',
    unit: 'pcs',
    cost_price: 2600,
    sell_price: 3500,
    reorder_level: 24,
    opening_qty: 48,
  },
  {
    name: 'Highland Water 1L',
    name_am: 'ሃይላንድ ውሃ 1 ሊትር',
    barcode: '6130001000024',
    unit: 'pcs',
    cost_price: 1800,
    sell_price: 2500,
    reorder_level: 24,
    opening_qty: 60,
  },
  {
    name: 'Abay Soap 200g',
    name_am: 'አባይ ሳሙና 200 ግራም',
    barcode: '6130002000013',
    unit: 'pcs',
    cost_price: 3000,
    sell_price: 4000,
    reorder_level: 12,
    opening_qty: 8, // low
  },
  {
    name: 'Ades Macaroni 500g',
    name_am: 'አዴስ መኮረኒ 500 ግራም',
    barcode: '6130003000010',
    unit: 'pcs',
    cost_price: 5800,
    sell_price: 7500,
    reorder_level: 20,
    opening_qty: 30,
  },
  {
    name: 'Shola Pasta 500g',
    name_am: 'ሾላ ፓስታ 500 ግራም',
    barcode: '6130003000027',
    unit: 'pcs',
    cost_price: 5400,
    sell_price: 7000,
    reorder_level: 20,
    opening_qty: 6, // low
  },
  {
    name: 'Sunflower Oil 1L',
    name_am: 'የሱፍ ዘይት 1 ሊትር',
    barcode: '6130004000017',
    unit: 'pcs',
    cost_price: 18000,
    sell_price: 22000,
    reorder_level: 10,
    opening_qty: 14,
  },
  {
    name: 'Teff Flour 1kg',
    name_am: 'የጤፍ ዱቄት 1 ኪሎ',
    barcode: '6130005000014',
    unit: 'kg',
    cost_price: 9500,
    sell_price: 12000,
    reorder_level: 15,
    opening_qty: 22,
  },
  {
    name: 'Berbere 250g',
    name_am: 'በርበሬ 250 ግራም',
    barcode: '6130005000021',
    unit: 'pcs',
    cost_price: 11500,
    sell_price: 15000,
    reorder_level: 10,
    opening_qty: 9, // low
  },
  {
    name: 'Shiro Powder 500g',
    name_am: 'ሽሮ ዱቄት 500 ግራም',
    barcode: '6130005000038',
    unit: 'pcs',
    cost_price: 14000,
    sell_price: 18000,
    reorder_level: 10,
    opening_qty: 16,
  },
  {
    name: 'Sugar 1kg',
    name_am: 'ስኳር 1 ኪሎ',
    barcode: '6130006000011',
    unit: 'kg',
    cost_price: 6800,
    sell_price: 8500,
    reorder_level: 20,
    opening_qty: 40,
  },
  {
    name: 'Ground Coffee 500g',
    name_am: 'የተፈጨ ቡና 500 ግራም',
    barcode: '6130007000018',
    unit: 'pcs',
    cost_price: 28000,
    sell_price: 35000,
    reorder_level: 8,
    opening_qty: 5, // low
  },
  {
    name: 'Shola Milk 1L',
    name_am: 'ሾላ ወተት 1 ሊትር',
    barcode: '6130008000015',
    unit: 'pcs',
    cost_price: 7000,
    sell_price: 9000,
    reorder_level: 12,
    opening_qty: 18,
  },
  {
    name: 'Omo Detergent 500g',
    name_am: 'ኦሞ ሳሙና ዱቄት 500 ግራም',
    barcode: '6130002000020',
    unit: 'pcs',
    cost_price: 12500,
    sell_price: 16000,
    reorder_level: 10,
    opening_qty: 12,
  },
  {
    name: 'Salt 1kg',
    name_am: 'ጨው 1 ኪሎ',
    barcode: '6130006000028',
    unit: 'kg',
    cost_price: 2200,
    sell_price: 3000,
    reorder_level: 15,
    opening_qty: 25,
  },
  {
    name: 'Matches 10 pack',
    name_am: 'ክብሪት 10 ጥቅል',
    barcode: '6130009000012',
    unit: 'pack',
    cost_price: 700,
    sell_price: 1000,
    reorder_level: 20,
    opening_qty: 60,
  },
];
