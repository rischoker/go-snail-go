/* =========================================================
   GO! SNAIL GO!  —  sentence unscramble duel (Mocha vs Mochi)
   ========================================================= */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IMG = n => `assets/img/${n}.webp`;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wrap = d => ((d % 360) + 540) % 360 - 180;
const store = {
  get(k, d) { try { const v = localStorage.getItem('gsg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gsg_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- stage scaling ---------- */
const stage = $('#stage');
let SCALE = 1;
function fit() {
  const w = innerWidth, h = innerHeight;
  SCALE = Math.min(w / 1920, h / 1080);
  stage.style.transform = `translate(${(w - 1920 * SCALE) / 2}px,${(h - 1080 * SCALE) / 2}px) scale(${SCALE})`;
}
addEventListener('resize', fit); fit();
function toStage(cx, cy) { const r = stage.getBoundingClientRect(); return { x: (cx - r.left) / SCALE, y: (cy - r.top) / SCALE }; }
function centerOf(el) { const r = el.getBoundingClientRect(); return toStage(r.left + r.width / 2, r.top + r.height / 2); }

/* ---------- block browser menus / zoom on the touch screen ---------- */
['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

/* ---------- preload faces ---------- */
const FACES = ['happy', 'relief', 'strain', 'surprised', 'confused', 'nervous', 'scared', 'dizzy', 'smug', 'cry', 'celebrate', 'sleepy'];
const preload = [];
FACES.forEach(f => { const i = new Image(); i.src = IMG('face_' + f); preload.push(i); });
['poop', 'poop_gold', 'star', 'owl2'].forEach(n => { const i = new Image(); i.src = IMG(n); preload.push(i); });

/* =========================================================
   AUDIO
   ========================================================= */
let muted = store.get('muted', false);
const mLobby = $('#mLobby'), mGame = $('#mGame');
mLobby.volume = 0.55; mGame.volume = 0.5;
let AC = null, master = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(AC.destination); } catch (e) {}
}
let currentMusic = null;
function music(which) {
  const m = which === 'game' ? mGame : which === 'lobby' ? mLobby : null;
  if (currentMusic && currentMusic !== m) { currentMusic.pause(); }
  currentMusic = m;
  if (m) { m.playbackRate = 1; if (!muted) { m.currentTime = which === 'game' ? 0 : m.currentTime; const p = m.play(); if (p) p.catch(() => {}); } }
}
function setMuted(v) {
  muted = v; store.set('muted', v);
  if (master) master.gain.value = v ? 0 : 0.9;
  if (currentMusic) { if (v) currentMusic.pause(); else { const p = currentMusic.play(); if (p) p.catch(() => {}); } }
  $('#sndBtn').classList.toggle('off', v);
}
function tone(f, d, type = 'sine', vol = .2, f2 = null, delay = 0) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
}
let noiseBuf = null;
function noise(d, vol = .2, freq = 1200, delay = 0, q = 1, f2 = null) {
  if (!AC || muted) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(freq, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05);
}

/* ---------- snail voices (ElevenLabs) — Mocha lower, Mochi higher ---------- */
const VOICE_N = { yay: 3, strain: 3, relief: 3, huh: 3, woohoo: 2, cry: 1, dizzy: 3, snore: 3, giggle: 3 };
const voiceBank = {};
['mocha', 'mochi'].forEach(t => Object.entries(VOICE_N).forEach(([k, n]) => {
  for (let i = 1; i <= n; i++) { const a = new Audio(`assets/snd/voice/${t}_${k}${i}.mp3`); a.preload = 'auto'; (voiceBank[t + k] = voiceBank[t + k] || []).push(a); }
}));
const lastVoice = {};
function voice(team, kind, vol = 0.85) {
  if (muted) return;
  const list = voiceBank[team + kind]; if (!list) return;
  const prev = lastVoice[team]; if (prev) { try { prev.pause(); } catch (e) {} }
  const a = pick(list); a.currentTime = 0; a.volume = vol;
  const p = a.play(); if (p) p.catch(() => {});
  lastVoice[team] = a;
}
const sfx = {
  ui() { tone(660, .08, 'triangle', .18, 990); },
  spin(side) { const b = side === 'mocha' ? 420 : 520; tone(b + rand(-20, 20), .05, 'square', .06, b * 1.4); noise(.04, .08, 3000); },
  strain() { tone(130, .26, 'sawtooth', .07, 95); tone(196, .26, 'triangle', .05, 150); },
  plop() { tone(720, .16, 'sine', .32, 140); noise(.09, .15, 500, .02); },
  whoosh() { noise(.45, .1, 600, 0, .8, 2600); },
  land() { tone(392, .09, 'sine', .22, 523); tone(784, .14, 'sine', .14, 1046, .07); },
  gold() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, 'triangle', .16, null, i * .07)); },
  wrong() { tone(420, .14, 'triangle', .2, 200); tone(260, .22, 'triangle', .16, 150, .12); },
  count() { tone(587, .2, 'square', .1); },
  go() { tone(880, .45, 'square', .1); tone(1318, .45, 'triangle', .1); },
  clock() { tone(1250, .05, 'square', .07); },
  alarm() { tone(880, .25, 'square', .12, 660); tone(880, .25, 'square', .12, 660, .3); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .26, 'triangle', .18, null, i * .11)); noise(.9, .07, 2500, .3, .5); },
  draw() { tone(523, .2, 'triangle', .15); tone(494, .3, 'triangle', .15, 440, .2); },
  fanfare() { const n = [523, 523, 523, 659, 784, 659, 784, 1046]; const d = [0, .15, .3, .45, .7, .95, 1.1, 1.3]; n.forEach((f, i) => tone(f, i === 7 ? .9 : .2, 'triangle', .2, null, d[i])); [0, .45, 1.3].forEach(t => noise(.8, .06, 2600, t, .5)); },
  hop() { tone(400, .15, 'sine', .2, 900); },
  pop() { tone(900, .07, 'sine', .15, 1400); }
};

/* =========================================================
   SCREENS
   ========================================================= */
let screen = 'splash';
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  screen = id;
}

/* =========================================================
   WORLD  (animated background)
   ========================================================= */
const cloudLayer = $('#cloudLayer'), airLayer = $('#airLayer'), bugLayer = $('#bugLayer');
function drift(el, from, to, dur, y, extra = {}) {
  const a = el.animate([{ transform: `translate(${from}px,${y}px)` }, { transform: `translate(${to}px,${y + (extra.dy || 0)}px)` }], { duration: dur, iterations: Infinity });
  a.currentTime = rand(0, dur);
  return a;
}
[['fcloud1', 260, 70], ['fcloud2', 230, 170], ['fcloud3', 210, 260], ['cloud1', 210, 40], ['cloud_yellow', 160, 210], ['cloud2', 130, 120], ['fcloud1', 180, 330]].forEach(([n, w, y], i) => {
  const c = document.createElement('img'); c.src = IMG(n); c.className = 'cloud'; c.style.width = w + 'px';
  cloudLayer.appendChild(c);
  const dir = i % 3 === 1 ? -1 : 1;
  drift(c, dir > 0 ? -320 : 2100, dir > 0 ? 2100 : -320, rand(70000, 130000), y);
});
['balloon1', 'balloon2', 'balloon3'].forEach((n, i) => {
  const b = document.createElement('img'); b.src = IMG(n); b.className = 'balloon'; b.style.width = (70 + i * 12) + 'px';
  airLayer.appendChild(b);
  const x0 = [250, 1450, 900][i];
  const a = b.animate([
    { transform: `translate(${x0}px,760px) rotate(-4deg)` },
    { transform: `translate(${x0 + 140}px,380px) rotate(4deg)` },
    { transform: `translate(${x0 + 60}px,0px) rotate(-3deg)` },
    { transform: `translate(${x0 + 220}px,-260px) rotate(3deg)` }], { duration: rand(55000, 80000), iterations: Infinity });
  a.currentTime = rand(0, 50000);
});
const BIRD_COLORS = [['#4fa3d9', '#2f6f9c'], ['#e8604f', '#a33a2c'], ['#f2c84b', '#b98a1c'], ['#9a72c9', '#5f3f8c']];
function birdSVG(c) {
  return `<svg viewBox="0 0 70 46" width="70" height="46"><ellipse cx="34" cy="26" rx="22" ry="15" fill="${c[0]}" stroke="${c[1]}" stroke-width="2" stroke-dasharray="4 3"/>
  <circle cx="51" cy="20" r="11" fill="${c[0]}" stroke="${c[1]}" stroke-width="2" stroke-dasharray="4 3"/><circle cx="55" cy="18" r="2.6" fill="#222"/>
  <path d="M61 21 L69 24 L61 27Z" fill="#f39a3c"/><path d="M14 26 L2 20 L6 31Z" fill="${c[1]}"/>
  <path class="w" d="M26 24 Q32 2 44 22Z" fill="${c[1]}" stroke="#fff6e2" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`;
}
function spawnBirds() {
  const n = 1 + Math.floor(Math.random() * 3), ltr = Math.random() < .5, y0 = rand(80, 330), dur = rand(9000, 14000), c = pick(BIRD_COLORS);
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'bird'; d.innerHTML = birdSVG(c);
    airLayer.appendChild(d);
    const y = y0 + i * 28 + rand(-8, 8), off = i * 70, s = ltr ? 1 : -1;
    const a = d.animate([
      { transform: `translate(${ltr ? -120 - off : 2040 + off}px,${y}px) scaleX(${s})` },
      { transform: `translate(960px,${y - 50}px) scaleX(${s})` },
      { transform: `translate(${ltr ? 2040 + off : -120 - off}px,${y + 20}px) scaleX(${s})` }], { duration: dur, delay: i * 180 });
    a.onfinish = () => d.remove();
  }
  setTimeout(spawnBirds, rand(9000, 17000));
}
setTimeout(spawnBirds, 2500);
const BF = [['#f39ac0', '#e05a8f'], ['#ffd34d', '#e59a1c'], ['#8fd0f0', '#3f8fc0']];
function bflySVG(c) {
  return `<svg viewBox="0 0 52 44" width="52" height="44"><g class="wl"><path d="M25 22 C10 0 0 6 4 18 C0 30 12 40 25 24Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="2" stroke-dasharray="3 2"/></g>
  <g class="wr"><path d="M27 22 C42 0 52 6 48 18 C52 30 40 40 27 24Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="2" stroke-dasharray="3 2"/></g>
  <rect x="24" y="12" width="4" height="22" rx="2" fill="#5a3416"/></svg>`;
}
BF.forEach((c, i) => {
  const b = document.createElement('div'); b.className = 'bfly'; b.innerHTML = bflySVG(c); bugLayer.appendChild(b);
  let x = rand(100, 1800), y = rand(620, 820);
  const hop = () => {
    const nx = Math.max(40, Math.min(1860, x + rand(-380, 380))), ny = rand(560, 860);
    const a = b.animate([{ transform: `translate(${x}px,${y}px) rotate(${nx < x ? -12 : 12}deg)` }, { transform: `translate(${(x + nx) / 2}px,${Math.min(y, ny) - 70}px)` }, { transform: `translate(${nx}px,${ny}px) rotate(0deg)` }], { duration: rand(2600, 4200), easing: 'ease-in-out', fill: 'forwards' });
    x = nx; y = ny; a.onfinish = hop;
  };
  setTimeout(hop, i * 900);
});
const owl = $('#owl');
function owlPeek() {
  owl.classList.add('up');
  let k = 0; const look = setInterval(() => { owl.src = IMG(++k % 2 ? 'owl2' : 'owl'); }, 900);
  setTimeout(() => { clearInterval(look); owl.src = IMG('owl'); owl.classList.remove('up'); }, 4200);
  setTimeout(owlPeek, rand(18000, 30000));
}
setTimeout(owlPeek, 7000);
const toast = $('#toast');
function toastPeek() { toast.classList.add('up'); setTimeout(() => toast.classList.remove('up'), 2400); setTimeout(toastPeek, rand(70000, 110000)); }
setTimeout(toastPeek, 45000);
const rainbow = $('#rainbow');

/* =========================================================
   FX  (poop flight, sparks, confetti)
   ========================================================= */
const fx = $('#fx');
function sparks(x, y, n = 8, size = 34) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('img'); s.src = IMG('star'); s.className = 'spark'; s.style.width = s.style.height = size + 'px';
    fx.appendChild(s);
    const a = rand(0, Math.PI * 2), d = rand(50, 120);
    s.animate([{ transform: `translate(${x - size / 2}px,${y - size / 2}px) scale(.3) rotate(0)`, opacity: 1 },
      { transform: `translate(${x - size / 2 + Math.cos(a) * d}px,${y - size / 2 + Math.sin(a) * d}px) scale(1) rotate(${rand(-180, 180)}deg)`, opacity: 1, offset: .6 },
      { transform: `translate(${x - size / 2 + Math.cos(a) * d * 1.2}px,${y - size / 2 + Math.sin(a) * d * 1.2 + 30}px) scale(.4)`, opacity: 0 }], { duration: rand(600, 900), easing: 'ease-out' }).onfinish = () => s.remove();
  }
}
function puffs(x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div'); p.className = 'puff'; fx.appendChild(p);
    const a = rand(Math.PI * .9, Math.PI * 2.1), d = rand(30, 70);
    p.animate([{ transform: `translate(${x - 20}px,${y - 20}px) scale(.4)`, opacity: .95 }, { transform: `translate(${x - 20 + Math.cos(a) * d}px,${y - 20 + Math.sin(a) * d}px) scale(1.3)`, opacity: 0 }], { duration: 500, easing: 'ease-out' }).onfinish = () => p.remove();
  }
}
function confetti(n = 70, x0 = 0, x1 = 1920) {
  for (let i = 0; i < n; i++) {
    const c = document.createElement('img'); c.src = IMG('c_' + Math.floor(Math.random() * 20)); c.className = 'conf';
    const w = rand(30, 56); c.style.width = w + 'px'; fx.appendChild(c);
    const x = rand(x0, x1), dx = rand(-200, 200), r = rand(-720, 720), dur = rand(2600, 4600);
    c.animate([{ transform: `translate(${x}px,-80px) rotate(0deg)` }, { transform: `translate(${x + dx / 2}px,500px) rotate(${r / 2}deg)`, offset: .5 }, { transform: `translate(${x + dx}px,1150px) rotate(${r}deg)` }],
      { duration: dur, delay: rand(0, 900), easing: 'cubic-bezier(.3,.1,.7,1)' }).onfinish = () => c.remove();
  }
}
function flyPoop(from, to, word, gold, done) {
  const d = document.createElement('div'); d.className = 'flyPoop';
  d.innerHTML = `<img src="${IMG(gold ? 'poop_gold' : 'poop')}"><span class="lbl"></span>`;
  const pimg = d.querySelector('img');
  d.querySelector('.lbl').textContent = word; fx.appendChild(d);
  const W = 130, H = 150;
  const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 260;
  const frames = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, it = 1 - t;
    const x = it * it * from.x + 2 * it * t * cx + t * t * to.x;
    const y = it * it * from.y + 2 * it * t * cy + t * t * to.y;
    const s = i === 0 ? .2 : i < 3 ? 1.15 : 1 - t * .25;
    frames.push({ transform: `translate(${x - W / 2}px,${y - H / 2}px) scale(${s})` });
  }
  pimg.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${(from.x < to.x ? 1 : -1) * 360}deg)` }], { duration: 760 });
  const a = d.animate(frames, { duration: 760, easing: 'cubic-bezier(.35,.1,.55,1)', fill: 'forwards' });
  a.onfinish = () => { d.remove(); done && done(); };
}

/* =========================================================
   SNAIL
   ========================================================= */
const SHELL_D = 500, SHELL_C = SHELL_D / 2;
class Snail {
  constructor(host, team, opts = {}) {
    this.team = team; this.flip = team === 'mocha'; this.opts = opts;
    const el = this.el = document.createElement('div');
    el.className = 'snail ' + team + (this.flip ? ' flip' : '');
    el.innerHTML = `<div class="shadow"></div><div class="bodyWrap breathe"><img class="body" src="${IMG('face_happy')}" alt=""></div>
      <div class="shell"><img class="shellImg" src="${IMG('shell_' + team)}" alt=""><div class="words"></div></div>`;
    host.appendChild(el);
    this.body = $('.body', el); this.bodyWrap = $('.bodyWrap', el); this.shell = $('.shell', el); this.shellImg = $('.shellImg', el); this.wordsEl = $('.words', el);
    // geometry (snail-local coordinates, 760 x 520 box)
    this.cx = this.flip ? 260 : 500; this.cy = 250;
    this.shell.style.left = (this.cx - SHELL_C) + 'px'; this.shell.style.top = (this.cy - SHELL_C) + 'px';
    this.E = this.flip ? 155 : 25;                       // exit angle (deg, screen coords)
    this.tail = { x: this.flip ? 110 : 650, y: 468 };     // where the popis comes out
    if (opts.exit) {
      const m = document.createElement('div'); m.className = 'exitMark';
      const r = SHELL_C + 30, a = this.E * Math.PI / 180;
      m.style.left = (this.cx + Math.cos(a) * r) + 'px'; m.style.top = (this.cy + Math.sin(a) * r) + 'px';
      m.innerHTML = `<i style="rotate:${this.E}deg">➜</i>`;
      el.appendChild(m); this.exitMark = m;
    }
    this.R = 0; this.tR = 0; this.items = []; this.sel = 0; this.autoSpin = opts.autoSpin || 0;
    this.face = 'happy'; this.base = 'happy'; this.ovr = null; this.ovrUntil = 0;
    this.spinTimes = [];
  }
  setFace(n) { if (n !== this.face) { this.face = n; this.body.src = IMG('face_' + n); } }
  say(n, ms) { this.ovr = n; this.ovrUntil = performance.now() + ms; this.setFace(n); }
  anim(cls, ms) { this.el.classList.remove(cls); void this.el.offsetWidth; this.el.classList.add(cls); clearTimeout(this['_t' + cls]); if (ms) this['_t' + cls] = setTimeout(() => this.el.classList.remove(cls), ms); }
  stopAnims() { ['party', 'hop', 'strain', 'shake'].forEach(c => this.el.classList.remove(c)); }
  get step() { return 360 / Math.max(1, this.items.length); }
  setWords(words) {
    this.wordsEl.innerHTML = ''; this.items = [];
    words.forEach(w => {
      const t = document.createElement('div'); t.className = 'wtag'; t.textContent = w; this.wordsEl.appendChild(t);
      this.items.push({ text: w, el: t, ang: rand(0, 360), rad: 0, tAng: 0, tRad: 0, w: 0, h: 0 });
    });
    this.sel = Math.floor(Math.random() * this.items.length);
    this.layout(true);
    this.items.forEach(it => { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; });
  }
  layout() {
    const n = this.items.length; if (!n) return;
    const step = 360 / n, A0 = this.E - this.tR - this.sel * step;
    const outer = 168, inner = n >= 7 ? 84 : n >= 5 ? 96 : 128;
    const was = this.wordsEl.classList.contains('many');
    this.wordsEl.classList.toggle('many', n >= 8);
    if (was !== (n >= 8)) this.items.forEach(it => { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; });
    this.items.forEach((it, j) => {
      it.tAng = A0 + j * step;
      it.tRad = j === this.sel ? 176 : (n <= 4 ? 128 : ((j - this.sel) % 2 ? inner : outer));
      it.el.classList.toggle('sel', j === this.sel);
    });
  }
  rotate(dir) {
    if (!this.items.length) return;
    this.tR += dir * this.step;
    this.sel = (this.sel - dir + this.items.length * 4) % this.items.length;
    this.layout();
    const now = performance.now(); this.spinTimes.push(now); this.spinTimes = this.spinTimes.filter(t => now - t < 2600);
    if (this.spinTimes.length >= 11) { this.say('dizzy', 1100); this.spinTimes = []; voice(this.team, 'dizzy'); }
  }
  selected() { return this.items[this.sel]; }
  removeSelected() {
    const it = this.items.splice(this.sel, 1)[0];
    it.el.animate([{ transform: it.el.style.transform + ' scale(1)', opacity: 1 }, { transform: it.el.style.transform + ' scale(.1)', opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => it.el.remove();
    const n = this.items.length;
    if (n) {
      const cand = [this.sel % n, (this.sel - 1 + n) % n];
      this.sel = cand[Math.random() < .5 ? 0 : 1];
      this.layout();
    }
    return it;
  }
  revealAll() { this.items.forEach(it => it.el.classList.remove('sel')); }
  clearWords() { this.items.forEach(it => it.el.remove()); this.items = []; }
  frame(dt, now) {
    if (this.autoSpin) this.tR += this.autoSpin * dt;
    const k = Math.min(1, dt * 13);
    this.R += (this.tR - this.R) * k;
    this.shellImg.style.transform = `rotate(${this.R}deg)`;
    for (const it of this.items) {
      it.ang += wrap(it.tAng - it.ang) * k; it.rad += (it.tRad - it.rad) * k;
      const a = (it.ang + this.R) * Math.PI / 180;
      const x = SHELL_C + Math.cos(a) * it.rad - it.w / 2, y = SHELL_C + Math.sin(a) * it.rad - it.h / 2;
      it.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)${it.el.classList.contains('sel') ? ' scale(1.16)' : ''}`;
    }
    if (this.ovr && now > this.ovrUntil) this.ovr = null;
    if (!this.ovr) this.setFace(this.base);
  }
  // stage-space position of a snail-local point
  local(p) { const r = this.el.getBoundingClientRect(); const s = toStage(r.left, r.top); return { x: s.x + p.x, y: s.y + p.y }; }
  enableDrag(onStep) {
    let id = null, last = 0, acc = 0;
    const ang = e => { const r = this.shell.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    this.shell.style.pointerEvents = 'auto';
    this.shell.addEventListener('pointerdown', e => { if (id !== null) return; id = e.pointerId; last = ang(e); acc = 0; this.shell.setPointerCapture(id); e.preventDefault(); });
    this.shell.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const a = ang(e); acc += wrap(a - last); last = a;
      const st = this.step * .75;
      while (Math.abs(acc) >= st) { const d = Math.sign(acc); acc -= d * this.step; onStep(d); }
    });
    const end = e => { if (e.pointerId === id) id = null; };
    this.shell.addEventListener('pointerup', end); this.shell.addEventListener('pointercancel', end);
  }
}

/* =========================================================
   LOBBY
   ========================================================= */
const LEVELS = [['A1', 'Starter', -100], ['A2', 'Elementary', -45], ['B1', 'Intermediate', 0], ['B2', 'Upper-Int.', 55], ['C1', 'Advanced', 140]];
const settings = { level: store.get('level', 'A1'), bestOf: store.get('bestOf', 3) };
const levelRow = $('#levelRow');
LEVELS.forEach(([id, name, hue]) => {
  const b = document.createElement('button'); b.className = 'lvl'; b.dataset.level = id;
  b.innerHTML = `<div class="bdg" style="filter:hue-rotate(${hue}deg)"><b>${id}</b></div><small>${name}</small>`;
  levelRow.appendChild(b);
});
function refreshLobby() {
  $$('.lvl').forEach(b => b.classList.toggle('on', b.dataset.level === settings.level));
  $$('#boRow .pill').forEach(b => b.classList.toggle('on', +b.dataset.bo === settings.bestOf));
}
refreshLobby();
function tap(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); el.classList.add('press'); fn(e); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('press')));
}
$$('.lvl').forEach(b => tap(b, () => { settings.level = b.dataset.level; store.set('level', settings.level); refreshLobby(); sfx.ui(); }));
$$('#boRow .pill').forEach(b => tap(b, () => { settings.bestOf = +b.dataset.bo; store.set('bestOf', settings.bestOf); refreshLobby(); sfx.ui(); }));
tap($('#playBtn'), () => { sfx.go(); setTimeout(startMatch, 250); });
tap($('#sndBtn'), () => { setMuted(!muted); sfx.ui(); });
tap($('#fsBtn'), () => { sfx.ui(); try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {} });
setMuted(muted);

const lobbySnails = [];
function buildLobbySnail(host, team, name) {
  const s = new Snail(host, team, { autoSpin: team === 'mocha' ? 18 : -18 });
  const n = document.createElement('div'); n.className = 'lobbyName'; n.innerHTML = `<span>${name}</span>`; host.appendChild(n);
  s.shell.style.pointerEvents = 'auto'; s.body.style.pointerEvents = 'auto';
  const poke = () => { initAudio(); sfx.hop(); voice(team, pick(['giggle', 'yay', 'giggle'])); s.anim('hop', 600); s.say(pick(['celebrate', 'surprised', 'smug', 'happy']), 900); };
  host.addEventListener('pointerdown', e => { e.preventDefault(); poke(); });
  lobbySnails.push(s); return s;
}
buildLobbySnail($('#lobbyMocha'), 'mocha', 'Team Mocha');
buildLobbySnail($('#lobbyMochi'), 'mochi', 'Team Mochi');
setInterval(() => { if (screen !== 'lobby') return; const s = pick(lobbySnails); s.say(pick(['relief', 'smug', 'surprised', 'sleepy', 'celebrate']), 1400); }, 2600);

/* splash */
tap($('#splash'), () => { initAudio(); sfx.go(); music('lobby'); show('lobby'); });

/* =========================================================
   GAME
   ========================================================= */
const TEAMS = ['mocha', 'mochi'];
const NAMES = { mocha: 'Team Mocha', mochi: 'Team Mochi' };
const snails = {
  mocha: new Snail($('#arenaMocha'), 'mocha', { exit: true }),
  mochi: new Snail($('#arenaMochi'), 'mochi', { exit: true })
};
const bars = { mocha: $('#barMocha'), mochi: $('#barMochi') };
const ctrls = { mocha: $('#ctrlMocha'), mochi: $('#ctrlMochi') };
const timerEl = $('#timer'), tnum = $('#tnum'), roundTag = $('#roundTag'), banner = $('#banner');

let M = null;          // match state
let R = null;          // round state
let paused = false;
const ROUND_TIME = 60;

function prepWords(sentence) {
  const punct = /[?!.]$/.test(sentence) ? sentence.slice(-1) : '.';
  const words = sentence.replace(/[?!.]$/, '').trim().split(/\s+/);
  const display = words.map((w, i) => (i === 0 && !PROPER_WORDS.includes(w)) ? w.charAt(0).toLowerCase() + w.slice(1) : w);
  return { words, display, punct };
}
function scramble(display) {
  const n = display.length; let best = null, bestScore = 1e9;
  for (let t = 0; t < 30; t++) {
    const s = shuffle(display.map((w, i) => ({ w, i })));
    let score = 0;
    for (let k = 0; k < n; k++) { const a = s[k].i, b = s[(k + 1) % n].i; if (b === a + 1 || a === b + 1) score++; }
    if (score < bestScore) { best = s; bestScore = score; }
    if (score === 0) break;
  }
  return best.map(o => o.w);
}

function startMatch() {
  const pool = shuffle(SENTENCES[settings.level]);
  M = { level: settings.level, bestOf: settings.bestOf, need: Math.ceil(settings.bestOf / 2), wins: { mocha: 0, mochi: 0 }, round: 0, pool, poolIdx: 0, rounds: [],
    stats: { mocha: { correct: 0, wrong: 0, times: [] }, mochi: { correct: 0, wrong: 0, times: [] } } };
  TEAMS.forEach(t => { $('.pips', bars[t]).innerHTML = Array.from({ length: M.need }, () => `<img src="${IMG('star')}" alt="">`).join(''); });
  rainbow.classList.remove('on');
  show('game');
  music('game');
  nextRound();
}

function nextRound() {
  M.round++;
  if (M.poolIdx >= M.pool.length) { M.pool = shuffle(M.pool); M.poolIdx = 0; }
  const [focus, s1, s2] = M.pool[M.poolIdx++];
  const swap = Math.random() < .5;
  R = { focus, active: false, over: false, time: ROUND_TIME, lastSec: ROUND_TIME, startAt: 0, teams: {} };
  TEAMS.forEach((t, i) => {
    const sent = (i === 0) !== swap ? s1 : s2;
    const p = prepWords(sent);
    R.teams[t] = { sentence: sent, ...p, step: 0, wrong: 0, done: false, finishTime: null, lastInput: 0, cool: 0 };
    const chips = $('.chips', bars[t]); chips.innerHTML = '';
    p.words.forEach(() => { const c = document.createElement('span'); c.className = 'chip blank'; c.textContent = ''; chips.appendChild(c); });
    const pu = document.createElement('span'); pu.className = 'punct'; pu.textContent = p.punct; chips.appendChild(pu);
    bars[t].classList.remove('done');
    const s = snails[t]; s.stopAnims(); s.ovr = null; s.base = 'happy';
    s.setWords(scramble(p.display));
  });
  M.rounds.push({ focus, mocha: R.teams.mocha, mochi: R.teams.mochi, winner: null });
  roundTag.textContent = `ROUND ${M.round}`;
  timerEl.classList.remove('hurry'); tnum.textContent = ROUND_TIME;
  mGame.playbackRate = 1;
  lockControls(true);
  rainbow.classList.remove('on');
  // banner sequence
  const seq = [[`Round ${M.round}<small>${cap(focus)}</small>`, 1500, null], ['3', 650, 'count'], ['2', 650, 'count'], ['1', 650, 'count'], ['GO!', 600, 'go']];
  let i = 0;
  const run = () => {
    if (i >= seq.length) { hideBanner(); startPlay(); return; }
    const [txt, ms, snd] = seq[i++];
    showBanner(txt); if (snd) sfx[snd]();
    setTimeout(run, ms);
  };
  setTimeout(run, 350);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function showBanner(html) { banner.innerHTML = html; banner.className = 'felt-text'; void banner.offsetWidth; banner.classList.add('on'); }
function hideBanner() { banner.classList.remove('on'); banner.classList.add('off'); }
function lockControls(v) { TEAMS.forEach(t => ctrls[t].classList.toggle('locked', v)); }
function startPlay() {
  R.active = true; R.startAt = performance.now();
  TEAMS.forEach(t => R.teams[t].lastInput = R.startAt);
  lockControls(false);
}

function canPlay(t) { return R && R.active && !R.over && !paused && !R.teams[t].done; }
function doSpin(t, dir) {
  if (!canPlay(t)) return;
  snails[t].rotate(dir); sfx.spin(t); R.teams[t].lastInput = performance.now();
}
function doGo(t) {
  if (!canPlay(t)) return;
  const T = R.teams[t], s = snails[t], now = performance.now();
  if (now < T.cool) return;
  T.cool = now + 260; T.lastInput = now;
  const it = s.selected(); if (!it) return;
  const expected = T.display[T.step];
  if (it.text === expected) {
    const idx = T.step++;
    M.stats[t].correct++;
    const last = T.step === T.words.length;
    if (last) { T.done = true; T.finishTime = (now - R.startAt) / 1000; R.over = true; R.active = false; lockControls(true); }
    s.say('strain', 300); s.anim('strain', 320); sfx.strain(); voice(t, 'strain', 0.75);
    const removed = s.removeSelected();
    const chip = $$('.chip', bars[t])[idx];
    const word = idx === 0 ? T.words[0] : T.words[idx];
    setTimeout(() => {
      s.say('relief', 450); sfx.plop(); sfx.whoosh(); if (!last) voice(t, Math.random() < .55 ? 'relief' : 'yay');
      const from = s.local(s.tail); puffs(from.x, from.y, 5);
      const to = centerOf(chip);
      flyPoop(from, to, word, last, () => {
        chip.textContent = word; chip.classList.remove('blank'); chip.classList.add('pop');
        const c = centerOf(chip); sparks(c.x, c.y, last ? 14 : 6, last ? 40 : 30);
        if (last) { sfx.gold(); bars[t].classList.add('done'); endRound(t); } else sfx.land();
      });
    }, 230);
  } else {
    T.wrong++; M.stats[t].wrong++;
    const el = it.el; el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 450);
    s.say('surprised', 260); setTimeout(() => { if (R && !R.over) s.say(pick(['confused', 'confused', 'nervous']), 700); }, 260);
    s.anim('shake', 420); sfx.wrong(); voice(t, 'huh');
  }
}

function endRound(winner) {
  if (R.ended) return; R.ended = true;
  R.over = true; R.active = false; lockControls(true);
  if (!winner) {   // time up
    const a = R.teams.mocha.step, b = R.teams.mochi.step;
    winner = a > b ? 'mocha' : b > a ? 'mochi' : null;
    sfx.alarm();
  }
  M.rounds[M.rounds.length - 1].winner = winner;
  TEAMS.forEach(t => { const T = R.teams[t]; if (T.done) M.stats[t].times.push(T.finishTime); revealRest(t); });
  mGame.playbackRate = 1;
  setTimeout(() => {
    if (winner) {
      const loser = winner === 'mocha' ? 'mochi' : 'mocha';
      M.wins[winner]++;
      const pip = $$('.pips img', bars[winner])[M.wins[winner] - 1]; if (pip) pip.classList.add('won');
      snails[winner].say('celebrate', 3200); snails[winner].anim('party', 3000);
      snails[loser].say('cry', 2200); setTimeout(() => snails[loser].say('relief', 1000), 2200);
      voice(winner, 'woohoo'); setTimeout(() => voice(loser, 'cry', 0.7), 700);
      rainbow.classList.add('on');
      const c = snails[winner].local({ x: 380, y: 200 }); confetti(40, c.x - 400, c.x + 400);
      sfx.win();
      showBanner(`${NAMES[winner]}<small>wins the round!</small>`);
    } else {
      TEAMS.forEach(t => snails[t].say('confused', 2400));
      sfx.draw();
      showBanner(`It's a draw!<small>No point this time</small>`);
    }
    const matchOver = winner && M.wins[winner] >= M.need;
    setTimeout(() => {
      hideBanner();
      if (matchOver) setTimeout(() => endMatch(winner), 300);
      else setTimeout(nextRound, 450);
    }, 3300);
  }, 650);
}
function revealRest(t) {
  const T = R.teams[t], chips = $$('.chip', bars[t]);
  chips.forEach((c, i) => { if (i >= T.step) { c.textContent = T.words[i]; c.classList.remove('blank'); c.style.opacity = .45; } });
  snails[t].revealAll();
}

/* main loop */
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (R && R.active && !paused) {
    R.time -= dt;
    const sec = Math.max(0, Math.ceil(R.time));
    if (sec !== R.lastSec) {
      R.lastSec = sec; tnum.textContent = sec;
      if (sec <= 10 && sec > 0) { timerEl.classList.add('hurry'); timerEl.classList.remove('tick'); void timerEl.offsetWidth; timerEl.classList.add('tick'); sfx.clock(); mGame.playbackRate = 1.12; }
    }
    if (R.time <= 0) { tnum.textContent = 0; endRound(null); }
    // base faces
    const a = R.teams.mocha.step, b = R.teams.mochi.step;
    TEAMS.forEach(t => {
      const T = R.teams[t], s = snails[t], mine = T.step, other = t === 'mocha' ? b : a;
      let f = 'happy';
      if (now - T.lastInput > 8000) f = 'sleepy';
      else if (R.time <= 5) f = mine >= other ? 'nervous' : 'scared';
      else if (R.time <= 10) f = 'nervous';
      else if (mine - other >= 2) f = 'smug';
      else if (other - mine >= 3) f = 'nervous';
      if (f === 'sleepy' && s.base !== 'sleepy') voice(t, 'snore', 0.6);
      s.base = f;
    });
  } else if (R && !R.active) TEAMS.forEach(t => snails[t].base = 'happy');
  if (screen === 'game') TEAMS.forEach(t => snails[t].frame(dt, now));
  if (screen === 'lobby') lobbySnails.forEach(s => s.frame(dt, now));
  if (screen === 'end') endSnails.forEach(s => s.frame(dt, now));
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* controls: multi-touch friendly (each button tracks its own finger) */
TEAMS.forEach(t => {
  $$('.spin', ctrls[t]).forEach(b => {
    const dir = +b.dataset.dir; let rep = null, hold = null;
    const stop = () => { clearTimeout(hold); clearInterval(rep); b.classList.remove('press'); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); b.setPointerCapture(e.pointerId); b.classList.add('press'); doSpin(t, dir); hold = setTimeout(() => { rep = setInterval(() => doSpin(t, dir), 170); }, 380); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, stop));
  });
  const g = $('.goBtn', ctrls[t]);
  g.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); g.classList.add('press'); doGo(t); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => g.addEventListener(ev, () => g.classList.remove('press')));
  snails[t].enableDrag(d => doSpin(t, d));
});
/* keyboard (handy for testing on the PC): Mocha A / D + S   ·   Mochi ← / → + ↓ */
const KEYS = { KeyA: ['mocha', -1], KeyD: ['mocha', 1], KeyS: ['mocha', 0], KeyW: ['mocha', 0], ArrowLeft: ['mochi', -1], ArrowRight: ['mochi', 1], ArrowDown: ['mochi', 0], ArrowUp: ['mochi', 0] };
addEventListener('keydown', e => {
  if (e.code === 'Escape' && screen === 'game') { togglePause(); return; }
  const k = KEYS[e.code]; if (!k || screen !== 'game') return;
  e.preventDefault(); initAudio();
  const [t, d] = k; if (d) doSpin(t, d); else if (!e.repeat) doGo(t);
});
/* pause */
function togglePause(v = !paused) {
  if (screen !== 'game') return;
  paused = v; $('#pauseMenu').classList.toggle('show', v);
  if (currentMusic && !muted) { if (v) currentMusic.pause(); else currentMusic.play().catch(() => {}); }
}
tap($('#pauseBtn'), () => { sfx.ui(); togglePause(true); });
tap($('#resumeBtn'), () => { sfx.ui(); togglePause(false); });
tap($('#quitBtn'), () => { sfx.ui(); togglePause(false); if (R) { R.active = false; R.over = true; R.ended = true; } hideBanner(); TEAMS.forEach(t => snails[t].clearWords()); music('lobby'); show('lobby'); });

/* =========================================================
   END SCREEN + FEEDBACK
   ========================================================= */
const endSnails = [];
function endMatch(winner) {
  const loser = winner === 'mocha' ? 'mochi' : 'mocha';
  TEAMS.forEach(t => snails[t].clearWords());
  show('end'); music(null); sfx.fanfare();
  setTimeout(() => { if (screen === 'end') music('lobby'); }, 2600);
  rainbow.classList.add('on');
  $('#endTitle').textContent = `${NAMES[winner]} wins!`;
  $('#endScore').textContent = `${M.wins.mocha}  –  ${M.wins.mochi}`;
  // snails on the podium
  $('#endWinner').innerHTML = ''; $('#endOther').innerHTML = ''; endSnails.length = 0;
  const w = new Snail($('#endWinner'), winner, {}), o = new Snail($('#endOther'), loser, {});
  w.base = 'celebrate'; w.anim('party'); o.base = 'happy';
  setTimeout(() => { voice(winner, 'woohoo'); setTimeout(() => voice(loser, 'giggle'), 900); }, 400);
  endSnails.push(w, o);
  $('#endWinner').style.left = winner === 'mocha' ? '-30px' : '370px';
  $('#endOther').style.left = winner === 'mocha' ? '370px' : '-30px';
  $('#endOther').style.zIndex = 0; $('#endWinner').style.zIndex = 1;
  TEAMS.forEach(t => $('#fb' + cap(t)).innerHTML = feedbackHTML(t));
  $('#review').innerHTML = '<div class="rh">Sentence review</div>' + M.rounds.map((r, i) =>
    `<div class="rm">${i + 1}. ${esc(r.mocha.sentence)}</div><div class="ri">${i + 1}. ${esc(r.mochi.sentence)}</div>`).join('');
  confetti(90);
  let n = 0; const iv = setInterval(() => { if (screen !== 'end' || ++n > 3) { clearInterval(iv); return; } confetti(45); }, 2600);
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function feedbackHTML(t) {
  const st = M.stats[t], total = st.correct + st.wrong;
  const acc = total ? Math.round(st.correct / total * 100) : 0;
  const best = st.times.length ? Math.min(...st.times) : null;
  const stars = acc >= 80 ? 3 : acc >= 60 ? 2 : 1;
  const good = [], work = [];
  M.rounds.forEach(r => {
    const T = r[t];
    if (T.done && T.wrong <= 1) good.push(r.focus);
    else if (!T.done || T.wrong >= 3) work.push(r.focus);
  });
  const uniq = a => [...new Set(a)];
  let praise;
  if (acc >= 90 && best && best < 25) praise = 'Fast AND accurate — superstars!';
  else if (acc >= 80) praise = 'Super accurate word order!';
  else if (best && best < 20) praise = 'Lightning-fast fingers!';
  else if (st.correct >= 15) praise = 'Great teamwork and effort!';
  else praise = 'Nice try — keep building sentences!';
  return `<h3 style="color:${t === 'mocha' ? '#7b4a22' : '#d0631f'}">${NAMES[t]}</h3>
    <div class="stars">${[0, 1, 2].map(i => `<img src="${IMG('star')}" class="${i < stars ? '' : 'dim'}" alt="">`).join('')}</div>
    <div class="stat"><span>Rounds won</span><b>${M.wins[t]}</b></div>
    <div class="stat"><span>Words placed</span><b>${st.correct}</b></div>
    <div class="stat"><span>Accuracy</span><b>${acc}%</b></div>
    <div class="stat"><span>Fastest sentence</span><b>${best ? best.toFixed(1) + ' s' : '—'}</b></div>
    <div class="praise">${praise}</div>
    <div class="lst">${uniq(good).length ? `<div class="good"><b>Strong at:</b>${uniq(good).slice(0, 3).map(cap).join(', ')}</div>` : ''}
    ${uniq(work).length ? `<div class="work"><b>Keep practising:</b>${uniq(work).slice(0, 3).map(cap).join(', ')}</div>` : ''}</div>`;
}
tap($('#rematchBtn'), () => { sfx.go(); setTimeout(startMatch, 250); });
tap($('#menuBtn'), () => { sfx.ui(); rainbow.classList.remove('on'); show('lobby'); music('lobby'); });

/* debug hook for automated testing */
window.__gsg = { snails, get R() { return R; }, get M() { return M; }, doGo, doSpin, startMatch, settings, endRound, show };
})();
