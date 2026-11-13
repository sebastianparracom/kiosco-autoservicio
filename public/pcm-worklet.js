// Convierte el audio del micrófono a PCM de 16 bits en bloques de ~50 ms.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.05);
    this.buf = new Int16Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      if (Math.abs(s) > peak) peak = Math.abs(s);
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.size) {
        const out = this.buf.slice(0);
        this.port.postMessage({ pcm: out.buffer, peak }, [out.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
