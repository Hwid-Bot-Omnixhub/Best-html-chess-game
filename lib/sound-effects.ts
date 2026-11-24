import type { MoveQuality } from './chess-engine';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private crowdLoopBuffer: AudioBuffer | null = null;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  public muted = false;
  public crowdEnabled = true;

  private ensureContext(allowWhenCrowdOnly = false): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    void allowWhenCrowdOnly;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * 0.5, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (!this.crowdLoopBuffer && this.ctx) {
      // 2.5s warm pink-filtered crowd murmur loop buffer
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 2.5);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.015) * 1.4;
      }
      // Crossfade loop seam smoothly over first/last 0.08s
      const fadeLen = Math.floor(sr * 0.08);
      for (let i = 0; i < fadeLen; i++) {
        const t = i / fadeLen;
        data[i] = data[i] * t + data[len - fadeLen + i] * (1 - t);
      }
      this.crowdLoopBuffer = buf;
    }
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopCrowdAmbience();
    }
  }

  setCrowdEnabled(enabled: boolean) {
    this.crowdEnabled = enabled;
    if (!enabled) {
      this.stopCrowdAmbience();
    } else if (!this.muted) {
      this.updateCrowdAmbience(0.15, true);
    }
  }

  stopCrowdAmbience() {
    if (this.crowdSrc) {
      try {
        this.crowdSrc.stop();
        this.crowdSrc.disconnect();
      } catch {
        // Ignore already-stopped node
      }
      this.crowdSrc = null;
    }
    if (this.crowdFilter) {
      try {
        this.crowdFilter.disconnect();
      } catch {
        // ignore
      }
      this.crowdFilter = null;
    }
    if (this.crowdGain) {
      try {
        this.crowdGain.disconnect();
      } catch {
        // ignore
      }
      this.crowdGain = null;
    }
  }

  updateCrowdAmbience(excitement: number, active: boolean) {
    if (!active || !this.crowdEnabled || this.muted) {
      if (this.crowdGain && this.ctx) {
        this.crowdGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      }
      return;
    }

    const ctx = this.ensureContext(true);
    if (!ctx || !this.crowdLoopBuffer) return;

    if (!this.crowdSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this.crowdLoopBuffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 520;
      filter.Q.value = 0.65;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();

      this.crowdSrc = src;
      this.crowdFilter = filter;
      this.crowdGain = gain;
    }

    const clamped = Math.max(0, Math.min(1, excitement));
    const targetGain = 0.016 + clamped * 0.055;
    const targetFreq = 420 + clamped * 640;
    if (this.crowdGain) {
      this.crowdGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.18);
    }
    if (this.crowdFilter) {
      this.crowdFilter.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.22);
    }
  }

  playCrowdGasp() {
    if (!this.crowdEnabled || this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crowdLoopBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.crowdLoopBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(1180, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.65);
    filter.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.095, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.75);
  }

  playCrowdCheer(intense = false) {
    if (!this.crowdEnabled || this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crowdLoopBuffer || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const dur = intense ? 2.1 : 1.05;

    // Warm roar bed
    const src = ctx.createBufferSource();
    src.buffer = this.crowdLoopBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(intense ? 880 : 720, now);
    filter.frequency.linearRampToValueAtTime(intense ? 1280 : 960, now + dur * 0.45);
    filter.Q.setValueAtTime(0.75, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(intense ? 0.125 : 0.068, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.05);

    // Procedural scattered handclaps
    const clapCount = intense ? 14 : 6;
    for (let i = 0; i < clapCount; i++) {
      const t = now + 0.05 + (i / clapCount) * (dur * 0.75) + Math.random() * 0.06;
      const cSrc = ctx.createBufferSource();
      cSrc.buffer = this.noiseBuffer;
      const cFilter = ctx.createBiquadFilter();
      cFilter.type = 'bandpass';
      cFilter.frequency.setValueAtTime(1400 + Math.random() * 900, t);
      cFilter.Q.setValueAtTime(2.0, t);
      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.001, t);
      cGain.gain.linearRampToValueAtTime(intense ? 0.055 : 0.032, t + 0.006);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      cSrc.connect(cFilter);
      cFilter.connect(cGain);
      cGain.connect(ctx.destination);
      cSrc.start(t);
      cSrc.stop(t + 0.065);
    }
  }

  playCameraShutter() {
    if (!this.crowdEnabled || this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    for (const offset of [0, 0.055]) {
      const t = now + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2600, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.03, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.03);
    }
  }

  playMoveTap() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.07);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playCaptureSnap() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.09);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playClockClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.03);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playMoveQualitySfx(quality: MoveQuality) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (quality === 'brilliant') {
      // Sparkling major-9th triumphant bell arpeggio
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.065;
        const osc = ctx.createOscillator();
        const shimmer = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        shimmer.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        shimmer.frequency.setValueAtTime(freq * 2, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.13, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        osc.connect(gain);
        shimmer.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        shimmer.start(t);
        osc.stop(t + 0.44);
        shimmer.stop(t + 0.44);
      });
    } else if (quality === 'great') {
      // Bright ascending two-note chime
      [587.33, 880.0].forEach((freq, idx) => {
        const t = now + idx * 0.085;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.11, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } else if (quality === 'best' || quality === 'excellent') {
      // Subtle crisp confirmation ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(quality === 'best' ? 784 : 698.46, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (quality === 'inaccuracy') {
      // Mild uncertain nudge
      [349.23, 311.13].forEach((freq, idx) => {
        const t = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } else if (quality === 'mistake') {
      // Descending minor warning tone
      [329.63, 246.94].forEach((freq, idx) => {
        const t = now + idx * 0.11;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(750, t);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      });
    } else if (quality === 'blunder') {
      // Dramatic descending "wah-wah-wah-waaaah" blunder horn
      const notes = [
        { freq: 233.08, dur: 0.16, off: 0 },
        { freq: 220.0, dur: 0.16, off: 0.17 },
        { freq: 207.65, dur: 0.16, off: 0.34 },
        { freq: 196.0, dur: 0.44, off: 0.51, slideTo: 162.0 },
      ];
      notes.forEach((n) => {
        const t = now + n.off;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.freq, t);
        if (n.slideTo) {
          osc.frequency.linearRampToValueAtTime(n.slideTo, t + n.dur);
        }
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(620, t);
        filter.Q.setValueAtTime(3.0, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.13, t + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + n.dur + 0.02);
      });
    }
  }

  playTableSlam() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.18);
    }
  }

  playPieceClatter(count = 4) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const t = now + i * 0.055 + Math.random() * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360 + Math.random() * 260, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  playBoardFlipCrash() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.42);
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.26);
    }
  }

  playWinnerLaugh() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const syllables = [0, 0.14, 0.28, 0.43, 0.59];
    syllables.forEach((offset, idx) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const baseFreq = 260 - idx * 14;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, t + 0.1);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, t);
      filter.Q.setValueAtTime(3.2, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  playRageGrunt() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.linearRampToValueAtTime(92, now + 0.38);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  playFrustratedSigh() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.crowdLoopBuffer || this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.crowdLoopBuffer || this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.9);
      filter.Q.setValueAtTime(2.1, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.96);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 1.0);
    }

    // Subtle soft descending breathy vocal tone
    const osc = ctx.createOscillator();
    const oscFilter = ctx.createBiquadFilter();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(102, now + 0.82);
    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(360, now);
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(0.042, now + 0.12);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.88);
  }
}

export const soundEngine = new SoundEngine();
