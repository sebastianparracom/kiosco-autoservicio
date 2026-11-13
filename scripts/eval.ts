// Prueba el motor de pedido con frases en español e inglés, sin interfaz ni micrófono.
// Uso: npm run eval            → todos los casos
//      npm run eval -- video   → solo los casos cuyo nombre contenga "video"
import { TURN_BREAK } from "../src/lib/clauses";
import { OrderEngine } from "../src/lib/engine";
import { interpretClause } from "../src/lib/jev";
import type { Lang } from "../src/lib/menu";
import { describeLine, orderTotal } from "../src/lib/order";

const key = process.env.OPENROUTER_API_KEY!;
const model = process.env.JEV_MODEL!;
const filter = process.argv[2];
const verbose = process.argv.includes("-v");

interface Case {
  name: string;
  lang?: Lang;
  /** Cada elemento es un turno de voz (una pausa entre ellos). */
  turns: string[];
  expect: string[];
}

const CASES: Case[] = [
  { name: "simple", turns: ["quiero un matcha"], expect: ["Matcha Latte, mediano, caliente, leche entera"] },
  {
    name: "modificar en foco",
    turns: ["quiero un matcha", "que sea frío con leche de avena"],
    expect: ["Matcha Latte, mediano, frío, leche avena"],
  },
  {
    name: "video completo",
    turns: [
      "me das un matcha",
      "que sea frío con leche de avena",
      "y también un capuchino y un latte",
      "mejor agrégame otro latte",
      "para uno de los lattes que sea grande y el otro pequeño",
      "y para el pequeño ponle tres shots con leche de avena",
      "y ese que sea frío mejor",
      "listo mejor quítame el capuchino",
    ],
    expect: [
      "Matcha Latte, mediano, frío, leche avena",
      "Latte, grande, caliente, leche entera, 2 shots",
      "Latte, pequeño, frío, leche avena, 3 shots",
    ],
  },
  {
    name: "cantidades",
    turns: ["dos capuchinos grandes y un tinto"],
    expect: [
      "Capuchino, grande, caliente, leche entera, 2 shots",
      "Capuchino, grande, caliente, leche entera, 2 shots",
      "Tinto, mediano, caliente",
    ],
  },
  {
    name: "varios atributos",
    turns: ["un latte grande con leche de almendra y caramelo"],
    expect: ["Latte, grande, caliente, leche almendra, 2 shots, sabor caramelo"],
  },
  {
    name: "objetivo por nombre",
    turns: ["un tinto pequeño y un chocolate", "el chocolate con leche deslactosada"],
    expect: ["Tinto, pequeño, caliente", "Chocolate, mediano, caliente, leche deslactosada"],
  },
  {
    name: "solo fríos",
    turns: ["un granizado de café y un cold brew grande con vainilla"],
    expect: ["Granizado de café, mediano, frío, leche entera, 1 shot", "Cold Brew, grande, frío, sabor vainilla"],
  },
  { name: "arrepentirse", turns: ["un latte", "no mejor quítalo"], expect: [] },
  {
    name: "uno de varios",
    turns: ["tres espressos", "uno de ellos doble"],
    expect: ["Espresso, caliente, 2 shots", "Espresso, caliente, 1 shot", "Espresso, caliente, 1 shot"],
  },
  {
    name: "todos",
    turns: ["un mocca frío y un chai", "todos grandes"],
    expect: ["Mocca, grande, frío, leche entera, 2 shots", "Chai Latte, grande, caliente, leche entera"],
  },
  { name: "muletillas", turns: ["hola buenas tardes eh quiero"], expect: [] },
  {
    name: "errores de transcripción",
    turns: ["quiero un capuchigo grande", "y un lace frío"],
    expect: ["Capuchino, grande, caliente, leche entera, 2 shots", "Latte, mediano, frío, leche entera, 2 shots"],
  },
  {
    name: "sinónimos",
    turns: ["me regalas un americano y un frappé con leche de avena"],
    expect: ["Tinto, mediano, caliente", "Granizado de café, mediano, frío, leche avena, 1 shot"],
  },
  {
    name: "en video",
    lang: "en",
    turns: [
      "can I get a matcha",
      "let's make it iced with oat milk",
      "and can we add one cappuccino and one latte",
      "actually can we add one more latte",
      "for one of the lattes can we make it large and the other one small",
      "and for the small one can we do three shots with oat milk",
      "and let's make that one iced actually",
      "awesome actually let's get rid of the cappuccino",
    ],
    expect: ["Matcha Latte, medium, iced, oat milk", "Latte, large, hot, whole milk, 2 shots", "Latte, small, iced, oat milk, 3 shots"],
  },
  {
    name: "en cantidades",
    lang: "en",
    turns: ["two large cappuccinos and a small black coffee"],
    expect: ["Cappuccino, large, hot, whole milk, 2 shots", "Cappuccino, large, hot, whole milk, 2 shots", "Black Coffee, small, hot"],
  },
  {
    name: "en varios atributos",
    lang: "en",
    turns: ["I'd like an iced mocha with almond milk and caramel"],
    expect: ["Mocha, medium, iced, almond milk, 2 shots, caramel flavor"],
  },
  { name: "en arrepentirse", lang: "en", turns: ["a latte please", "actually remove it"], expect: [] },
  {
    name: "en sinónimos",
    lang: "en",
    turns: ["hi can I get a frappuccino with oat milk and a hot cocoa"],
    expect: ["Coffee Frappé, medium, iced, oat milk, 1 shot", "Hot Chocolate, medium, hot, whole milk"],
  },

];

const latencies: number[] = [];
let pass = 0;
const cases = CASES.filter((c) => !filter || filter.startsWith("-") || c.name.includes(filter));

for (const c of cases) {
  const engine = new OrderEngine(async (req) => {
    const r = await interpretClause(req, key, model);
    latencies.push(r.ms);
    if (verbose) console.log(`    [${r.ms}ms] "${req.fragment}" →`, JSON.stringify(r.interpretation));
    return r;
  }, c.lang ?? "es");
  // Igual que en vivo: la frase crece palabra por palabra y se recalcula cada vez.
  const words = c.turns.flatMap((t) => [...t.split(" "), TURN_BREAK]);
  let text = "";
  let got: string[] = [];
  let total = 0;
  for (const w of words) {
    text += (text ? " " : "") + w;
    if (w !== TURN_BREAK) continue; // en modo normal solo se evalúa al final de cada turno
    const r = await engine.compute(text);
    got = r.state.lines.map((l) => describeLine(l, c.lang ?? "es"));
    total = orderTotal(r.state.lines);
  }
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}  (total $${total.toFixed(2)})`);
  if (!ok) {
    console.log("    esperado:", c.expect);
    console.log("    obtenido:", got);
  }
}

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];
console.log(`\n${pass}/${cases.length} casos correctos`);
console.log(`Latencia Jev: ${latencies.length} llamadas · mediana ${pct(0.5)}ms · p90 ${pct(0.9)}ms · máx ${latencies.at(-1)}ms`);
