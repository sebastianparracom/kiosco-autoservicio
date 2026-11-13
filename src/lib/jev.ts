// Capa de interpretación: convierte un fragmento de frase en decisiones
// cerradas usando Jev (modelo de decisiones) a través de OpenRouter.
// Jev no genera texto: responde preguntas tipadas con probabilidades.
import { PRODUCTS, type Flavor, type Lang, type Milk, type ProductId, type Size, type Temp } from "./menu";
import { describeLine, type Attrs, type CartLine, type Interpretation, type Target } from "./order";

export interface InterpretRequest {
  /** Fragmento a interpretar. */
  fragment: string;
  /** Lo dicho justo antes, solo como contexto. */
  before: string;
  lines: CartLine[];
  /** Índices de las bebidas de las que se venía hablando. */
  focus: number[];
  /** Idioma en el que habla el cliente. */
  lang: Lang;
}

const ENDPOINT = "https://openrouter.ai/api/v1/systemone";
const NO = "no_dice";

type Choice = { type: "choice"; instructions: string; criteria: Record<string, string> };
type Noul = { type: "noul"; instructions: string };
type Answer = { choice?: string; confidence?: number; probabilities?: Record<string, number>; noul?: number };

const choice = (instructions: string, criteria: Record<string, string>): Choice => ({ type: "choice", instructions, criteria });

/**
 * Preguntas en el idioma del cliente. Las claves de las opciones (agregar,
 * pequeno, avena…) son las mismas en ambos idiomas: el resto del código no cambia.
 */
const Q = {
  es: {
    intro:
      "Un cliente dicta su pedido de bebidas en el kiosco de un café. `fragmento` es el trozo de frase que acaba de decir " +
      "(transcrito por voz: puede tener errores de ortografía o estar incompleto). ",
    accion: "¿Qué le pide hacer `fragmento` al pedido?",
    acciones: {
      agregar:
        "Pide una bebida nueva para añadir al pedido (por ejemplo: quiero un…, dame un…, y un…, otro…, uno más), o nombra una bebida que todavía no está en `pedido`.",
      modificar:
        "Cambia o precisa una característica (tamaño, leche, temperatura, shots o sabor) de una bebida que ya está en `pedido`, o señala una bebida de `pedido` para cambiarla.",
      quitar: "Pide eliminar, quitar, cancelar o ya no querer una bebida que está en `pedido`.",
      nada: "No pide ningún cambio: es un saludo, una muletilla, una duda o una frase todavía sin contenido.",
    },
    producto: "¿Qué bebida del menú nombra `fragmento`? Acepta nombres mal escritos que suenen parecido.",
    ninguna: "`fragmento` no nombra ninguna bebida del menú.",
    cantidad: "¿Cuántas bebidas (vasos) pide `fragmento`? El número de shots o cargas no es un número de bebidas.",
    cantidades: { una: "Una sola: un, una, uno, otro, otra.", dos: "Dos, un par.", tres: "Tres.", cuatro: "Cuatro.", [NO]: "`fragmento` no dice ninguna cantidad." },
    tamano:
      "¿Qué palabra de tamaño contiene `fragmento`? Solo cuenta una palabra de tamaño dicha de forma explícita; el nombre de la bebida no indica tamaño.",
    tamanos: {
      pequeno: "`fragmento` contiene la palabra pequeño, pequeña, chico, chiquito o small.",
      mediano: "`fragmento` contiene la palabra mediano, mediana o medium.",
      grande: "`fragmento` contiene la palabra grande o large.",
      [NO]: "`fragmento` no contiene ninguna palabra de tamaño.",
    },
    leche: "¿Qué tipo de leche dice `fragmento`?",
    leches: {
      entera: "Leche entera, leche normal, leche de vaca.",
      deslactosada: "Leche deslactosada, sin lactosa.",
      avena: "Leche de avena.",
      almendra: "Leche de almendra, de almendras.",
      [NO]: "`fragmento` no dice ningún tipo de leche.",
    },
    temperatura:
      "¿Qué palabra de temperatura contiene `fragmento`? Solo cuenta una palabra dicha de forma explícita; el nombre de la bebida no indica temperatura.",
    temperaturas: {
      frio: "`fragmento` contiene la palabra fría, frío, helado, helada, hielo o iced.",
      caliente: "`fragmento` contiene la palabra caliente.",
      [NO]: "`fragmento` no contiene ninguna palabra de temperatura.",
    },
    shots:
      "¿Cuántos shots o cargas de café dentro de UNA bebida pide `fragmento`? Solo cuenta si `fragmento` contiene la palabra shot, shots, carga, cargas, sencillo, doble o triple. El número de bebidas pedidas no es un número de shots.",
    shotsOpts: {
      uno: "Dice un shot, una carga o sencillo.",
      dos: "Dice dos shots, dos cargas o doble.",
      tres: "Dice tres shots, tres cargas o triple.",
      [NO]: "`fragmento` no contiene las palabras shot, carga, sencillo, doble ni triple.",
    },
    sabor: "¿Qué sabor o sirope dice `fragmento`?",
    sabores: {
      vainilla: "Vainilla.",
      caramelo: "Caramelo.",
      avellana: "Avellana.",
      ninguno: "Pide quitar el sabor o que vaya sin sirope.",
      [NO]: "`fragmento` no dice ningún sabor ni sirope.",
    },
    objetivo: "`pedido` lista las bebidas ya pedidas. ¿A cuál bebida de `pedido` se refiere `fragmento`?",
    linea: (d: string) => `Se refiere a esta bebida, por su nombre o sus características: ${d}.`,
    objetivos: {
      ultima: "No nombra ninguna bebida, o se refiere a la bebida de la que se venía hablando (ese, esa, eso, la misma, el mismo, este).",
      una: "Se refiere a una sola de varias bebidas iguales, sin decir cuál: uno de los…, una de las…, uno, una.",
      otra: "Se refiere a la otra bebida: el otro, la otra, el segundo.",
      todas: "Se refiere a todas las bebidas del pedido: todos, todas, todo.",
    },
    plural: "¿`fragmento` se refiere a varias bebidas a la vez, en plural (los, las, ambos, los dos, todos)?",
    state: { order: "pedido", empty: "El pedido está vacío.", focus: "bebida_de_la_que_se_venia_hablando", none: "ninguna", before: "dicho_antes", nothing: "(nada)", fragment: "fragmento" },
  },
  en: {
    intro:
      "A customer is dictating a drinks order at a coffee shop kiosk. `fragment` is the piece of the sentence they just said " +
      "(transcribed from speech: it may have spelling mistakes or be unfinished). ",
    accion: "What does `fragment` ask to do to the order?",
    acciones: {
      agregar:
        "Asks for a new drink to add to the order (for example: I want a…, can I get a…, and a…, another…, one more), or names a drink that is not in `order` yet.",
      modificar:
        "Changes or specifies a property (size, milk, temperature, shots or flavor) of a drink already in `order`, or points at a drink in `order` to change it.",
      quitar: "Asks to remove, cancel, delete, get rid of or no longer want a drink that is in `order`.",
      nada: "Asks for no change: it is a greeting, a filler, a question or a sentence with no content yet.",
    },
    producto: "Which drink from the menu does `fragment` name? Accept misspelled names that sound similar.",
    ninguna: "`fragment` does not name any drink from the menu.",
    cantidad: "How many drinks (cups) does `fragment` ask for? A number of shots is not a number of drinks.",
    cantidades: { una: "Just one: a, an, one, another.", dos: "Two, a couple, a pair.", tres: "Three.", cuatro: "Four.", [NO]: "`fragment` does not say any quantity." },
    tamano: "Which size word does `fragment` contain? Only count a size word said explicitly; the drink's name does not indicate a size.",
    tamanos: {
      pequeno: "`fragment` contains the word small, short, tall or little.",
      mediano: "`fragment` contains the word medium, regular or grande.",
      grande: "`fragment` contains the word large, big or venti.",
      [NO]: "`fragment` contains no size word.",
    },
    leche: "Which kind of milk does `fragment` say?",
    leches: {
      entera: "Whole milk, regular milk, normal milk, dairy milk.",
      deslactosada: "Lactose-free milk, lactose free.",
      avena: "Oat milk, oat.",
      almendra: "Almond milk, almond.",
      [NO]: "`fragment` does not say any kind of milk.",
    },
    temperatura:
      "Which temperature word does `fragment` contain? Only count a word said explicitly; the drink's name does not indicate a temperature.",
    temperaturas: {
      frio: "`fragment` contains the word iced, cold, ice or on the rocks.",
      caliente: "`fragment` contains the word hot or warm.",
      [NO]: "`fragment` contains no temperature word.",
    },
    shots:
      "How many espresso shots inside ONE drink does `fragment` ask for? Only count it if `fragment` contains the word shot, shots, single, double, triple or doppio. The number of drinks ordered is not a number of shots.",
    shotsOpts: {
      uno: "Says one shot or single.",
      dos: "Says two shots, double or doppio.",
      tres: "Says three shots or triple.",
      [NO]: "`fragment` does not contain the words shot, single, double, triple or doppio.",
    },
    sabor: "Which flavor or syrup does `fragment` say?",
    sabores: {
      vainilla: "Vanilla.",
      caramelo: "Caramel.",
      avellana: "Hazelnut.",
      ninguno: "Asks to remove the flavor or have no syrup.",
      [NO]: "`fragment` does not say any flavor or syrup.",
    },
    objetivo: "`order` lists the drinks already ordered. Which drink in `order` does `fragment` refer to?",
    linea: (d: string) => `Refers to this drink, by its name or its properties: ${d}.`,
    objetivos: {
      ultima: "Names no drink, or refers to the drink being talked about (that, that one, it, this one, the same).",
      una: "Refers to just one of several identical drinks without saying which: one of the…, one of them, one.",
      otra: "Refers to the other drink: the other, the other one, the second one.",
      todas: "Refers to all the drinks in the order: all, all of them, both, everything.",
    },
    plural: "Does `fragment` refer to several drinks at once, in plural (them, those, both, all of them, all)?",
    state: { order: "order", empty: "The order is empty.", focus: "drink_being_talked_about", none: "none", before: "said_before", nothing: "(nothing)", fragment: "fragment" },
  },
};

function buildQuestions(req: InterpretRequest): Record<string, Choice | Noul> {
  const t = Q[req.lang];
  const i = t.intro;
  const q: Record<string, Choice | Noul> = {};
  q.accion = choice(i + t.accion, t.acciones);
  q.producto = choice(i + t.producto, { ...Object.fromEntries(PRODUCTS.map((p) => [p.id, p.spoken[req.lang]])), ninguna: t.ninguna });
  q.cantidad = choice(i + t.cantidad, t.cantidades);
  q.tamano = choice(i + t.tamano, t.tamanos);
  q.leche = choice(i + t.leche, t.leches);
  q.temperatura = choice(i + t.temperatura, t.temperaturas);
  q.shots = choice(i + t.shots, t.shotsOpts);
  q.sabor = choice(i + t.sabor, t.sabores);
  if (req.lines.length) {
    q.objetivo = choice(i + t.objetivo, {
      ...Object.fromEntries(req.lines.map((l, n) => [`linea_${n + 1}`, t.linea(describeLine(l, req.lang))])),
      ...t.objetivos,
    });
    q.plural = { type: "noul", instructions: i + t.plural };
  }
  return q;
}

const SIZE_OF: Record<string, Size> = { pequeno: "pequeno", mediano: "mediano", grande: "grande" };
const SHOTS_OF: Record<string, number> = { uno: 1, dos: 2, tres: 3 };
const QTY_OF: Record<string, number> = { una: 1, dos: 2, tres: 3, cuatro: 4 };

/** Una respuesta solo cuenta si el modelo está razonablemente seguro. */
function pick(a: Answer | undefined, min = 0.55): string | null {
  if (!a?.choice || a.choice === NO) return null;
  const p = a.probabilities?.[a.choice] ?? a.confidence ?? 0;
  return p >= min ? a.choice : null;
}

/**
 * Palabras de referencia ("el otro", "ese", "uno de los…") son un conjunto
 * cerrado: se resuelven en código, que es más fiable que preguntarle al modelo.
 */
function referenceWord(fragment: string, namesProduct: boolean, lang: Lang): Target | null {
  const f = fragment.toLowerCase();
  if (lang === "en") {
    if (/\bthe\s+other\b/.test(f)) return { kind: "otra" };
    if (/\bone\s+of\s+(the|them|those)\b/.test(f)) return { kind: "una" };
    if (namesProduct) return null;
    if (/\b(all|both|everything)\b/.test(f)) return { kind: "todas" };
    if (/\b(that|this|it|same)\b/.test(f)) return { kind: "ultima" };
    return null;
  }
  if (/\b(el|la|al|del)\s+otr[oa]\b/.test(f)) return { kind: "otra" };
  if (/\buno\s+de\s+(los|ellos)\b|\buna\s+de\s+(las|ellas)\b/.test(f)) return { kind: "una" };
  if (namesProduct) return null;
  if (/\b(todos|todas)\b/.test(f)) return { kind: "todas" };
  if (/\b(ese|esa|eso|este|esta|esto|mismo|misma)\b/.test(f)) return { kind: "ultima" };
  return null;
}

export interface InterpretResult {
  interpretation: Interpretation;
  ms: number;
}

export async function interpretClause(req: InterpretRequest, apiKey: string, model: string): Promise<InterpretResult> {
  const t0 = performance.now();
  const k = Q[req.lang].state;
  const state = {
    [k.order]: req.lines.length
      ? Object.fromEntries(req.lines.map((l, i) => [`linea_${i + 1}`, describeLine(l, req.lang)]))
      : k.empty,
    [k.focus]: req.focus.length ? req.focus.map((i) => `linea_${i + 1}`).join(", ") : k.none,
    [k.before]: req.before || k.nothing,
    [k.fragment]: req.fragment,
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state, questions: buildQuestions(req) }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const a = ((await res.json()) as { answers: Record<string, Answer> }).answers;

  const attrs: Attrs = {};
  const size = pick(a.tamano);
  if (size) attrs.size = SIZE_OF[size];
  const milk = pick(a.leche);
  if (milk) attrs.milk = milk as Milk;
  const temp = pick(a.temperatura);
  if (temp) attrs.temp = temp as Temp;
  const shots = pick(a.shots);
  if (shots) attrs.shots = SHOTS_OF[shots];
  const flavor = pick(a.sabor);
  if (flavor) attrs.flavor = flavor as Flavor;

  const product = pick(a.producto, 0.5);
  const qty = pick(a.cantidad);
  const obj = pick(a.objetivo, 0.45);
  let target: Target | null = null;
  if (obj?.startsWith("linea_")) target = { kind: "linea", index: Number(obj.slice(6)) - 1 };
  else if (obj === "ultima" || obj === "una" || obj === "otra" || obj === "todas") target = { kind: obj };

  target = referenceWord(req.fragment, !!product && product !== "ninguna", req.lang) ?? target;

  const interpretation: Interpretation = {
    action: (a.accion?.choice as Interpretation["action"]) ?? "nada",
    product: product && product !== "ninguna" ? (product as ProductId) : null,
    qty: qty ? QTY_OF[qty] : null,
    target,
    plural: (a.plural?.noul ?? 0) > 0.6,
    attrs,
  };
  return { interpretation, ms: Math.round(performance.now() - t0) };
}
