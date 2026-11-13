// Divide lo que va diciendo el cliente en fragmentos cortos. Cada fragmento
// se interpreta por separado, así que un corte de más no hace daño: un
// fragmento con solo un atributo ("frío") se aplica a la bebida en foco.

import type { Lang } from "./menu";

/** Palabras que abren un fragmento nuevo. */
const OPENERS_ES = new Set([
  "y", "e", "también", "tambien", "además", "ademas", "mejor", "pero", "luego", "después", "despues", "ahora",
]);

const OPENERS_EN = new Set(["and", "also", "plus", "actually", "but", "then", "now", "instead"]);

/** Fragmentos hechos solo de estas palabras no dicen nada sobre el pedido. */
const FILLER_ES = new Set([
  "y", "e", "eh", "em", "mmm", "mm", "este", "pues", "bueno", "ok", "okay", "listo", "hola", "buenas", "buenos", "días", "dias",
  "tardes", "gracias", "por", "favor", "porfa", "también", "tambien", "además", "ademas", "pero", "luego", "después", "despues",
  "ahora", "a", "ver", "sí", "si", "entonces", "quiero", "quisiera", "me", "das", "da", "regalas", "regala", "un", "una", "el", "la",
  "que", "sea", "con", "de", "para", "mi",
]);

const FILLER_EN = new Set([
  "and", "also", "plus", "actually", "but", "then", "now", "instead", "uh", "um", "hmm", "so", "well", "ok", "okay", "hi", "hello",
  "hey", "good", "morning", "afternoon", "thanks", "thank", "you", "please", "let", "me", "see", "yes", "yeah", "i", "i'd", "id",
  "want", "would", "like", "can", "could", "get", "have", "a", "an", "the", "to", "for", "with", "of", "my", "awesome", "great",
  "that's", "it", "all",
]);

export const TURN_BREAK = "‖"; // separador entre turnos de voz

export function splitClauses(text: string, lang: Lang = "es"): string[] {
  const OPENERS = lang === "en" ? OPENERS_EN : OPENERS_ES;
  const tokens = text
    .replace(/[.;!?¿¡]+/g, ` ${TURN_BREAK} `)
    .replace(/,/g, ` ${TURN_BREAK} `)
    .split(/\s+/)
    .filter(Boolean);

  const clauses: string[][] = [[]];
  for (const tok of tokens) {
    const cur = clauses[clauses.length - 1];
    if (tok === TURN_BREAK) {
      if (cur.length) clauses.push([]);
      continue;
    }
    const w = tok.toLowerCase();
    // "y también un latte" → se corta en "y"; "también" no vuelve a cortar justo después.
    const onlyOpeners = cur.every((t) => OPENERS.has(t.toLowerCase()));
    if (OPENERS.has(w) && cur.length && !onlyOpeners) clauses.push([tok]);
    else cur.push(tok);
  }
  return clauses.filter((c) => c.length).map((c) => c.join(" "));
}

export function isFiller(clause: string, lang: Lang = "es"): boolean {
  const FILLER = lang === "en" ? FILLER_EN : FILLER_ES;
  return clause
    .toLowerCase()
    .split(/\s+/)
    .every((w) => FILLER.has(w));
}
