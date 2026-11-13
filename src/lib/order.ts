// Estado del pedido y reglas deterministas: el modelo decide QUÉ pidió el
// cliente; este archivo decide cómo cambia el carrito y cuánto cuesta.
import {
  DEFAULT_MILK,
  DEFAULT_SIZE,
  EXTRA_SHOT,
  FLAVORS,
  ICED_DELTA,
  MILKS,
  PRODUCT_BY_ID,
  SIZES,
  TEMPS,
  type Flavor,
  type Milk,
  type ProductId,
  type Size,
  type Temp,
} from "./menu";

export interface CartLine {
  id: string;
  product: ProductId;
  size: Size;
  milk: Milk;
  temp: Temp;
  shots: number;
  flavor: Flavor;
}

export interface Attrs {
  size?: Size;
  milk?: Milk;
  temp?: Temp;
  shots?: number;
  flavor?: Flavor;
}

export type Target =
  | { kind: "linea"; index: number }
  | { kind: "ultima" }
  | { kind: "una" }
  | { kind: "otra" }
  | { kind: "todas" };

/** Lo que el modelo entendió de un fragmento de frase. */
export interface Interpretation {
  action: "agregar" | "modificar" | "quitar" | "nada";
  product: ProductId | null;
  qty: number | null;
  target: Target | null;
  plural: boolean;
  attrs: Attrs;
}

export interface OrderState {
  lines: CartLine[];
  /** Bebidas de las que se está hablando ahora mismo. */
  focus: string[];
  /** Grupo de bebidas parecidas, para resolver "una" / "la otra". */
  group: string[];
  /** Miembros del grupo ya señalados individualmente. */
  groupUsed: string[];
  counter: number;
}

export const EMPTY_ORDER: OrderState = { lines: [], focus: [], group: [], groupUsed: [], counter: 0 };

export function newLine(id: string, product: ProductId, attrs: Attrs = {}): CartLine {
  const p = PRODUCT_BY_ID[product];
  const line: CartLine = {
    id,
    product,
    size: DEFAULT_SIZE,
    milk: DEFAULT_MILK,
    temp: p.defaultTemp,
    shots: p.shots?.default ?? 0,
    flavor: "ninguno",
  };
  return withAttrs(line, attrs);
}

/** Aplica cambios respetando lo que el producto permite. */
export function withAttrs(line: CartLine, attrs: Attrs): CartLine {
  const p = PRODUCT_BY_ID[line.product];
  const next = { ...line };
  if (attrs.size && p.hasSize) next.size = attrs.size;
  if (attrs.milk && p.hasMilk) next.milk = attrs.milk;
  if (attrs.temp && p.temps.includes(attrs.temp)) next.temp = attrs.temp;
  if (attrs.shots != null && p.shots) next.shots = Math.min(p.shots.max, Math.max(p.shots.min, attrs.shots));
  if (attrs.flavor && p.hasFlavor) next.flavor = attrs.flavor;
  return next;
}

export interface PriceLine {
  label: string;
  amount: number;
}

/** Desglose del precio de una bebida: base + cada modificación. */
export function priceBreakdown(line: CartLine): PriceLine[] {
  const p = PRODUCT_BY_ID[line.product];
  const out: PriceLine[] = [{ label: `${p.name} (base)`, amount: p.basePrice }];
  if (p.hasSize && SIZES[line.size].delta !== 0)
    out.push({ label: `Tamaño ${SIZES[line.size].label.toLowerCase()}`, amount: SIZES[line.size].delta });
  if (line.temp === "frio" && p.defaultTemp === "caliente") out.push({ label: "Frío", amount: ICED_DELTA });
  if (p.hasMilk && MILKS[line.milk].delta !== 0)
    out.push({ label: `Leche de ${MILKS[line.milk].label.toLowerCase()}`, amount: MILKS[line.milk].delta });
  if (p.shots && line.shots > p.shots.default) {
    const extra = line.shots - p.shots.default;
    out.push({ label: `${extra} shot${extra > 1 ? "s" : ""} extra`, amount: extra * EXTRA_SHOT });
  }
  if (p.hasFlavor && line.flavor !== "ninguno")
    out.push({ label: `Sabor ${FLAVORS[line.flavor].label.toLowerCase()}`, amount: FLAVORS[line.flavor].delta });
  return out;
}

export function linePrice(line: CartLine): number {
  return Math.round(priceBreakdown(line).reduce((s, x) => s + x.amount, 0) * 100) / 100;
}

export function orderTotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((s, l) => s + linePrice(l), 0) * 100) / 100;
}

export function lineName(line: CartLine): string {
  const p = PRODUCT_BY_ID[line.product];
  return line.temp === "frio" && p.coldName ? p.coldName : p.name;
}

/** Descripción en una frase, para el modelo y para el resumen. */
export function describeLine(line: CartLine): string {
  const p = PRODUCT_BY_ID[line.product];
  const parts = [p.name];
  if (p.hasSize) parts.push(SIZES[line.size].label.toLowerCase());
  parts.push(TEMPS[line.temp].label.toLowerCase());
  if (p.hasMilk) parts.push(`leche ${MILKS[line.milk].label.toLowerCase()}`);
  if (p.shots) parts.push(`${line.shots} shot${line.shots === 1 ? "" : "s"}`);
  if (p.hasFlavor && line.flavor !== "ninguno") parts.push(`sabor ${FLAVORS[line.flavor].label.toLowerCase()}`);
  return parts.join(", ");
}

const MAX_LINES = 8;

function resolveTargets(state: OrderState, it: Interpretation): { ids: string[]; group?: string[] } {
  const { lines } = state;
  if (!lines.length) return { ids: [] };
  const byProduct = it.product ? lines.filter((l) => l.product === it.product).map((l) => l.id) : [];
  const t = it.target;

  if (t?.kind === "todas") return { ids: lines.map((l) => l.id) };

  if (t?.kind === "otra") {
    const pool = state.group.length > 1 ? state.group : byProduct.length > 1 ? byProduct : lines.map((l) => l.id);
    const rest = pool.filter((id) => !state.focus.includes(id));
    const unused = rest.filter((id) => !state.groupUsed.includes(id));
    const pick = unused[0] ?? rest[0];
    return pick ? { ids: [pick], group: pool } : { ids: [] };
  }

  if (t?.kind === "una") {
    const pool = byProduct.length > 1 ? byProduct : state.group.length > 1 ? state.group : state.focus;
    const samePool = pool.length === state.group.length && pool.every((id) => state.group.includes(id));
    const used = samePool ? state.groupUsed : [];
    const pick = pool.find((id) => !used.includes(id)) ?? pool[0];
    return pick ? { ids: [pick], group: pool } : { ids: [] };
  }

  if (t?.kind === "linea" && lines[t.index]) {
    const line = lines[t.index];
    const same = lines.filter((l) => l.product === line.product).map((l) => l.id);
    if (it.plural && same.length > 1) return { ids: same, group: same };
    return { ids: [line.id], group: same };
  }

  // Nombró un producto sin señalar una línea concreta.
  if (byProduct.length) {
    if (it.plural) return { ids: byProduct, group: byProduct };
    const inFocus = byProduct.find((id) => state.focus.includes(id));
    return { ids: [inFocus ?? byProduct[byProduct.length - 1]], group: byProduct };
  }

  // "ese", "la misma" o sin referencia: la bebida de la que se venía hablando.
  if (state.focus.length) return { ids: state.focus };
  return { ids: [lines[lines.length - 1].id] };
}

/** Aplica al carrito lo que el modelo entendió de un fragmento. */
export function applyInterpretation(state: OrderState, it: Interpretation, open = false): OrderState {
  const hasAttrs = Object.keys(it.attrs).length > 0;
  let action = it.action;

  // "El latte que sea frío" sin ningún latte en el pedido: en realidad lo está pidiendo.
  if (action === "modificar" && it.product && !state.lines.some((l) => l.product === it.product) && it.target?.kind !== "linea")
    action = "agregar";
  // Nombró una bebida del pedido sin cambiarle nada: solo fija de cuál se habla.
  if (action === "nada" && !hasAttrs && it.product && state.lines.some((l) => l.product === it.product)) action = "modificar";

  if (action === "agregar") {
    const qty = Math.min(it.qty ?? 1, MAX_LINES - state.lines.length);
    if (qty <= 0) return state;
    let template: CartLine | null = null;
    if (it.product) template = newLine("", it.product, it.attrs);
    else if (!open) {
      // "Otro igual", "uno más": copia la bebida de la que se venía hablando.
      // Solo cuando el fragmento ya terminó: a media frase ("y también un…") el
      // nombre de la bebida todavía puede estar por llegar.
      const ref = state.lines.find((l) => l.id === state.focus[0]) ?? state.lines[state.lines.length - 1];
      if (ref) template = withAttrs(ref, it.attrs);
    }
    if (!template) return state;
    const added: CartLine[] = [];
    let counter = state.counter;
    for (let i = 0; i < qty; i++) added.push({ ...template, id: `b${++counter}` });
    const ids = added.map((l) => l.id);
    const same = [...state.lines.filter((l) => l.product === template!.product).map((l) => l.id), ...ids];
    return { lines: [...state.lines, ...added], focus: ids, group: same.length > 1 ? same : ids, groupUsed: [], counter };
  }

  if (action === "modificar") {
    const { ids, group } = resolveTargets(state, it);
    if (!ids.length) return state;
    const lines = hasAttrs ? state.lines.map((l) => (ids.includes(l.id) ? withAttrs(l, it.attrs) : l)) : state.lines;
    const nextGroup = group ?? state.group;
    const sameGroup = nextGroup.length === state.group.length && nextGroup.every((id) => state.group.includes(id));
    const used = ids.length === 1 ? [...(sameGroup ? state.groupUsed : []), ids[0]] : [];
    return { ...state, lines, focus: ids, group: nextGroup, groupUsed: used };
  }

  if (action === "quitar") {
    let { ids } = resolveTargets(state, it);
    if (!ids.length) return state;
    if (it.qty && it.qty < ids.length) ids = ids.slice(-it.qty);
    const lines = state.lines.filter((l) => !ids.includes(l.id));
    return { ...state, lines, focus: [], group: [], groupUsed: [] };
  }

  return state;
}
