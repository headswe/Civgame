/**
 * Tiny synthesized sound effects — no assets, just oscillators with
 * envelopes. The AudioContext is created lazily on the first user gesture
 * (browser autoplay policy). Press M to mute.
 */
type SfxName = "select" | "move" | "hit" | "kill" | "build" | "produce" | "era" | "endturn" | "scavenge";

class Sfx {
  private ctx: AudioContext | null = null;
  muted = localStorage.getItem("power-muted") === "1";

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("power-muted", this.muted ? "1" : "0");
    return this.muted;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + opts.slide), t0 + dur);
    const vol = opts.vol ?? 0.08;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name: SfxName) {
    switch (name) {
      case "select":
        this.tone(660, 0.05, { vol: 0.03 });
        break;
      case "move":
        this.tone(340, 0.09, { slide: -140, vol: 0.05 });
        break;
      case "hit":
        this.tone(120, 0.12, { type: "square", slide: -60, vol: 0.07 });
        this.tone(900, 0.03, { type: "sawtooth", vol: 0.02 });
        break;
      case "kill":
        this.tone(90, 0.3, { type: "sawtooth", slide: -55, vol: 0.09 });
        break;
      case "build":
        this.tone(220, 0.1, { vol: 0.06 });
        this.tone(330, 0.12, { delay: 0.07, vol: 0.06 });
        break;
      case "produce":
        this.tone(262, 0.08, { vol: 0.05 });
        this.tone(392, 0.1, { delay: 0.06, vol: 0.05 });
        break;
      case "scavenge":
        this.tone(500, 0.06, { vol: 0.05 });
        this.tone(700, 0.08, { delay: 0.05, vol: 0.05 });
        this.tone(1000, 0.1, { delay: 0.1, vol: 0.04 });
        break;
      case "era":
        this.tone(523, 0.14, { vol: 0.06 });
        this.tone(659, 0.14, { delay: 0.1, vol: 0.06 });
        this.tone(784, 0.22, { delay: 0.2, vol: 0.06 });
        break;
      case "endturn":
        this.tone(150, 0.15, { slide: -60, vol: 0.04 });
        break;
    }
  }
}

export const sfx = new Sfx();
