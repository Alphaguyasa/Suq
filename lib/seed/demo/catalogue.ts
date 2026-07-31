import type { Unit } from '@/lib/db';

export type Category = 'drinks' | 'dry' | 'cleaning' | 'dairy' | 'snacks' | 'household';

export interface DemoProduct {
  name: string;
  name_am: string;
  barcode: string;
  unit: Unit;
  /** integer cents */
  cost_price: number;
  sell_price: number;
  reorder_level: number;
  category: Category;
  /** Rough relative sales frequency. Water and bread move; light bulbs do not. */
  popularity: number;
}

/**
 * Sixty things actually on the shelf in an Addis supermarket, with margins a
 * shopkeeper would recognise (roughly 18–35%, thinner on oil and coffee where
 * the ticket is large).
 *
 * A client reads this screen during the demo, so there is no "Product A"
 * anywhere and every Amharic name is the real one, not a transliteration.
 */
type Row = [
  name: string,
  name_am: string,
  unit: Unit,
  cost: number,
  sell: number,
  reorder: number,
  category: Category,
  popularity: number,
];

const ROWS: Row[] = [
  // ---- drinks ----------------------------------------------------------
  ['Ambo Water 1L', 'አምቦ ውሃ 1 ሊትር', 'pcs', 2600, 3500, 24, 'drinks', 10],
  ['Highland Water 1L', 'ሃይላንድ ውሃ 1 ሊትር', 'pcs', 1800, 2500, 24, 'drinks', 10],
  ['Highland Water 500ml', 'ሃይላንድ ውሃ ግማሽ ሊትር', 'pcs', 1000, 1500, 36, 'drinks', 9],
  ['Ambo Flavoured 500ml', 'አምቦ ጣዕም ያለው', 'pcs', 2200, 3000, 18, 'drinks', 5],
  ['Coca-Cola 300ml', 'ኮካ ኮላ 300 ሚሊ', 'pcs', 2000, 2800, 24, 'drinks', 9],
  ['Pepsi 300ml', 'ፔፕሲ 300 ሚሊ', 'pcs', 2000, 2800, 24, 'drinks', 7],
  ['Sprite 300ml', 'ስፕራይት 300 ሚሊ', 'pcs', 2000, 2800, 18, 'drinks', 6],
  ['Moha Orange Juice 1L', 'ሞሃ የብርቱካን ጭማቂ', 'pcs', 5500, 7000, 12, 'drinks', 4],
  ['Tea Bags 100s', 'ሻይ ቅጠል 100', 'pcs', 7000, 9000, 10, 'drinks', 4],

  // ---- dry goods -------------------------------------------------------
  ['Ades Macaroni 500g', 'አዴስ መኮረኒ 500 ግራም', 'pcs', 5800, 7500, 20, 'dry', 8],
  ['Shola Pasta 500g', 'ሾላ ፓስታ 500 ግራም', 'pcs', 5400, 7000, 20, 'dry', 8],
  ['Ades Spaghetti 500g', 'አዴስ ስፓጌቲ 500 ግራም', 'pcs', 5900, 7600, 16, 'dry', 6],
  ['Teff Flour White 1kg', 'ነጭ የጤፍ ዱቄት 1 ኪሎ', 'kg', 9500, 12000, 15, 'dry', 7],
  ['Teff Flour Red 1kg', 'ቀይ የጤፍ ዱቄት 1 ኪሎ', 'kg', 8500, 11000, 15, 'dry', 6],
  ['Wheat Flour 1kg', 'የስንዴ ዱቄት 1 ኪሎ', 'kg', 5000, 6500, 15, 'dry', 6],
  ['Berbere 250g', 'በርበሬ 250 ግራም', 'pcs', 11500, 15000, 10, 'dry', 6],
  ['Mitmita 100g', 'ሚጥሚጣ 100 ግራም', 'pcs', 6000, 8000, 10, 'dry', 4],
  ['Shiro Powder 500g', 'ሽሮ ዱቄት 500 ግራም', 'pcs', 14000, 18000, 10, 'dry', 7],
  ['Sugar 1kg', 'ስኳር 1 ኪሎ', 'kg', 6800, 8500, 20, 'dry', 9],
  ['Salt 1kg', 'ጨው 1 ኪሎ', 'kg', 2200, 3000, 15, 'dry', 6],
  ['Sunflower Oil 1L', 'የሱፍ ዘይት 1 ሊትር', 'pcs', 18000, 22000, 10, 'dry', 8],
  ['Sunflower Oil 3L', 'የሱፍ ዘይት 3 ሊትር', 'pcs', 52000, 62000, 6, 'dry', 4],
  ['Rice 1kg', 'ሩዝ 1 ኪሎ', 'kg', 8000, 10000, 15, 'dry', 6],
  ['Red Lentils 1kg', 'ቀይ ምስር 1 ኪሎ', 'kg', 11000, 14000, 10, 'dry', 5],
  ['Chickpeas 1kg', 'ሽምብራ 1 ኪሎ', 'kg', 9000, 11500, 10, 'dry', 4],
  ['Ground Coffee 500g', 'የተፈጨ ቡና 500 ግራም', 'pcs', 28000, 35000, 8, 'dry', 6],
  ['Coffee Beans 1kg', 'ቡና ፍሬ 1 ኪሎ', 'kg', 52000, 65000, 5, 'dry', 4],
  ['Tomato Paste 400g', 'የቲማቲም ድልህ', 'pcs', 4500, 6000, 12, 'dry', 5],

  // ---- soap and cleaning ----------------------------------------------
  ['Abay Soap 200g', 'አባይ ሳሙና 200 ግራም', 'pcs', 3000, 4000, 12, 'cleaning', 8],
  ['Omo Detergent 500g', 'ኦሞ ሳሙና ዱቄት 500 ግራም', 'pcs', 12500, 16000, 10, 'cleaning', 7],
  ['Omo Detergent 1kg', 'ኦሞ ሳሙና ዱቄት 1 ኪሎ', 'pcs', 23000, 29000, 8, 'cleaning', 5],
  ['Ariel Detergent 500g', 'አሪኤል ሳሙና ዱቄት', 'pcs', 13500, 17000, 8, 'cleaning', 4],
  ['Dish Soap 500ml', 'የዕቃ ማጠቢያ ሳሙና', 'pcs', 7000, 9000, 10, 'cleaning', 6],
  ['Bleach 1L', 'ብሊች 1 ሊትር', 'pcs', 5000, 6500, 10, 'cleaning', 4],
  ['Floor Cleaner 1L', 'የወለል ማጽጃ 1 ሊትር', 'pcs', 9000, 11500, 8, 'cleaning', 4],
  ['Toilet Paper 4 roll', 'የሽንት ቤት ወረቀት 4', 'pack', 8000, 10500, 12, 'cleaning', 6],
  ['Hand Soap bar', 'የእጅ ሳሙና', 'pcs', 3500, 4500, 15, 'cleaning', 6],
  ['Laundry Bar Soap', 'የልብስ ሳሙና', 'pcs', 2800, 3800, 15, 'cleaning', 6],

  // ---- dairy -----------------------------------------------------------
  ['Shola Milk 1L', 'ሾላ ወተት 1 ሊትር', 'pcs', 7000, 9000, 12, 'dairy', 8],
  ['Family Milk 1L', 'ፋሚሊ ወተት 1 ሊትር', 'pcs', 6800, 8800, 12, 'dairy', 6],
  ['Yoghurt 500ml', 'እርጎ ግማሽ ሊትር', 'pcs', 4500, 6000, 10, 'dairy', 6],
  ['Butter 250g', 'ቅቤ 250 ግራም', 'pcs', 18000, 23000, 6, 'dairy', 4],
  ['Ayib Cheese 250g', 'አይብ 250 ግራም', 'pcs', 8000, 10500, 8, 'dairy', 4],
  ['Eggs tray of 30', 'እንቁላል ትሪ 30', 'pack', 32000, 40000, 6, 'dairy', 6],

  // ---- snacks ----------------------------------------------------------
  ['Biscuits', 'ብስኩት', 'pcs', 2000, 2800, 24, 'snacks', 8],
  ['Wafers', 'ዋፈር', 'pcs', 2500, 3400, 20, 'snacks', 6],
  ['Crisps', 'ችፕስ', 'pcs', 2200, 3000, 20, 'snacks', 6],
  ['Chewing Gum', 'ማስቲካ', 'pcs', 800, 1200, 40, 'snacks', 9],
  ['Chocolate bar', 'ቸኮሌት', 'pcs', 4000, 5500, 15, 'snacks', 5],
  ['Peanuts 200g', 'ኦቾሎኒ 200 ግራም', 'pcs', 4500, 6000, 12, 'snacks', 5],
  ['Dabo Kolo 250g', 'ዳቦ ቆሎ 250 ግራም', 'pcs', 3500, 4800, 12, 'snacks', 5],
  ['Sweets', 'ከረሜላ', 'pcs', 500, 800, 50, 'snacks', 8],
  ['Bread loaf', 'ዳቦ', 'pcs', 1800, 2500, 20, 'snacks', 10],
  ['Popcorn 500g', 'ፖፕኮርን 500 ግራም', 'pcs', 3000, 4200, 10, 'snacks', 4],

  // ---- household -------------------------------------------------------
  ['Matches 10 pack', 'ክብሪት 10 ጥቅል', 'pack', 700, 1000, 20, 'household', 7],
  ['Candles 6 pack', 'ሻማ 6 ጥቅል', 'pack', 2500, 3500, 15, 'household', 6],
  ['Batteries AA 4 pack', 'ባትሪ AA 4', 'pack', 6000, 8000, 10, 'household', 4],
  ['LED Bulb', 'አምፑል', 'pcs', 7000, 9500, 8, 'household', 3],
  ['Plastic Bags 100', 'ፌስታል 100', 'pack', 4000, 5500, 10, 'household', 5],
  ['Exercise Book', 'ደብተር', 'pcs', 3000, 4000, 15, 'household', 4],
];

export const DEMO_CATALOGUE: DemoProduct[] = ROWS.map(
  ([name, name_am, unit, cost_price, sell_price, reorder_level, category, popularity], index) => ({
    name,
    name_am,
    // 613 is Ethiopia's GS1 prefix.
    barcode: `613${String(index + 1).padStart(10, '0')}`,
    unit,
    cost_price,
    sell_price,
    reorder_level,
    category,
    popularity,
  }),
);
