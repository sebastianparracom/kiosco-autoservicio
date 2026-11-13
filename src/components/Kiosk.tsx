"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { TURN_BREAK } from "@/lib/clauses";
import { OrderEngine } from "@/lib/engine";
import { UI, type Strings } from "@/lib/i18n";
import type { InterpretRequest, InterpretResult } from "@/lib/jev";
import {
  EXTRA_SHOT,
  FLAVORS,
  ICED_DELTA,
  MILKS,
  PRODUCTS,
  PRODUCT_BY_ID,
  SIZES,
  TEMPS,
  imageFor,
  money,
  type Currency,
  type Lang,
  type Price,
} from "@/lib/menu";
import { EMPTY_ORDER, lineName, linePrice, orderTotal, priceBreakdown, type CartLine, type OrderState } from "@/lib/order";
import { VoiceSession } from "@/lib/voice";

type Phase = "inicio" | "pedido" | "resumen";

/** Idioma y moneda elegidos en la pantalla de inicio; toda la interfaz los lee de aquí. */
interface Settings {
  lang: Lang;
  currency: Currency;
  t: Strings;
  /** Formatea un precio en la moneda elegida. */
  fmt: (n: number) => string;
}

const SettingsContext = createContext<Settings | null>(null);
const useSettings = () => useContext(SettingsContext)!;

async function interpretRemote(req: InterpretRequest): Promise<InterpretResult> {
  const res = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error(UI[req.lang].interpretError);
  return (await res.json()) as InterpretResult;
}

export default function Kiosk() {
  const [lang, setLang] = useState<Lang>("es");
  const [currency, setCurrency] = useState<Currency>("COP");
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

  const settings = useMemo<Settings>(
    () => ({ lang, currency, t: UI[lang], fmt: (n: number) => money(n, currency, lang) }),
    [lang, currency],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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

  const begin = useCallback(
    async (withMic: boolean) => {
      setError(null);
      setStarting(true);
      engine.current = new OrderEngine(interpretRemote, lang);
      seq.current = applied.current = 0;
      typedTurns.current = [];
      setOrder(EMPTY_ORDER);
      setHeard("");
      setLatency(null);
      // Calienta la conexión con el modelo para que la primera palabra no tarde.
      void interpretRemote({ fragment: UI[lang].warmup, before: "", lines: [], focus: [], lang }).catch(() => {});
      if (withMic) {
        const session = new VoiceSession({ onText, onLevel: setLevel, onError: setError }, lang);
        try {
          await session.start();
          voice.current = session;
          setTyping(false);
        } catch (e) {
          session.stop();
          setError(UI[lang].micError);
          setTyping(true);
          console.error(e);
        }
      } else setTyping(true);
      setStarting(false);
      setPhase("pedido");
    },
    [onText, lang],
  );

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
    <SettingsContext.Provider value={settings}>
      <div className="viewport">
        <div className="stage">
          <AnimatePresence>
            {phase === "inicio" && (
              <StartScreen
                key="inicio"
                starting={starting}
                onLang={setLang}
                onCurrency={setCurrency}
                onStart={() => begin(true)}
                onType={() => begin(false)}
              />
            )}
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
    </SettingsContext.Provider>
  );
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.35 } };

function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`wordmark ${className}`}>Café Quindío</span>;
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; title: string; sub: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{props.label}</span>
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === props.value}
            className={o.value === props.value ? "on" : ""}
            onClick={() => props.onChange(o.value)}
          >
            <span className="seg-title">{o.title}</span>
            <span className="seg-sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StartScreen(props: {
  starting: boolean;
  onLang: (l: Lang) => void;
  onCurrency: (c: Currency) => void;
  onStart: () => void;
  onType: () => void;
}) {
  const { lang, currency, t } = useSettings();
  return (
    <motion.section className="start" {...fade}>
      <div className="start-art" aria-hidden>
        {(["capuchino-caliente", "matcha-frio", "latte-caliente", "granizado-frio", "mocca-caliente"] as const).map((f, i) => (
          <img key={f} src={`/drinks/${f}.png`} alt="" className={`start-drink d${i}`} />
        ))}
      </div>
      <div className="start-copy">
        <p className="eyebrow">{t.eyebrow}</p>
        <Wordmark className="wordmark-xl" />
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
        <div className="settings">
          <Segmented
            label={t.language}
            value={lang}
            onChange={props.onLang}
            options={[
              { value: "es", title: "Español", sub: "ES" },
              { value: "en", title: "English", sub: "EN" },
            ]}
          />
          <Segmented
            label={t.currency}
            value={currency}
            onChange={props.onCurrency}
            options={[
              { value: "COP", title: "COP", sub: t.cop },
              { value: "USD", title: "USD", sub: t.usd },
            ]}
          />
        </div>
        <button className="btn btn-primary btn-xl" onClick={props.onStart} disabled={props.starting}>
          {props.starting ? t.preparing : t.start}
        </button>
        <button className="link" onClick={props.onType} disabled={props.starting}>
          {t.typeInstead}
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
  const { lang, currency, t, fmt } = useSettings();
  const count = order.lines.length;
  const density = count <= 3 ? "lg" : count <= 5 ? "md" : count === 6 ? "md6" : "sm";

  return (
    <motion.section className="order" {...fade}>
      <header className="topbar">
        <Wordmark />
        <div className="topbar-right">
          <div className="total">
            <span className="total-label">{t.drinks(count)}</span>
            <span className="total-amount">{fmt(orderTotal(order.lines, currency))}</span>
          </div>
          <button className="btn btn-light" onClick={onFinish} disabled={count === 0}>
            {t.finish}
          </button>
        </div>
      </header>

      <nav className="menu" aria-label={t.menuAria}>
        <span className="menu-title">{t.menuTitle}</span>
        <ul>
          {PRODUCTS.map((p) => (
            <li key={p.id} className={order.lines.some((l) => l.product === p.id) ? "in-order" : ""}>
              <img src={imageFor(p.id, p.defaultTemp)} alt="" />
              <span className="menu-name">{p.name[lang]}</span>
              <span className="menu-price">{fmt(p.basePrice[currency])}</span>
            </li>
          ))}
        </ul>
      </nav>

      <main className="cards" data-density={density}>
        {count === 0 && (
          <motion.div className="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2>{t.emptyTitle}</h2>
            <p>
              {t.emptyHint} <em>{t.emptyExample}</em>
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

interface Option {
  key: string;
  label: string;
  /** Nombre abreviado para cuando hay muchas tarjetas en pantalla. */
  short: string;
  /** Lo que suma o resta al precio elegir esta opción. */
  delta: number;
}

interface Row {
  key: string;
  label: string;
  options: Option[];
  active: number;
}

/** Todas las opciones de cada característica, con su efecto en el precio. */
function rowsFor(line: CartLine, lang: Lang, cur: Currency, t: Strings): Row[] {
  const p = PRODUCT_BY_ID[line.product];
  const opt = (key: string, label: string, delta: Price | number): Option => ({
    key,
    label,
    short: t.short[label] ?? label,
    delta: typeof delta === "number" ? delta : delta[cur],
  });
  const rows: Row[] = [];
  if (p.hasSize) {
    const keys = Object.keys(SIZES) as (keyof typeof SIZES)[];
    rows.push({ key: "size", label: t.rows.size, options: keys.map((k) => opt(k, SIZES[k].label[lang], SIZES[k].delta)), active: keys.indexOf(line.size) });
  }
  if (p.shots) {
    const { min, max, default: def } = p.shots;
    const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    rows.push({
      key: "shots",
      label: t.rows.shots,
      options: counts.map((n) => opt(String(n), `${n} shot${n === 1 ? "" : "s"}`, Math.max(0, n - def) * EXTRA_SHOT[cur])),
      active: line.shots - min,
    });
  }
  if (p.hasMilk) {
    const keys = Object.keys(MILKS) as (keyof typeof MILKS)[];
    rows.push({ key: "milk", label: t.rows.milk, options: keys.map((k) => opt(k, MILKS[k].label[lang], MILKS[k].delta)), active: keys.indexOf(line.milk) });
  }
  rows.push({
    key: "temp",
    label: t.rows.temp,
    options: p.temps.map((tp) => opt(tp, TEMPS[tp].label[lang], tp === "frio" && p.defaultTemp === "caliente" ? ICED_DELTA[cur] : 0)),
    active: p.temps.indexOf(line.temp),
  });
  if (p.hasFlavor) {
    const keys = Object.keys(FLAVORS) as (keyof typeof FLAVORS)[];
    rows.push({
      key: "flavor",
      label: t.rows.flavor,
      options: keys.map((k) => opt(k, FLAVORS[k].label[lang], FLAVORS[k].delta)),
      active: keys.indexOf(line.flavor),
    });
  }
  return rows;
}

function DrinkCard({ line, focused }: { line: CartLine; focused: boolean }) {
  const { lang, currency, t, fmt } = useSettings();
  const rows = useMemo(() => rowsFor(line, lang, currency, t), [line, lang, currency, t]);
  const prev = useRef<Record<string, string>>({});
  const [changed, setChanged] = useState<Record<string, number>>({});
  const deltaText = (d: number) => (d > 0 ? `+${fmt(d)}` : d < 0 ? `−${fmt(-d)}` : "+$0");

  // Resalta por un momento cada atributo que acaba de cambiar.
  useEffect(() => {
    const now: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.options[r.active]?.key ?? ""]));
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
      <h3>{lineName(line, lang)}</h3>
      <div className="card-price">{fmt(linePrice(line, currency))}</div>
      <ul className="rows">
        {rows.map((r) => (
          <li key={r.key} className={changed[r.key] ? "changed" : ""}>
            <span className="row-label">{r.label}</span>
            <span className="chips" style={{ gridTemplateColumns: `repeat(${r.options.length}, minmax(0, 1fr))` }}>
              {r.options.map((o, i) => (
                <span key={o.key} className={`chip ${i === r.active ? "on" : ""}`}>
                  <span className="chip-name full">{o.label}</span>
                  <span className="chip-name short">{o.short}</span>
                  <span className="chip-delta">{deltaText(o.delta)}</span>
                </span>
              ))}
            </span>
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
  const { t } = useSettings();
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
            placeholder={t.typePlaceholder}
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
          <p className="placeholder">{t.listening}</p>
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
  const { lang, currency, t, fmt } = useSettings();
  return (
    <motion.section className="summary" {...fade}>
      <header className="topbar">
        <Wordmark />
      </header>
      <div className="summary-body">
        <div className="summary-head">
          <p className="eyebrow">{t.summaryEyebrow}</p>
          <h1>{t.summaryTitle}</h1>
        </div>
        <ol className={`receipt ${lines.length > 4 ? "two" : ""}`}>
          {lines.map((line, i) => {
            const [base, ...mods] = priceBreakdown(line, currency, lang);
            return (
              <motion.li key={line.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
                <img src={imageFor(line.product, line.temp)} alt="" />
                <div className="receipt-main">
                  <h3>{lineName(line, lang)}</h3>
                  <p>
                    {[
                      `${t.base} ${fmt(base.amount)}`,
                      ...mods.map((m) => `${m.label} ${m.amount < 0 ? "−" : "+"}${fmt(Math.abs(m.amount))}`),
                    ].join("  ·  ")}
                  </p>
                </div>
                <span className="receipt-price">{fmt(linePrice(line, currency))}</span>
              </motion.li>
            );
          })}
        </ol>
        <div className={`summary-total ${lines.length > 4 ? "two" : ""}`}>
          <span>{t.total}</span>
          <strong>
            {fmt(orderTotal(lines, currency))} <small className="currency-code">{currency}</small>
          </strong>
        </div>
        <button className="btn btn-primary" onClick={onRestart}>
          {t.newOrder}
        </button>
      </div>
    </motion.section>
  );
}
