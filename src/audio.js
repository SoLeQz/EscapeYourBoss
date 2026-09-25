// Ambiance du bureau et interactions. Aucun son de détection.
// Seule exception : la musique de l’emote qui la porte (Passinho / Ela Ké Leitada).
export function mixSpatial(source, listener, yaw) {
  const dx = source.x - listener.x, dz = source.z - listener.z;
  const d = Math.hypot(dx, dz);
  return { pan: d < 0.01 ? 0 : Math.max(-1, Math.min(1,
    (-Math.cos(yaw) * dx + Math.sin(yaw) * dz) / d)),
    gain: 1 / (1 + (d / 5) ** 2) };
}
export class GameAudio {
  constructor() {
    this.ctx = null; this.enabled = true; this.typeT = 0;
    this.listener = { x: 0, z: 0 }; this.yaw = 0;
    this.sons = new Map(); this.musique = null;
  }
  listen(pos, yaw) { this.listener = { x: pos.x, z: pos.z }; this.yaw = yaw; }
  connectSpatial(node, pos) {
    if (!pos) { node.connect(this.master); return () => node.disconnect(); }
    const mix = mixSpatial(pos, this.listener, this.yaw);
    const pan = this.ctx.createStereoPanner(), gain = this.ctx.createGain();
    pan.pan.value = mix.pan; gain.gain.value = mix.gain;
    node.connect(pan).connect(gain).connect(this.master);
    return () => { node.disconnect(); pan.disconnect(); gain.disconnect(); };
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this._boot(); }
    catch (e) { console.warn('audio indisponible, on continue sans :', e.message); this.ctx = null; }
  }

  _boot() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);

    // --- nappe de murmures de bureau ---
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(4);
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.055;
    noise.connect(lp).connect(g).connect(this.master);
    noise.start();
    this.murmurGain = g;

    // --- ventilation ---
    const hum = this.ctx.createOscillator();
    hum.type = 'sawtooth'; hum.frequency.value = 58;
    const hlp = this.ctx.createBiquadFilter();
    hlp.type = 'lowpass'; hlp.frequency.value = 160;
    const hg = this.ctx.createGain(); hg.gain.value = 0.022;
    hum.connect(hlp).connect(hg).connect(this.master);
    hum.start();


  }

  noiseBuffer(sec) {
    const n = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  burst({ freq = 400, dur = 0.08, type = 'square', vol = 0.1, sweep = 0, q = 1, pos = null, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); const disconnect = this.connectSpatial(g, pos);
    o.onended = () => { o.disconnect(); disconnect(); };
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseHit({ dur = 0.06, vol = 0.12, freq = 900, q = 1.2, type = 'bandpass', pos = null, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer(Math.max(0.25, dur + 0.02));
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); const disconnect = this.connectSpatial(g, pos);
    s.onended = () => { s.disconnect(); f.disconnect(); disconnect(); };
    s.start(t); s.stop(t + dur + 0.02);
  }


  step(intensity = 0.6, pos = null) {
    this.noiseHit({ dur: 0.07, vol: 0.06 * intensity, freq: 260, q: 0.9, pos });
  }
  keyClick(pos) { this.noiseHit({ dur: 0.035, vol: 0.035, freq: 2400, q: 3, pos }); }
  blip() { this.burst({ freq: 880, dur: 0.1, type: 'sine', vol: 0.09, sweep: 400 }); }
  ding() {
    this.burst({ freq: 1320, dur: 0.5, type: 'sine', vol: 0.12 });
    this.burst({ freq: 990, dur: 0.7, type: 'sine', vol: 0.1, delay: 0.16 });
  }
  door(pos) { this.noiseHit({ dur: 0.35, vol: 0.09, freq: 180, q: 0.6, type: 'lowpass', pos }); }
  impression(pos) {
    this.noiseHit({ dur: 0.5, vol: 0.08, freq: 700, q: 1.6, pos });
    this.noiseHit({ dur: 0.8, vol: 0.07, freq: 420, q: 0.9, pos, delay: 0.42 });
  }
  telephone(pos) {
    for (const delay of [0, 0.11, 0.62, 0.73])
      this.burst({ freq: 1180, dur: 0.09, type: 'sine', vol: 0.045, pos, delay });
  }
  cafe(pos) { this.noiseHit({ dur: 1.1, vol: 0.06, freq: 300, q: 0.7, pos }); }
  porteLointaine(pos) { this.door(pos); }
  success() {
    [523, 659, 784, 1046].forEach((freq, i) =>
      this.burst({ freq, dur: 0.35, type: 'triangle', vol: 0.1, delay: i * 0.12 }));
  }
  // Décodé une seule fois, à la demande ; null si le fichier manque.
  chargerSon(nom, lire = n => window.jeuAssets.lire(n)) {
    if (!this.ctx) return Promise.resolve(null);
    if (!this.sons.has(nom)) this.sons.set(nom, Promise.resolve(lire(nom))
      .then(o => o ? this.ctx.decodeAudioData(o) : null)
      .catch(e => { console.warn('son illisible :', nom, e.message); return null; })
      .then(b => (this.sons.set(nom, b), b)));
    const s = this.sons.get(nom);
    return s instanceof Promise ? s : Promise.resolve(s);
  }
  // Suit l’emote en cours : démarre à la bonne position, se recale si le
  // jeu a pris du retard, s’éteint en fondu si l’emote est coupée ou finie.
  // `emote` : { def, t } ou null.
  suivreMusique(emote) {
    const son = emote?.def.son, m = this.musique;
    if (!this.ctx || !son) { if (m) this.couperMusique(); return; }
    const buffer = this.sons.get(son.fichier);
    if (!buffer) { this.chargerSon(son.fichier); if (m) this.couperMusique(); return; }
    if (buffer instanceof Promise) return;
    const position = emote.t - son.debut;
    if (m && m.def === emote.def &&
        Math.abs(this.ctx.currentTime - m.depart - position) < 0.12) return;
    if (m) this.couperMusique(0.03);
    if (position < 0 || position >= buffer.duration) return;
    const src = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    src.buffer = buffer; gain.gain.value = 0.75;
    src.connect(gain).connect(this.master);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
    src.start(0, position);
    this.musique = { def: emote.def, src, gain, depart: this.ctx.currentTime - position };
  }
  couperMusique(fondu = 0.18) {
    const m = this.musique; if (!m) return;
    this.musique = null;
    const t = this.ctx.currentTime;
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + fondu);
    m.src.stop(t + fondu + 0.02);
  }
  update(dt, source) {
    if (!this.ctx || !this.enabled || !source) return;
    this.typeT -= dt;
    if (this.typeT <= 0) {
      this.typeT = 0.08 + Math.random() * 0.25;
      this.keyClick(source);
    }
  }
}
