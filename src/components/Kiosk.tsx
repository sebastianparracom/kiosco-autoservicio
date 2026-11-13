"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TURN_BREAK } from "@/lib/clauses";
import { OrderEngine } from "@/lib/engine";
import type { InterpretRequest, InterpretResult } from "@/lib/jev";
import { FLAVORS, MILKS, PRODUCTS, PRODUCT_BY_ID, SIZES, TEMPS, imageFor, money } from "@/lib/menu";
import { EMPTY_ORDER, lineName, linePrice, orderTotal, priceBreakdown, type CartLine, type OrderState } from "@/lib/order";
import { VoiceSession } from "@/lib/voice";

type Phase = "inicio" | "pedido" | "resumen";

async function interpretRemote(req: InterpretRequest): Promise<InterpretResult> {
  const res = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error("No se pudo interpretar el pedido");
  return (await res.json()) as InterpretResult;
}

export default function Kiosk() {
  const [phase, setPhase] = useState<Phase>("inicio");
  const [order, setOrder] = useState<OrderState>(EMPTY_ORDER);
  const [heard, setHeard] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [typing, setTyping] = useState(false);

  const engine = useRef<OrderEngine | null>(null);
  const voice = useRef<VoiceSession | null>(null);
  const seq = useRef(0);
  const applied = useRef(0);
  const typedTurns = useRef<string[]>([]);

  /** Llega texto nuevo (voz o teclado): se recalcula el pedido y gana el resultado más reciente. */
  const onText = useCallback((fullText: string) => {
    setHeard(fullText);
    const mine = ++seq.current;
    const t0 = performance.now();
    engine.current
      ?.compute(fullText)
      .then((r) => {
        if (mine <= applied.current) return;
        applied.current = mine;
        setOrder(r.state);
        if (r.modelMs > 0) setLatency(Math.round(performance.now() - t0));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const begin = useCallback(async (withMic: boolean) => {
    setError(null);
    setStarting(true);
    engine.current = new OrderEngine(interpretRemote);
    seq.current = applied.current = 0;
    typedTurns.current = [];
    setOrder(EMPTY_ORDER);
    setHeard("");
    setLatency(null);
    // Calienta la conexión con el modelo para que la primera palabra no tarde.
    void interpretRemote({ fragment: "quiero un café", before: "", lines: [], focus: [] }).catch(() => {});
    if (withMic) {
      const session = new VoiceSession({ onText, onLevel: setLevel, onError: setError });
      try {
        await session.start();
        voice.current = session;
        setTyping(false);
      } catch (e) {
        session.stop();
        setError("No pudimos usar el micrófono. Puedes escribir tu pedido.");
        setTyping(true);
        console.error(e);
      }
    } else setTyping(true);
    setStarting(false);
    setPhase("pedido");
  }, [onText]);

  const finish = useCallback(() => {
    voice.current?.stop();
    voice.current = null;
    setLevel(0);
    setPhase("resumen");
  }, []);

  const restart = useCallback(() => {
    voice.current?.stop();
    voice.current = null;
    setOrder(EMPTY_ORDER);
    setHeard("");
    setError(null);
    setPhase("inicio");
  }, []);

  useEffect(() => () => voice.current?.stop(), []);

  // Solo en desarrollo: simula a alguien hablando, palabra por palabra, para
  // probar el flujo sin micrófono. En la consola: __decir(["quiero un latte", "que sea frío"])
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __decir: (turns: string[], ms?: number) => Promise<void> }).__decir = async (turns, ms = 170) => {
      let done = "";
      for (const turn of turns) {
        let partial = "";
        for (const word of turn.split(" ")) {
          partial += (partial ? " " : "") + word;
          onText(`${done}${partial}`);
          await new Promise((r) => setTimeout(r, ms));
        }
        done += `${partial} ${TURN_BREAK} `;
        onText(done);
        await new Promise((r) => setTimeout(r, 700));
      }
    };
  }, [onText]);

  const onTyped = useCallback(
    (value: string, commit: boolean) => {
      if (commit && value.trim()) typedTurns.current.push(value.trim());
      const done = typedTurns.current.map((t) => `${t} ${TURN_BREAK}`);
      onText([...done, commit ? "" : value].filter(Boolean).join(" "));
    },
    [onText],
  );

  return (
    <div className="viewport">
      <div className="stage">
        <AnimatePresence>
          {phase === "inicio" && <StartScreen key="inicio" starting={starting} onStart={() => begin(true)} onType={() => begin(false)} />}
          {phase === "pedido" && (
            <OrderScreen
              key="pedido"
              order={order}
              heard={heard}
              latency={latency}
              level={level}
              error={error}
              typing={typing}
              onTyped={onTyped}
              onFinish={finish}
            />
          )}
          {phase === "resumen" && <SummaryScreen key="resumen" lines={order.lines} onRestart={restart} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.35 } };

function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`wordmark ${className}`}>Café Quindío</span>;
}

function StartScreen({ starting, onStart, onType }: { starting: boolean; onStart: () => void; onType: () => void }) {
  return (
    <motion.section className="start" {...fade}>
      <div className="start-art" aria-hidden>
        {(["capuchino-caliente", "matcha-frio", "latte-caliente", "granizado-frio", "mocca-caliente"] as const).map((f, i) => (
          <img key={f} src={`/drinks/${f}.png`} alt="" className={`start-drink d${i}`} />
        ))}
      </div>
      <div className="start-copy">
        <p className="eyebrow">Expertos en café de especialidad</p>
        <Wordmark className="wordmark-xl" />
        <h1>Pide tu bebida hablando</h1>
        <p className="lead">Toca empezar y dinos qué quieres tomar. Tu pedido aparece en pantalla mientras hablas.</p>
        <button className="btn btn-primary btn-xl" onClick={onStart} disabled={starting}>
          {starting ? "Preparando…" : "Empezar"}
        </button>
        <button className="link" onClick={onType} disabled={starting}>
          Prefiero escribir mi pedido
        </button>
      </div>
    </motion.section>
  );
}

function OrderScreen(props: {
  order: OrderState;
  heard: string;
  latency: number | null;
  level: number;
  error: string | null;
  typing: boolean;
  onTyped: (value: string, commit: boolean) => void;
  onFinish: () => void;
}) {
  const { order, heard, latency, level, error, typing, onTyped, onFinish } = props;
  const count = order.lines.length;
  const density = count <= 3 ? "lg" : count <= 5 ? "md" : count === 6 ? "md6" : "sm";
  const total = orderTotal(order.lines);

  return (
    <motion.section className="order" {...fade}>
      <header className="topbar">
        <Wordmark />
        <div className="topbar-right">
          <div className="total">
            <span className="total-label">{count === 1 ? "1 bebida" : `${count} bebidas`}</span>
            <span className="total-amount">{money(total)}</span>
          </div>
          <button className="btn btn-light" onClick={onFinish} disabled={count === 0}>
            Finalizar
          </button>
        </div>
      </header>

      <nav className="menu" aria-label="Bebidas disponibles">
        <span className="menu-title">Puedes pedir</span>
        <ul>
          {PRODUCTS.map((p) => (
            <li key={p.id} className={order.lines.some((l) => l.product === p.id) ? "in-order" : ""}>
              <img src={imageFor(p.id, p.defaultTemp)} alt="" />
              <span className="menu-name">{p.name}</span>
              <span className="menu-price">{money(p.basePrice)}</span>
            </li>
          ))}
        </ul>
      </nav>

      <main className="cards" data-density={density}>
        {count === 0 && (
          <motion.div className="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2>¿Qué te preparamos hoy?</h2>
            <p>
              Di, por ejemplo: <em>“Quiero un capuchino grande con leche de avena”</em>
            </p>
          </motion.div>
        )}
        <AnimatePresence mode="popLayout">
          {order.lines.map((line) => (
            <DrinkCard key={line.id} line={line} focused={order.focus.includes(line.id)} />
          ))}
        </AnimatePresence>
      </main>

      <footer className="bottom">
        {error && <div className="error">{error}</div>}
        <TranscriptBar heard={heard} latency={latency} level={level} typing={typing} onTyped={onTyped} />
      </footer>
    </motion.section>
  );
}

interface Row {
  key: string;
  label: string;
  options: string[];
  active: number;
  value: string;
  extra: number;
}

function rowsFor(line: CartLine): Row[] {
  const p = PRODUCT_BY_ID[line.product];
  const rows: Row[] = [];
  if (p.hasSize) {
    const keys = Object.keys(SIZES) as (keyof typeof SIZES)[];
    rows.push({ key: "size", label: "Tamaño", options: keys, active: keys.indexOf(line.size), value: SIZES[line.size].label, extra: SIZES[line.size].delta });
  }
  if (p.shots) {
    const opts = Array.from({ length: p.shots.max - p.shots.min + 1 }, (_, i) => String(p.shots!.min + i));
    rows.push({
      key: "shots",
      label: "Espresso",
      options: opts,
      active: line.shots - p.shots.min,
      value: `${line.shots} shot${line.shots === 1 ? "" : "s"}`,
      extra: Math.max(0, line.shots - p.shots.default) * 0.8,
    });
  }
  if (p.hasMilk) {
    const keys = Object.keys(MILKS) as (keyof typeof MILKS)[];
    rows.push({ key: "milk", label: "Leche", options: keys, active: keys.indexOf(line.milk), value: MILKS[line.milk].label, extra: MILKS[line.milk].delta });
  }
  rows.push({
    key: "temp",
    label: "Temp.",
    options: p.temps,
    active: p.temps.indexOf(line.temp),
    value: TEMPS[line.temp].label,
    extra: line.temp === "frio" && p.defaultTemp === "caliente" ? 0.5 : 0,
  });
  if (p.hasFlavor) {
    const keys = Object.keys(FLAVORS) as (keyof typeof FLAVORS)[];
    rows.push({ key: "flavor", label: "Sabor", options: keys, active: keys.indexOf(line.flavor), value: FLAVORS[line.flavor].label, extra: FLAVORS[line.flavor].delta });
  }
  return rows;
}

function DrinkCard({ line, focused }: { line: CartLine; focused: boolean }) {
  const rows = useMemo(() => rowsFor(line), [line]);
  const prev = useRef<Record<string, string>>({});
  const [changed, setChanged] = useState<Record<string, number>>({});

  // Resalta por un momento cada atributo que acaba de cambiar.
  useEffect(() => {
    const now: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const diff = Object.keys(now).filter((k) => prev.current[k] !== undefined && prev.current[k] !== now[k]);
    prev.current = now;
    if (!diff.length) return;
    const stamp = Date.now();
    setChanged((c) => ({ ...c, ...Object.fromEntries(diff.map((k) => [k, stamp])) }));
    setTimeout(() => setChanged((c) => Object.fromEntries(Object.entries(c).filter(([, s]) => s !== stamp))), 1600);
  }, [rows]);

  const src = imageFor(line.product, line.temp);
  return (
    <motion.article
      layout
      className={`card ${focused ? "focused" : ""}`}
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <div className="card-art">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img
            key={src}
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          />
        </AnimatePresence>
      </div>
      <h3>{lineName(line)}</h3>
      <div className="card-price">{money(linePrice(line))}</div>
      <ul className="rows">
        {rows.map((r) => (
          <li key={r.key} className={changed[r.key] ? "changed" : ""}>
            <span className="row-label">{r.label}</span>
            <span className="pips" aria-hidden>
              {r.options.map((o, i) => (
                <i key={o} className={i === r.active ? "on" : ""} />
              ))}
            </span>
            <span className="row-value">{r.value}</span>
            <span className="row-extra">{r.extra > 0 ? `+${money(r.extra)}` : r.extra < 0 ? `−${money(-r.extra)}` : ""}</span>
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

function TranscriptBar(props: {
  heard: string;
  latency: number | null;
  level: number;
  typing: boolean;
  onTyped: (value: string, commit: boolean) => void;
}) {
  const { heard, latency, level, typing, onTyped } = props;
  const [draft, setDraft] = useState("");
  const parts = heard.split(TURN_BREAK).map((s) => s.trim());
  const current = heard.trim().endsWith(TURN_BREAK) ? "" : (parts.pop() ?? "");
  const past = parts.filter(Boolean).join("  ·  ");

  return (
    <div className="transcript">
      <div className="transcript-text">
        {typing ? (
          <input
            autoFocus
            value={draft}
            placeholder="Escribe tu pedido y presiona Enter…"
            onChange={(e) => {
              setDraft(e.target.value);
              onTyped(e.target.value, false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              onTyped(draft, true);
              setDraft("");
            }}
          />
        ) : heard ? (
          <p>
            <span className="past">{past}</span>
            {past && current ? "  ·  " : ""}
            <span className="now">{current}</span>
            <span className="caret" />
          </p>
        ) : (
          <p className="placeholder">Te escuchamos…</p>
        )}
      </div>
      <span className="latency">{latency != null ? `${latency} ms` : ""}</span>
      <div className={`mic ${typing ? "off" : ""}`} aria-hidden>
        {[0.5, 0.8, 1, 0.8, 0.5].map((w, i) => (
          <i key={i} style={{ height: `${Math.max(14, Math.min(100, level * 420 * w))}%` }} />
        ))}
      </div>
    </div>
  );
}

function SummaryScreen({ lines, onRestart }: { lines: CartLine[]; onRestart: () => void }) {
  const total = orderTotal(lines);
  return (
    <motion.section className="summary" {...fade}>
      <header className="topbar">
        <Wordmark />
      </header>
      <div className="summary-body">
        <div className="summary-head">
          <p className="eyebrow">Resumen de tu pedido</p>
          <h1>¡Gracias! Ya lo estamos preparando</h1>
        </div>
        <ol className={`receipt ${lines.length > 4 ? "two" : ""}`}>
          {lines.map((line, i) => {
            const [base, ...mods] = priceBreakdown(line);
            return (
              <motion.li key={line.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
                <img src={imageFor(line.product, line.temp)} alt="" />
                <div className="receipt-main">
                  <h3>{lineName(line)}</h3>
                  <p>
                    {[
                      `Base ${money(base.amount)}`,
                      ...mods.map((m) => `${m.label} ${m.amount < 0 ? "−" : "+"}${money(Math.abs(m.amount))}`),
                    ].join("  ·  ")}
                  </p>
                </div>
                <span className="receipt-price">{money(linePrice(line))}</span>
              </motion.li>
            );
          })}
        </ol>
        <div className={`summary-total ${lines.length > 4 ? "two" : ""}`}>
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>
        <button className="btn btn-primary" onClick={onRestart}>
          Nuevo pedido
        </button>
      </div>
    </motion.section>
  );
}
