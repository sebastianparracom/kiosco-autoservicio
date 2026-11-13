// Orquestador: recalcula el pedido completo a partir de todo lo dicho.
// Cada fragmento ya interpretado queda en caché, así que al llegar una
// palabra nueva solo se consulta al modelo por el último fragmento.
// Recalcular siempre desde cero evita duplicados cuando la frase crece.
import { isFiller, splitClauses } from "./clauses";
import type { InterpretRequest, InterpretResult } from "./jev";
import type { Lang } from "./menu";
import { applyInterpretation, EMPTY_ORDER, type OrderState } from "./order";

export type Interpreter = (req: InterpretRequest) => Promise<InterpretResult>;

export interface ComputeResult {
  state: OrderState;
  /** Milisegundos de la consulta al modelo en esta pasada (0 si todo estaba en caché). */
  modelMs: number;
}

export class OrderEngine {
  private cache = new Map<string, Promise<InterpretResult>>();
  constructor(
    private interpret: Interpreter,
    private lang: Lang = "es",
  ) {}

  async compute(fullText: string): Promise<ComputeResult> {
    const clauses = splitClauses(fullText, this.lang);
    // El último fragmento sigue abierto mientras el cliente no haga una pausa.
    const lastIsOpen = !/[\u2016.,;!?]\s*$/.test(fullText);
    let state: OrderState = EMPTY_ORDER;
    let modelMs = 0;
    for (let i = 0; i < clauses.length; i++) {
      const fragment = clauses[i];
      if (isFiller(fragment, this.lang)) continue;
      const req: InterpretRequest = {
        fragment,
        before: clauses.slice(Math.max(0, i - 2), i).join(" "),
        lines: state.lines,
        lang: this.lang,
        focus: state.focus.map((id) => state.lines.findIndex((l) => l.id === id)).filter((x) => x >= 0),
      };
      const key = JSON.stringify(req);
      let pending = this.cache.get(key);
      const fresh = !pending;
      if (!pending) {
        pending = this.interpret(req);
        this.cache.set(key, pending);
        pending.catch(() => this.cache.delete(key));
      }
      const result = await pending;
      if (fresh) modelMs = Math.max(modelMs, result.ms);
      state = applyInterpretation(state, result.interpretation, lastIsOpen && i === clauses.length - 1);
    }
    return { state, modelMs };
  }
}
