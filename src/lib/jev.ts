// Capa de interpretación: convierte un fragmento de frase en decisiones
// cerradas usando Jev (modelo de decisiones) a través de OpenRouter.
// Jev no genera texto: responde preguntas tipadas con probabilidades.
import { PRODUCTS, type Flavor, type Milk, type ProductId, type Size, type Temp } from "./menu";
import { describeLine, type Attrs, type CartLine, type Interpretation, type Target } from "./order";

export interface InterpretRequest {
  /** Fragmento a interpretar. */
  fragment: string;
  /** Lo dicho justo antes, solo como contexto. */
  before: string;
  lines: CartLine[];
  /** Índices de las bebidas de las que se venía hablando. */
  focus: number[];
}

const ENDPOINT = "https://openrouter.ai/api/v1/systemone";
const NO = "no_dice";

type Choice = { type: "choice"; instructions: string; criteria: Record<string, string> };
type Noul = { type: "noul"; instructions: string };
type Answer = { choice?: string; confidence?: number; probabilities?: Record<string, number>; noul?: number };

const choice = (instructions: string, criteria: Record<string, string>): Choice => ({ type: "choice", instructions, criteria });

const INTRO =
  "Un cliente dicta su pedido de bebidas en el kiosco de un café. `fragmento` es el trozo de frase que acaba de decir " +
  "(transcrito por voz: puede tener errores de ortografía o estar incompleto). ";

function buildQuestions(req: InterpretRequest): Record<string, Choice | Noul> {
  const hasLines = req.lines.length > 0;
  const q: Record<string, Choice | Noul> = {};

  q.accion = choice(INTRO + "¿Qué le pide hacer `fragmento` al pedido?", {
    agregar:
      "Pide una bebida nueva para añadir al pedido (por ejemplo: quiero un…, dame un…, y un…, otro…, uno más), o nombra una bebida que todavía no está en `pedido`.",
    modificar:
      "Cambia o precisa una característica (tamaño, leche, temperatura, shots o sabor) de una bebida que ya está en `pedido`, o señala una bebida de `pedido` para cambiarla.",
    quitar: "Pide eliminar, quitar, cancelar o ya no querer una bebida que está en `pedido`.",
    nada: "No pide ningún cambio: es un saludo, una muletilla, una duda o una frase todavía sin contenido.",
  });

  q.producto = choice(INTRO + "¿Qué bebida del menú nombra `fragmento`? Acepta nombres mal escritos que suenen parecido.", {
    ...Object.fromEntries(PRODUCTS.map((p) => [p.id, p.spoken])),
    ninguna: "`fragmento` no nombra ninguna bebida del menú.",
  });

  q.cantidad = choice(INTRO + "¿Cuántas bebidas (vasos) pide `fragmento`? El número de shots o cargas no es un número de bebidas.", {
    una: "Una sola: un, una, uno, otro, otra.",
    dos: "Dos, un par.",
    tres: "Tres.",
    cuatro: "Cuatro.",
    [NO]: "`fragmento` no dice ninguna cantidad.",
  });

  q.tamano = choice(
    INTRO +
      "¿Qué palabra de tamaño contiene `fragmento`? Solo cuenta una palabra de tamaño dicha de forma explícita; el nombre de la bebida no indica tamaño.",
    {
      pequeno: "`fragmento` contiene la palabra pequeño, pequeña, chico, chiquito o small.",
      mediano: "`fragmento` contiene la palabra mediano, mediana o medium.",
      grande: "`fragmento` contiene la palabra grande o large.",
      [NO]: "`fragmento` no contiene ninguna palabra de tamaño.",
    },
  );

  q.leche = choice(INTRO + "¿Qué tipo de leche dice `fragmento`?", {
    entera: "Leche entera, leche normal, leche de vaca.",
    deslactosada: "Leche deslactosada, sin lactosa.",
    avena: "Leche de avena.",
    almendra: "Leche de almendra, de almendras.",
    [NO]: "`fragmento` no dice ningún tipo de leche.",
  });

  q.temperatura = choice(
    INTRO + "¿Qué palabra de temperatura contiene `fragmento`? Solo cuenta una palabra dicha de forma explícita; el nombre de la bebida no indica temperatura.",
    {
      frio: "`fragmento` contiene la palabra fría, frío, helado, helada, hielo o iced.",
      caliente: "`fragmento` contiene la palabra caliente.",
      [NO]: "`fragmento` no contiene ninguna palabra de temperatura.",
    },
  );

  q.shots = choice(
    INTRO +
      "¿Cuántos shots o cargas de café dentro de UNA bebida pide `fragmento`? Solo cuenta si `fragmento` contiene la palabra shot, shots, carga, cargas, sencillo, doble o triple. El número de bebidas pedidas no es un número de shots.",
    {
      uno: "Dice un shot, una carga o sencillo.",
      dos: "Dice dos shots, dos cargas o doble.",
      tres: "Dice tres shots, tres cargas o triple.",
      [NO]: "`fragmento` no contiene las palabras shot, carga, sencillo, doble ni triple.",
    },
  );

  q.sabor = choice(INTRO + "¿Qué sabor o sirope dice `fragmento`?", {
    vainilla: "Vainilla.",
    caramelo: "Caramelo.",
    avellana: "Avellana.",
    ninguno: "Pide quitar el sabor o que vaya sin sirope.",
    [NO]: "`fragmento` no dice ningún sabor ni sirope.",
  });

  if (hasLines) {
    q.objetivo = choice(
      INTRO + "`pedido` lista las bebidas ya pedidas. ¿A cuál bebida de `pedido` se refiere `fragmento`?",
      {
        ...Object.fromEntries(
          req.lines.map((l, i) => [`linea_${i + 1}`, `Se refiere a esta bebida, por su nombre o sus características: ${describeLine(l)}.`]),
        ),
        ultima:
          "No nombra ninguna bebida, o se refiere a la bebida de la que se venía hablando (ese, esa, eso, la misma, el mismo, este).",
        una: "Se refiere a una sola de varias bebidas iguales, sin decir cuál: uno de los…, una de las…, uno, una.",
        otra: "Se refiere a la otra bebida: el otro, la otra, el segundo.",
        todas: "Se refiere a todas las bebidas del pedido: todos, todas, todo.",
      },
    );
    q.plural = { type: "noul", instructions: INTRO + "¿`fragmento` se refiere a varias bebidas a la vez, en plural (los, las, ambos, los dos, todos)?" };
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
function referenceWord(fragment: string, namesProduct: boolean): Target | null {
  const f = fragment.toLowerCase();
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
  const state = {
    pedido: req.lines.length
      ? Object.fromEntries(req.lines.map((l, i) => [`linea_${i + 1}`, describeLine(l)]))
      : "El pedido está vacío.",
    bebida_de_la_que_se_venia_hablando: req.focus.length ? req.focus.map((i) => `linea_${i + 1}`).join(", ") : "ninguna",
    dicho_antes: req.before || "(nada)",
    fragmento: req.fragment,
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

  target = referenceWord(req.fragment, !!product && product !== "ninguna") ?? target;

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
