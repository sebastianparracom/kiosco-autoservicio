// Menú del demo: bebidas, variaciones y precios en dólares (USD) y pesos (COP).
// Los precios en pesos NO son una conversión: están calibrados contra cafés
// de especialidad en Colombia (Juan Valdez y Starbucks Colombia, nov. 2026).
// Todo el precio se calcula en código a partir de estas tablas.

export type Size = "pequeno" | "mediano" | "grande";
export type Milk = "entera" | "deslactosada" | "avena" | "almendra";
export type Temp = "caliente" | "frio";
export type Flavor = "ninguno" | "vainilla" | "caramelo" | "avellana";
export type Lang = "es" | "en";
export type Currency = "USD" | "COP";

/** Un precio por moneda. */
export type Price = Record<Currency, number>;
export type Text = Record<Lang, string>;

export type ProductId =
  | "tinto"
  | "espresso"
  | "capuchino"
  | "latte"
  | "mocca"
  | "chocolate"
  | "matcha"
  | "chai"
  | "cold_brew"
  | "granizado";

export interface Product {
  id: ProductId;
  name: Text;
  /** Nombre cuando se sirve frío (si el producto admite ambas temperaturas). */
  coldName?: Text;
  /** Precio base: tamaño mediano, receta por defecto. */
  basePrice: Price;
  temps: Temp[];
  defaultTemp: Temp;
  hasSize: boolean;
  hasMilk: boolean;
  /** Rango de shots de espresso; null si no aplica. */
  shots: { min: number; max: number; default: number } | null;
  hasFlavor: boolean;
  /** Cómo lo pide un cliente (lo usa el modelo para reconocerlo). */
  spoken: Text;
  /** Descripción visual para generar la imagen. */
  visual: { caliente?: string; frio?: string };
}

export const SIZES: Record<Size, { label: Text; delta: Price }> = {
  pequeno: { label: { es: "Pequeño", en: "Small" }, delta: { USD: -0.5, COP: -1500 } },
  mediano: { label: { es: "Mediano", en: "Medium" }, delta: { USD: 0, COP: 0 } },
  grande: { label: { es: "Grande", en: "Large" }, delta: { USD: 0.75, COP: 2500 } },
};

export const MILKS: Record<Milk, { label: Text; delta: Price }> = {
  entera: { label: { es: "Entera", en: "Whole" }, delta: { USD: 0, COP: 0 } },
  deslactosada: { label: { es: "Deslactosada", en: "Lactose-free" }, delta: { USD: 0, COP: 0 } },
  avena: { label: { es: "Avena", en: "Oat" }, delta: { USD: 0.7, COP: 2500 } },
  almendra: { label: { es: "Almendra", en: "Almond" }, delta: { USD: 0.7, COP: 2500 } },
};

export const FLAVORS: Record<Flavor, { label: Text; delta: Price }> = {
  ninguno: { label: { es: "Sin sabor", en: "No flavor" }, delta: { USD: 0, COP: 0 } },
  vainilla: { label: { es: "Vainilla", en: "Vanilla" }, delta: { USD: 0.6, COP: 2000 } },
  caramelo: { label: { es: "Caramelo", en: "Caramel" }, delta: { USD: 0.6, COP: 2000 } },
  avellana: { label: { es: "Avellana", en: "Hazelnut" }, delta: { USD: 0.6, COP: 2000 } },
};

export const TEMPS: Record<Temp, { label: Text }> = {
  caliente: { label: { es: "Caliente", en: "Hot" } },
  frio: { label: { es: "Frío", en: "Iced" } },
};

/** Recargo por servir frío una bebida que por defecto es caliente. */
export const ICED_DELTA: Price = { USD: 0.5, COP: 2500 };
/** Precio de cada shot de espresso por encima de la receta. */
export const EXTRA_SHOT: Price = { USD: 0.8, COP: 2500 };

export const DEFAULT_SIZE: Size = "mediano";
export const DEFAULT_MILK: Milk = "entera";

export const PRODUCTS: Product[] = [
  {
    id: "tinto",
    name: { es: "Tinto", en: "Black Coffee" },
    coldName: { es: "Tinto frío", en: "Iced Black Coffee" },
    basePrice: { USD: 2.5, COP: 6500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: false,
    shots: null,
    hasFlavor: true,
    spoken: {
      es: "Tinto: café negro colombiano sin leche. También lo piden como americano, café negro, café solo, tintico o café filtrado.",
      en: "Black coffee: Colombian coffee with no milk. Also ordered as tinto, americano, drip coffee, filter coffee or just coffee.",
    },
    visual: {
      caliente: "a clear glass mug of black filter coffee, no milk, light steam",
      frio: "a tall clear glass of iced black coffee with ice cubes, no milk",
    },
  },
  {
    id: "espresso",
    name: { es: "Espresso", en: "Espresso" },
    basePrice: { USD: 2.25, COP: 7500 },
    temps: ["caliente"],
    defaultTemp: "caliente",
    hasSize: false,
    hasMilk: false,
    shots: { min: 1, max: 3, default: 1 },
    hasFlavor: false,
    spoken: {
      es: "Espresso: café expreso corto y concentrado. También lo piden como expreso o exprés.",
      en: "Espresso: a short, concentrated coffee shot. Also ordered as expresso.",
    },
    visual: {
      caliente: "a small clear glass demitasse cup of espresso with golden crema on top",
    },
  },
  {
    id: "capuchino",
    name: { es: "Capuchino", en: "Cappuccino" },
    coldName: { es: "Capuchino frío", en: "Iced Cappuccino" },
    basePrice: { USD: 3.75, COP: 11500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: {
      es: "Capuchino: espresso con leche y mucha espuma. También escrito cappuccino o capuccino.",
      en: "Cappuccino: espresso with milk and lots of foam. Also spelled capuccino or capuchino.",
    },
    visual: {
      caliente:
        "a clear glass mug of cappuccino with a dark espresso layer, steamed milk and a very thick tall white milk foam cap dusted with cocoa",
      frio: "a tall clear glass of iced cappuccino with ice cubes, coffee and milk, topped with thick cold milk foam dusted with cocoa",
    },
  },
  {
    id: "latte",
    name: { es: "Latte", en: "Latte" },
    coldName: { es: "Latte frío", en: "Iced Latte" },
    basePrice: { USD: 3.75, COP: 11500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: {
      es: "Latte: espresso con bastante leche vaporizada. También lo piden como café latte o café con leche.",
      en: "Latte: espresso with plenty of steamed milk. Also ordered as caffe latte, cafe latte or coffee with milk.",
    },
    visual: {
      caliente:
        "a clear glass mug of caffe latte, uniform light caramel-beige milky coffee with a thin layer of microfoam and simple latte art",
      frio: "a tall clear glass of iced caffe latte with ice cubes, creamy light brown milky coffee",
    },
  },
  {
    id: "mocca",
    name: { es: "Mocca", en: "Mocha" },
    coldName: { es: "Mocca frío", en: "Iced Mocha" },
    basePrice: { USD: 4.25, COP: 14500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: {
      es: "Mocca: espresso con chocolate y leche. También lo piden como moca, mocaccino, mocachino o café con chocolate.",
      en: "Mocha: espresso with chocolate and milk. Also ordered as mocca, mochaccino or chocolate coffee.",
    },
    visual: {
      caliente:
        "a clear glass mug of caffe mocha, dark chocolate-brown coffee with milk, topped with whipped cream and a chocolate drizzle",
      frio: "a tall clear glass of iced mocha with ice cubes, chocolate syrup swirls on the inside of the glass, dark chocolate-brown milky coffee",
    },
  },
  {
    id: "chocolate",
    name: { es: "Chocolate", en: "Hot Chocolate" },
    coldName: { es: "Chocolate frío", en: "Iced Chocolate" },
    basePrice: { USD: 3.5, COP: 12500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: {
      es: "Chocolate: bebida de chocolate con leche, sin café. También lo piden como chocolate caliente o chocolatico.",
      en: "Hot chocolate: a chocolate and milk drink with no coffee. Also ordered as chocolate, cocoa or chocolate milk.",
    },
    visual: {
      caliente: "a clear glass mug of rich hot chocolate, deep brown, with a light froth and three small marshmallows on top",
      frio: "a tall clear glass of iced chocolate milk with ice cubes, deep brown",
    },
  },
  {
    id: "matcha",
    name: { es: "Matcha Latte", en: "Matcha Latte" },
    coldName: { es: "Matcha Latte frío", en: "Iced Matcha Latte" },
    basePrice: { USD: 4.5, COP: 16500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: {
      es: "Matcha Latte: té verde matcha con leche. También lo piden como matcha o té matcha.",
      en: "Matcha latte: matcha green tea with milk. Also ordered as matcha or green tea latte.",
    },
    visual: {
      caliente: "a clear glass mug of matcha latte, vivid green tea with milk and white microfoam on top",
      frio: "a tall clear glass of iced matcha latte with ice cubes, vivid green with white milk swirls",
    },
  },
  {
    id: "chai",
    name: { es: "Chai Latte", en: "Chai Latte" },
    coldName: { es: "Chai Latte frío", en: "Iced Chai Latte" },
    basePrice: { USD: 4.25, COP: 15500 },
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: {
      es: "Chai Latte: té chai especiado con leche. También lo piden como chai o té chai.",
      en: "Chai latte: spiced chai tea with milk. Also ordered as chai or chai tea.",
    },
    visual: {
      caliente:
        "a clear glass mug of chai latte, warm tan spiced milk tea with foam on top, dusted with cinnamon, one cinnamon stick resting in the mug",
      frio: "a tall clear glass of iced chai latte with ice cubes, warm tan spiced milk tea, dusted with cinnamon",
    },
  },
  {
    id: "cold_brew",
    name: { es: "Cold Brew", en: "Cold Brew" },
    basePrice: { USD: 3.75, COP: 13500 },
    temps: ["frio"],
    defaultTemp: "frio",
    hasSize: true,
    hasMilk: false,
    shots: null,
    hasFlavor: true,
    spoken: {
      es: "Cold Brew: café infusionado en frío, servido con hielo. También lo piden como col bru o café en frío.",
      en: "Cold brew: coffee steeped cold and served over ice. Also ordered as cold brew coffee.",
    },
    visual: {
      frio: "a short wide clear rocks glass of very dark cold brew coffee with one large clear ice cube",
    },
  },
  {
    id: "granizado",
    name: { es: "Granizado de café", en: "Coffee Frappé" },
    basePrice: { USD: 4.75, COP: 14500 },
    temps: ["frio"],
    defaultTemp: "frio",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 1 },
    hasFlavor: true,
    spoken: {
      es: "Granizado de café: café helado batido con hielo. También lo piden como granizado, frappé, frapé o café frappé.",
      en: "Coffee frappé: coffee blended with ice. Also ordered as frappe, frappuccino, blended coffee or granizado.",
    },
    visual: {
      frio: "a tall clear glass of blended frozen coffee frappe, thick icy light-brown slush texture, topped with whipped cream and coffee dust, with a straw",
    },
  },
];

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<ProductId, Product>;

export function imageFor(productId: ProductId, temp: Temp): string {
  return `/drinks/${productId}-${temp}.png`;
}

/** Formatea un precio: USD con centavos ($3.75), COP sin decimales ($11.500). */
export function money(n: number, currency: Currency, lang: Lang): string {
  if (currency === "USD") return `$${n.toFixed(2)}`;
  const digits = new Intl.NumberFormat(lang === "es" ? "es-CO" : "en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
  return `$${digits}`;
}
