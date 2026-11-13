// Menú del demo: bebidas, variaciones y precios (USD).
// Todo el precio se calcula en código a partir de estas tablas.

export type Size = "pequeno" | "mediano" | "grande";
export type Milk = "entera" | "deslactosada" | "avena" | "almendra";
export type Temp = "caliente" | "frio";
export type Flavor = "ninguno" | "vainilla" | "caramelo" | "avellana";

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
  name: string;
  /** Nombre cuando se sirve frío (si el producto admite ambas temperaturas). */
  coldName?: string;
  /** Precio base: tamaño mediano, receta por defecto. */
  basePrice: number;
  temps: Temp[];
  defaultTemp: Temp;
  hasSize: boolean;
  hasMilk: boolean;
  /** Rango de shots de espresso; null si no aplica. */
  shots: { min: number; max: number; default: number } | null;
  hasFlavor: boolean;
  /** Cómo lo pide un cliente (lo usa el modelo para reconocerlo). */
  spoken: string;
  /** Descripción visual para generar la imagen. */
  visual: { caliente?: string; frio?: string };
}

export const SIZES: Record<Size, { label: string; oz: number; delta: number }> = {
  pequeno: { label: "Pequeño", oz: 8, delta: -0.5 },
  mediano: { label: "Mediano", oz: 12, delta: 0 },
  grande: { label: "Grande", oz: 16, delta: 0.75 },
};

export const MILKS: Record<Milk, { label: string; delta: number }> = {
  entera: { label: "Entera", delta: 0 },
  deslactosada: { label: "Deslactosada", delta: 0 },
  avena: { label: "Avena", delta: 0.7 },
  almendra: { label: "Almendra", delta: 0.7 },
};

export const FLAVORS: Record<Flavor, { label: string; delta: number }> = {
  ninguno: { label: "Sin sabor", delta: 0 },
  vainilla: { label: "Vainilla", delta: 0.6 },
  caramelo: { label: "Caramelo", delta: 0.6 },
  avellana: { label: "Avellana", delta: 0.6 },
};

export const TEMPS: Record<Temp, { label: string }> = {
  caliente: { label: "Caliente" },
  frio: { label: "Frío" },
};

/** Recargo por servir frío una bebida que por defecto es caliente. */
export const ICED_DELTA = 0.5;
/** Precio de cada shot de espresso por encima de la receta. */
export const EXTRA_SHOT = 0.8;

export const DEFAULT_SIZE: Size = "mediano";
export const DEFAULT_MILK: Milk = "entera";

export const PRODUCTS: Product[] = [
  {
    id: "tinto",
    name: "Tinto",
    coldName: "Tinto frío",
    basePrice: 2.5,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: false,
    shots: null,
    hasFlavor: true,
    spoken:
      "Tinto: café negro colombiano sin leche. También lo piden como americano, café negro, café solo, tintico o café filtrado.",
    visual: {
      caliente: "a clear glass mug of black filter coffee, no milk, light steam",
      frio: "a tall clear glass of iced black coffee with ice cubes, no milk",
    },
  },
  {
    id: "espresso",
    name: "Espresso",
    basePrice: 2.25,
    temps: ["caliente"],
    defaultTemp: "caliente",
    hasSize: false,
    hasMilk: false,
    shots: { min: 1, max: 3, default: 1 },
    hasFlavor: false,
    spoken: "Espresso: café expreso corto y concentrado. También lo piden como expreso o exprés.",
    visual: {
      caliente: "a small clear glass demitasse cup of espresso with golden crema on top",
    },
  },
  {
    id: "capuchino",
    name: "Capuchino",
    coldName: "Capuchino frío",
    basePrice: 3.75,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: "Capuchino: espresso con leche y mucha espuma. También escrito cappuccino o capuccino.",
    visual: {
      caliente:
        "a clear glass mug of cappuccino with a dark espresso layer, steamed milk and a very thick tall white milk foam cap dusted with cocoa",
      frio: "a tall clear glass of iced cappuccino with ice cubes, coffee and milk, topped with thick cold milk foam dusted with cocoa",
    },
  },
  {
    id: "latte",
    name: "Latte",
    coldName: "Latte frío",
    basePrice: 3.75,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: "Latte: espresso con bastante leche vaporizada. También lo piden como café latte o café con leche.",
    visual: {
      caliente:
        "a clear glass mug of caffe latte, uniform light caramel-beige milky coffee with a thin layer of microfoam and simple latte art",
      frio: "a tall clear glass of iced caffe latte with ice cubes, creamy light brown milky coffee",
    },
  },
  {
    id: "mocca",
    name: "Mocca",
    coldName: "Mocca frío",
    basePrice: 4.25,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 2 },
    hasFlavor: true,
    spoken: "Mocca: espresso con chocolate y leche. También lo piden como moca, mocaccino, mocachino o café con chocolate.",
    visual: {
      caliente:
        "a clear glass mug of caffe mocha, dark chocolate-brown coffee with milk, topped with whipped cream and a chocolate drizzle",
      frio: "a tall clear glass of iced mocha with ice cubes, chocolate syrup swirls on the inside of the glass, dark chocolate-brown milky coffee",
    },
  },
  {
    id: "chocolate",
    name: "Chocolate",
    coldName: "Chocolate frío",
    basePrice: 3.5,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: "Chocolate: bebida de chocolate con leche, sin café. También lo piden como chocolate caliente o chocolatico.",
    visual: {
      caliente: "a clear glass mug of rich hot chocolate, deep brown, with a light froth and three small marshmallows on top",
      frio: "a tall clear glass of iced chocolate milk with ice cubes, deep brown",
    },
  },
  {
    id: "matcha",
    name: "Matcha Latte",
    coldName: "Matcha Latte frío",
    basePrice: 4.5,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: "Matcha Latte: té verde matcha con leche. También lo piden como matcha o té matcha.",
    visual: {
      caliente: "a clear glass mug of matcha latte, vivid green tea with milk and white microfoam on top",
      frio: "a tall clear glass of iced matcha latte with ice cubes, vivid green with white milk swirls",
    },
  },
  {
    id: "chai",
    name: "Chai Latte",
    coldName: "Chai Latte frío",
    basePrice: 4.25,
    temps: ["caliente", "frio"],
    defaultTemp: "caliente",
    hasSize: true,
    hasMilk: true,
    shots: null,
    hasFlavor: true,
    spoken: "Chai Latte: té chai especiado con leche. También lo piden como chai o té chai.",
    visual: {
      caliente:
        "a clear glass mug of chai latte, warm tan spiced milk tea with foam on top, dusted with cinnamon, one cinnamon stick resting in the mug",
      frio: "a tall clear glass of iced chai latte with ice cubes, warm tan spiced milk tea, dusted with cinnamon",
    },
  },
  {
    id: "cold_brew",
    name: "Cold Brew",
    basePrice: 3.75,
    temps: ["frio"],
    defaultTemp: "frio",
    hasSize: true,
    hasMilk: false,
    shots: null,
    hasFlavor: true,
    spoken: "Cold Brew: café infusionado en frío, servido con hielo. También lo piden como col bru o café en frío.",
    visual: {
      frio: "a short wide clear rocks glass of very dark cold brew coffee with one large clear ice cube",
    },
  },
  {
    id: "granizado",
    name: "Granizado de café",
    basePrice: 4.75,
    temps: ["frio"],
    defaultTemp: "frio",
    hasSize: true,
    hasMilk: true,
    shots: { min: 1, max: 3, default: 1 },
    hasFlavor: true,
    spoken: "Granizado de café: café helado batido con hielo. También lo piden como granizado, frappé, frapé o café frappé.",
    visual: {
      frio: "a tall clear glass of blended frozen coffee frappe, thick icy light-brown slush texture, topped with whipped cream and coffee dust, with a straw",
    },
  },
];

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<ProductId, Product>;

export function imageFor(productId: ProductId, temp: Temp): string {
  return `/drinks/${productId}-${temp}.png`;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
