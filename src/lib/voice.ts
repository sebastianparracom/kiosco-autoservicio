// Micrófono → AssemblyAI en tiempo real (WebSocket) → texto palabra por palabra.
// Se usan los modelos "universal-streaming" porque emiten cada palabra en
// cuanto la reconocen; el modelo más nuevo solo actualiza cada ~1 segundo.
import { TURN_BREAK } from "./clauses";
import type { Lang } from "./menu";

const KEYTERMS: Record<Lang, string[]> = {
  es: [
    "tinto", "espresso", "capuchino", "latte", "mocca", "chocolate", "matcha", "chai", "cold brew", "granizado", "frappé",
    "deslactosada", "leche de avena", "leche de almendra", "vainilla", "caramelo", "avellana", "shots",
  ],
  en: [
    "black coffee", "tinto", "espresso", "cappuccino", "latte", "mocha", "hot chocolate", "matcha", "chai", "cold brew", "frappé",
    "lactose-free", "oat milk", "almond milk", "vanilla", "caramel", "hazelnut", "shots", "iced",
  ],
};

const ERRORS = {
  es: { lost: "Se perdió la conexión de voz", closed: "Se cerró la conexión de voz", stt: "Error de transcripción" },
  en: { lost: "The voice connection was lost", closed: "The voice connection closed", stt: "Transcription error" },
};

export interface VoiceCallbacks {
  /** Todo lo dicho en la sesión, con los turnos separados por TURN_BREAK. */
  onText: (fullText: string) => void;
  onLevel: (peak: number) => void;
  onError: (message: string) => void;
}

export class VoiceSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private finals = new Map<number, string>();
  private partial = "";
  private stopped = false;

  constructor(
    private cb: VoiceCallbacks,
    private lang: Lang = "es",
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const tokenRes = await fetch("/api/token", { method: "POST" });
    if (!tokenRes.ok) throw new Error("No se pudo iniciar la transcripción");
    const { token } = (await tokenRes.json()) as { token: string };

    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule("/pcm-worklet.js");

    const params = new URLSearchParams({
      token,
      sample_rate: String(this.ctx.sampleRate),
      ...(this.lang === "en"
        ? { speech_model: "universal-streaming-english" }
        : { speech_model: "universal-streaming-multilingual", language: "es" }),
      format_turns: "false",
      min_turn_silence: "350",
      max_turn_silence: "1000",
      keyterms_prompt: JSON.stringify(KEYTERMS[this.lang]),
    });
    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("No se pudo conectar con la transcripción"));
    });
    ws.onerror = () => !this.stopped && this.cb.onError(ERRORS[this.lang].lost);
    ws.onclose = (e) => !this.stopped && e.code !== 1000 && this.cb.onError(ERRORS[this.lang].closed);
    ws.onmessage = (e) => this.handle(JSON.parse(e.data as string));

    const source = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, "pcm-worklet");
    node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; peak: number }>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data.pcm);
      this.cb.onLevel(e.data.peak);
    };
    source.connect(node);
  }

  private handle(m: { type: string; turn_order?: number; end_of_turn?: boolean; transcript?: string; error?: string }) {
    if (m.type === "Error") return this.cb.onError(m.error ?? ERRORS[this.lang].stt);
    if (m.type !== "Turn" || m.turn_order == null) return;
    const text = (m.transcript ?? "").trim();
    if (m.end_of_turn) {
      if (text) this.finals.set(m.turn_order, text);
      this.partial = "";
    } else this.partial = text;
    const done = [...this.finals.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
    const full = [...done.map((t) => `${t} ${TURN_BREAK}`), this.partial].filter(Boolean).join(" ");
    this.cb.onText(full);
  }

  stop(): void {
    this.stopped = true;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "Terminate" }));
      this.ws?.close();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
  }
}
