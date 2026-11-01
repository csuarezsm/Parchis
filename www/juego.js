/* Parchís — tablero, partidas contra la máquina, entre amigos y en línea (IT Canarias)
   © 2026 IT Canarias. Todos los derechos reservados. */
'use strict';
const P = window.Parchis;
const COL = [
  { n: 'Amarillo', h: '#f2c230', l: '#fbe9a6', d: '#a77d00' },
  { n: 'Azul',     h: '#2f7fe0', l: '#bcd7f7', d: '#17508f' },
  { n: 'Rojo',     h: '#e23b3b', l: '#f7c0c0', d: '#962020' },
  { n: 'Verde',    h: '#2aa65a', l: '#b8e6c8', d: '#156b39' }
];
const LEVELS = { 1: { name: 'Fácil', desc: 'Mueve casi al azar. Para jugar con calma o con los peques.' },
  2: { name: 'Normal', desc: 'Come cuando puede y protege sus fichas.' },
  3: { name: 'Difícil', desc: 'Hace barreras, calcula el peligro y no regala nada.' } };
const levelLabel = l => '🤖 ' + (LEVELS[l] ? LEVELS[l].name : 'Máquina');
const SPEEDS = { normal: { roll: 650, move: 650, step: 115 }, rapida: { roll: 320, move: 330, step: 60 } };
const speed = () => SPEEDS[S.speed] || SPEEDS.normal;
// Servidor de juegos en línea (repo csuarezsm/juegos-servidor). Vacío = la opción «En línea» no aparece.
const ONLINE_URL = 'PARCHIS_ONLINE_URL' in window ? window.PARCHIS_ONLINE_URL : 'wss://juegos.itcanarias.com/ws';
const PLACEHOLDER = /^(tú|tu|jugador \d)$/i;
const isPlaceholder = n => PLACEHOLDER.test(String(n || '').trim());
const BOARDS = {
  clasico: { name: 'Clásico', bg: '#f6f0e1', cell: '#fffdf7', safe: '#e2dac6', line: '#b9ad93' },
  blanco:  { name: 'Blanco',  bg: '#ffffff', cell: '#ffffff', safe: '#e6e6e6', line: '#a9a9a9' },
  madera:  { name: 'Madera',  bg: '#d9b98a', cell: '#f5e6cc', safe: '#e2c9a0', line: '#9a7a4e' },
  oscuro:  { name: 'Oscuro',  bg: '#2a2d33', cell: '#3a3e46', safe: '#4c515b', line: '#666c78' }
};
const board = () => BOARDS[S.board] || BOARDS.clasico;

/* ================= Sonidos (sintetizados: sin archivos de audio) ================= */
const Sound = (() => {
  let ctx = null;
  const ac = () => {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  function knock(c, t, freq, vol, dur) {
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
  }
  function tone(c, t, freq, dur, vol, type) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function play(kind) {
    if (S.sound === false) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + 0.01;
    try {
      if (kind === 'dice') { for (let k = 0; k < 4; k++) knock(c, t + k * 0.07, 2200 - k * 250, 0.5, 0.04); }
      else if (kind === 'step') knock(c, t, 1600, 0.45, 0.035);
      else if (kind === 'move') knock(c, t, 1400, 0.9, 0.06);
      else if (kind === 'capture') { knock(c, t, 800, 1.2, 0.1); tone(c, t + 0.05, 330, 0.22, 0.12, 'square'); }
      else if (kind === 'home') { [784, 1047].forEach((f, i) => tone(c, t + i * 0.1, f, 0.3, 0.12, 'triangle')); }
      else if (kind === 'six') tone(c, t, 988, 0.18, 0.08, 'sine');
      else if (kind === 'end') { [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, 0.5, 0.13, 'triangle')); }
      else if (kind === 'bad') tone(c, t, 180, 0.3, 0.14, 'square');
    } catch (e) {}
  }
  return { play };
})();

/* ================= Geometría del tablero (100×100) =================
   Tablero en cruz: cuatro casas en las esquinas y cuatro brazos de 3 carriles × 8 casillas.
   Se calcula el brazo de abajo (amarillo) y el resto se obtiene girando 90° (sentido contrario a las agujas). */
const YARD = 37, ARM = 100 - 2 * YARD, CW = ARM / 3, CL = YARD / 8;
function rot(p, q) {
  let x = p.x, y = p.y, ax = p.ax || 0, ay = p.ay || 0, hx = p.hx || 0, hy = p.hy || 0;
  for (let k = 0; k < ((q % 4) + 4) % 4; k++) { const dx = x - 50, dy = y - 50; x = 50 + dy; y = 50 - dx; [ax, ay] = [ay, -ax]; [hx, hy] = [hy, hx]; }
  return { x, y, ax, ay, hx, hy };
}
// Casilla k (0–16) del primer tramo: columna derecha del brazo de abajo (subiendo), fila de abajo del brazo derecho (saliendo) y la punta
function seg0(k) {
  if (k < 8) return { x: 50 + CW, y: 100 - CL * (k + 0.5), ax: 1, ay: 0, hx: CW / 2, hy: CL / 2 };
  if (k < 16) return { x: 100 - YARD + CL * (k - 8 + 0.5), y: 50 + CW, ax: 0, ay: 1, hx: CL / 2, hy: CW / 2 };
  return { x: 100 - CL / 2, y: 50, ax: 0, ay: 1, hx: CL / 2, hy: CW / 2 };
}
const trackCell = sq => rot(seg0((sq - 1) % 17), Math.floor((sq - 1) / 17));
const corridorCell = (c, r) => rot({ x: 50, y: 100 - CL * (r - 63 + 0.5), ax: 1, ay: 0, hx: CW / 2, hy: CL / 2 }, c);
const HOME_OFF = [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]];
const homeSpot = (c, i) => rot({ x: 100 - YARD / 2 + HOME_OFF[i][0], y: 100 - YARD / 2 + HOME_OFF[i][1] }, c);
const metaSpot = (c, k) => rot({ x: 50 + (k - 1.5) * 4.3, y: 58.2 }, c);
const yardCenter = c => rot({ x: 100 - YARD / 2, y: 100 - YARD / 2 }, c);
// Punto de una ficha según su posición relativa (sin desplazar si comparte casilla)
function spot(c, r, i, k) {
  if (r === P.CASA) return homeSpot(c, i);
  if (r === P.META) return metaSpot(c, k == null ? i : k);
  if (r >= P.PASILLO) return corridorCell(c, r);
  return trackCell(P.casilla(c, r));
}
const PR = 2.3;    // radio de las fichas

/* ================= Vista común (partida local o en línea) =================
   vm = { colores, fichas, turno, fase, dado, valor, premio, ultimo, n, ganador, orden, stats,
          names: {c: nombre}, ai: {c: bool}, orient (color abajo a la derecha), movs: [{i, a}] (si me toca mover) } */
function piecePositions(vm) {
  const out = [], bySq = {};
  for (const c of vm.colores) {
    let m = 0;
    vm.fichas[c].forEach((r, i) => {
      const o = { c, i, r, k: r === P.META ? m++ : null };
      if (r !== P.CASA && r !== P.META) { const key = r >= P.PASILLO ? 'p' + c + '-' + r : 's' + P.casilla(c, r); (bySq[key] = bySq[key] || []).push(o); }
      out.push(o);
    });
  }
  out.forEach(o => {
    const s = spot(o.c, o.r, o.i, o.k);
    let x = s.x, y = s.y;
    const key = o.r === P.CASA || o.r === P.META ? null : o.r >= P.PASILLO ? 'p' + o.c + '-' + o.r : 's' + P.casilla(o.c, o.r);
    if (key && bySq[key].length > 1) { const j = bySq[key].indexOf(o); const d = (j === 0 ? -1 : 1) * Math.min(2.3, (s.hx > s.hy ? s.hx : s.hy) * 0.5); x += s.ax * d; y += s.ay * d; }
    o.x = x; o.y = y;
  });
  return out;
}
function boardSvg(vm) {
  const B = board(), q = (4 - (vm.orient || 0)) % 4;
  const V = p => rot(p, q);                         // giro de la vista
  const rect = (p, fill, extra) => { const v = V(p); return `<rect x="${(v.x - v.hx).toFixed(2)}" y="${(v.y - v.hy).toFixed(2)}" width="${(2 * v.hx).toFixed(2)}" height="${(2 * v.hy).toFixed(2)}" fill="${fill}" stroke="${B.line}" stroke-width=".25"${extra || ''}/>`; };
  const active = c => vm.colores.includes(c);
  let s = `<rect x="0" y="0" width="100" height="100" rx="2.5" fill="${B.bg}"/>`;
  // casas
  for (let c = 0; c < 4; c++) {
    const a = V(rot({ x: 100 - YARD / 2, y: 100 - YARD / 2, hx: YARD / 2 - 1.2, hy: YARD / 2 - 1.2 }, c));
    s += `<rect x="${a.x - a.hx}" y="${a.y - a.hy}" width="${2 * a.hx}" height="${2 * a.hy}" rx="3" fill="${COL[c].h}" opacity="${active(c) ? 1 : 0.35}"/>`;
    s += `<circle cx="${a.x}" cy="${a.y}" r="12.8" fill="#fff" opacity="${active(c) ? 0.82 : 0.5}"/>`;
  }
  // recorrido
  for (let sq = 1; sq <= 68; sq++) {
    const p = trackCell(sq), ex = P.SALIDA.indexOf(sq);
    s += rect(p, ex >= 0 ? COL[ex].l : P.esSeguro(sq) ? B.safe : B.cell);
    if (P.esSeguro(sq)) { const v = V(p); s += `<circle cx="${v.x.toFixed(2)}" cy="${v.y.toFixed(2)}" r="1.25" fill="none" stroke="${ex >= 0 ? COL[ex].d : B.line}" stroke-width=".35"/>`; }
  }
  // pasillos y meta
  for (let c = 0; c < 4; c++) for (let r = P.PASILLO; r < P.META; r++) s += rect(corridorCell(c, r), COL[c].l);
  for (let c = 0; c < 4; c++) {
    const pts = [[YARD, 100 - YARD], [100 - YARD, 100 - YARD], [50, 50]].map(([x, y]) => V(rot({ x, y }, c)));
    s += `<polygon points="${pts.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ')}" fill="${COL[c].h}" stroke="${B.line}" stroke-width=".25" opacity="${active(c) ? 1 : 0.4}"/>`;
  }
  // nombres en cada casa
  for (const c of vm.colores) {
    const a = V(yardCenter(c)), nm = vm.names[c] || COL[c].n;
    s += `<text x="${a.x}" y="${a.y - 14.6}" text-anchor="middle" font-size="3.4" font-weight="700" fill="#fff" stroke="${COL[c].d}" stroke-width=".7" paint-order="stroke">${esc(nm.length > 16 ? nm.slice(0, 15) + '…' : nm)}</text>`;
  }
  // destinos posibles
  const movs = vm.movs || [];
  if (movs.length > 1) {
    const c = vm.turno, seen = new Set();
    movs.forEach(m => {
      const key = m.a; if (seen.has(key)) return; seen.add(key);
      const d = V(spot(c, m.a, m.i, Math.min(3, vm.fichas[c].filter(r => r === P.META).length)));
      s += `<circle class="dest" cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="1.6" fill="${COL[c].d}" opacity=".55"/>`;
    });
  }
  // fichas
  const mv = new Set(movs.map(m => m.i));
  s += piecePositions(vm).map(o => {
    const v = V(o), can = o.c === vm.turno && mv.has(o.i);
    return `<g class="pz${can ? ' can' : ''}" data-c="${o.c}" data-i="${o.i}" style="transform:translate(${v.x.toFixed(2)}px,${v.y.toFixed(2)}px)">
      ${can ? `<circle class="ring" r="${PR + 1.15}" fill="none" stroke="#1b1b1b" stroke-width=".75"/><circle class="ring" r="${PR + 0.55}" fill="none" stroke="#fff" stroke-width=".45"/>` : ''}
      <circle r="${PR}" fill="${COL[o.c].h}" stroke="${COL[o.c].d}" stroke-width=".55"/><circle r="${PR * 0.45}" fill="#fff" opacity=".38"/></g>`;
  }).join('');
  return `<svg viewBox="-0.5 -0.5 101 101" class="pboard" xmlns="http://www.w3.org/2000/svg" aria-label="Tablero de parchís">${s}</svg>`;
}
// Punto de la vista para una posición (para animar)
const viewSpot = (vm, c, r, i, k) => rot(spot(c, r, i, k), (4 - (vm.orient || 0)) % 4);

/* ---------- Dado ---------- */
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const diceFace = d => `<span class="pips">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<i class="${d && PIPS[d].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;
function rollAnim(ms) {
  const el = $('#dice'); if (!el) return;
  el.classList.add('rolling'); Sound.play('dice');
  const t0 = Date.now();
  const f = () => { if (!el.isConnected) return; el.innerHTML = diceFace(1 + Math.floor(Math.random() * 6)); if (Date.now() - t0 < ms - 60) setTimeout(f, 70); };
  f();
}
function fairDie() { try { const a = new Uint32Array(1); for (;;) { crypto.getRandomValues(a); if (a[0] < 4294967292) return 1 + (a[0] % 6); } } catch (e) { return 1 + Math.floor(Math.random() * 6); } }

/* ---------- Animación de la última jugada ---------- */
let ANIM_KEY = null;
const evKey = vm => { const u = vm.ultimo; return u ? [vm.n, u.tipo, u.c, u.i, u.de, u.a, u.d].join(':') : String(vm.n || 0); };
// Devuelve cuánto dura la animación (ms)
function animateLast(vm) {
  const key = evKey(vm);
  if (ANIM_KEY === key) return 0;
  const first = ANIM_KEY === null; ANIM_KEY = key;
  const u = vm.ultimo;
  if (first || !u) return 0;
  if (u.tipo === 'tira') { if (u.d === 6) Sound.play('six'); return 0; }
  if (u.tipo === 'tres6') { Sound.play('bad'); vibrate([40, 60, 40]); return 0; }
  if (u.tipo !== 'mueve') return 0;
  const el = document.querySelector(`.pz[data-c="${u.c}"][data-i="${u.i}"]`);
  if (!el) return 0;
  const st = speed().step, fin = el.style.transform;
  const path = [];
  if (u.sale || u.de === P.CASA) path.push(viewSpot(vm, u.c, P.CASA, u.i));
  else for (let r = u.de; r < u.a; r++) path.push(viewSpot(vm, u.c, r, u.i));
  const tr = p => `translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px)`;
  el.style.transition = 'none'; el.style.transform = tr(path[0]); el.getBoundingClientRect();
  el.classList.add('moving');
  const steps = path.slice(1).map(tr).concat([fin]);
  steps.forEach((t, k) => setTimeout(() => { el.style.transition = `transform ${st}ms linear`; el.style.transform = t; if (k < steps.length - 1) Sound.play('step'); }, (k + 1) * st));
  const dur = (steps.length + 1) * st;
  setTimeout(() => { el.classList.remove('moving'); Sound.play(u.come ? 'capture' : u.meta ? 'home' : 'move'); if (u.come || u.meta) vibrate(u.come ? 60 : 30); }, dur - st);
  if (u.come) {
    const v = document.querySelector(`.pz[data-c="${u.come.c}"][data-i="${u.come.i}"]`);
    if (v) {
      const home = v.style.transform, at = rot(trackCell(P.casilla(u.c, u.a)), (4 - (vm.orient || 0)) % 4);
      v.style.transition = 'none'; v.style.transform = tr(at); v.getBoundingClientRect();
      setTimeout(() => { v.style.transition = 'transform 380ms ease-in'; v.style.transform = home; }, dur);
      return dur + 400;
    }
  }
  return dur;
}

/* ---------- Textos ---------- */
const cname = (vm, c) => vm.names[c] || COL[c].n;
const dot = c => `<i class="cdot" style="background:${COL[c].h}"></i>`;
function describe(vm, u) {
  if (!u) return '';
  const n = cname(vm, u.c), you = vm.you === u.c;
  if (u.tipo === 'tira') {
    const t = u.v === 7 ? (you ? 'Sacas un 6: cuenta 7' : `${n} saca un 6: cuenta 7`) : (you ? `Sacas un ${u.d}` : `${n} saca un ${u.d}`);
    return t + (u.nada ? (you ? ' y no puedes mover.' : ' y no puede mover.') : '.');
  }
  if (u.tipo === 'tres6') return u.i != null ? (you ? '¡Tres seises! Tu última ficha vuelve a casa.' : `¡Tres seises! La última ficha de ${n} vuelve a casa.`) : (you ? '¡Tres seises! Pierdes el turno.' : `¡Tres seises! ${n} pierde el turno.`);
  if (u.tipo === 'mueve') {
    if (u.gana) return you ? '🏆 Metes tu última ficha y ganas la partida.' : `🏆 ${n} mete su última ficha y gana la partida.`;
    if (u.come) return you ? `Te comes una ficha de ${cname(vm, u.come.c)}: cuentas 20.` : vm.you === u.come.c ? `${n} se come una ficha tuya: cuenta 20.` : `${n} se come una ficha de ${cname(vm, u.come.c)}: cuenta 20.`;
    if (u.meta) return you ? 'Metes una ficha en la meta: cuentas 10.' : `${n} mete una ficha en la meta: cuenta 10.`;
    if (u.sale) return you ? 'Sacas una ficha de casa.' : `${n} saca una ficha de casa.`;
    return u.premio ? (you ? `Avanzas ${u.v} de premio.` : `${n} avanza ${u.v} de premio.`) : (you ? `Mueves ${u.v}.` : `${n} mueve ${u.v}.`);
  }
  return '';
}
function playerChips(vm, seatsOnline) {
  return `<div class="pchips">${vm.colores.map(c => {
    const meta = vm.fichas[c].filter(r => r === P.META).length, casa = vm.fichas[c].filter(r => r === P.CASA).length;
    const off = seatsOnline && seatsOnline[c] && seatsOnline[c].conectado === false;
    return `<div class="pchip${vm.turno === c && vm.fase !== 'fin' ? ' turn' : ''}" style="--pc:${COL[c].h}">
      ${dot(c)}<b>${off ? '📵 ' : ''}${esc(cname(vm, c))}</b><small>🏁 ${meta}/4${casa ? ' · 🏠 ' + casa : ''}</small></div>`;
  }).join('')}</div>`;
}
function resultsHtml(vm) {
  const st = vm.stats || { comidas: [], comido: [], metas: [], seises: [] };
  return vm.orden.map((c, k) => `<div class="hrow"><div class="top">${k === 0 ? '<span style="font-size:calc(22px * var(--fs, 1))">🏆</span>' : `<span class="mut" style="width:26px;text-align:center;font-weight:800">${k + 1}º</span>`}
    <div class="n">${dot(c)} ${esc(cname(vm, c))}<small class="wrap">${esc(`🏁 ${vm.fichas[c].filter(r => r === P.META).length}/4 en la meta · 🍽 ${st.comidas[c] === 1 ? '1 comida' : (st.comidas[c] || 0) + ' comidas'} · comido ${st.comido[c] || 0} · 🎲 ${st.seises[c] || 0} seises`)}</small></div></div></div>`).join('');
}

/* ================= Pantalla de inicio ================= */
function modeTabs() {
  const ms = [['ai', '🤖 Máquina'], ['local', '👥 Amigos']].concat(ONLINE_URL ? [['online', '🌐 En línea']] : []);
  return `<div class="kinds modes">${ms.map(([k, l]) => `<button data-mode="${k}" class="${S.draft.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function bindModeTabs() { document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { syncDraft(); S.draft.mode = b.dataset.mode; render(); }); }
function rosterChips(cur, attr) {
  const list = rosterSorted().slice(0, 12);
  return list.length ? `<div class="chips">${list.map(n => `<button class="chipb ${nkey(n) === nkey(cur) ? 'on' : ''}" data-${attr}="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '';
}
const colorBtns = (cur, attr) => `<div class="kinds">${COL.map((k, c) => `<button data-${attr}="${c}" class="colbtn ${cur === c ? 'on' : ''}">${dot(c)}${k.n}</button>`).join('')}</div>`;
function levelBtns(cur, attr) {
  return `<div class="levels">${[1, 2, 3].map(l => `<button class="lvl ${cur === l ? 'on' : ''}" data-${attr}="${l}"><b>${l}</b><span>${LEVELS[l].name}<em>${LEVELS[l].desc}</em></span></button>`).join('')}</div>`;
}
function renderSetup() {
  $('#subtitle').textContent = '';
  if (S.draft.mode === 'online' && ONLINE_URL) return renderOnline();
  if (S.draft.mode === 'online') S.draft.mode = 'ai';
  const D = S.draft;
  let body = '';
  if (D.mode === 'ai') {
    const a = D.ai;
    body = `<div class="sec"><h2>Tu nombre</h2>
        <input type="text" id="aiName" maxlength="18" placeholder="Tú" value="${esc(a.name)}" style="width:100%">
        ${rosterChips(a.name, 'pick')}
        <h2 style="margin-top:6px">Tu color</h2>${colorBtns(a.color, 'col')}</div>
      <div class="sec"><h2>Rivales</h2><div class="kinds">${[1, 2, 3].map(n => `<button data-riv="${n}" class="${a.rivals === n ? 'on' : ''}">${n} rival${n > 1 ? 'es' : ''}</button>`).join('')}</div>
        <h2 style="margin-top:14px">Nivel de la máquina</h2>${levelBtns(a.level, 'lv')}</div>`;
  } else {
    const L = D.local;
    body = `<div class="sec"><h2>Jugadores</h2><div class="mut" style="margin-bottom:8px">Os vais pasando el móvil. Cada color puede ser una persona, la máquina o nadie.</div>
      ${L.seats.map((s, c) => `<div class="lseat">${dot(c)}<b class="cn">${COL[c].n}</b>
        <span class="kinds" style="margin:0;flex:none">${[['p', '👤'], ['m', '🤖'], ['x', '—']].map(([t, l]) => `<button data-st="${c}:${t}" class="${s.t === t ? 'on' : ''}" aria-label="${{ p: 'Persona', m: 'Máquina', x: 'Nadie' }[t]}">${l}</button>`).join('')}</span>
        ${s.t === 'p' ? `<input type="text" maxlength="18" data-nm="${c}" placeholder="Jugador ${c + 1}" value="${esc(s.name || '')}" list="rosterList">` : `<span class="mut lsx">${s.t === 'm' ? 'Máquina' : 'No juega'}</span>`}</div>`).join('')}
      <datalist id="rosterList">${rosterSorted().map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      ${L.seats.some(s => s.t === 'm') ? `<div class="sec"><h2>Nivel de la máquina</h2>${levelBtns(L.level, 'lv')}</div>` : ''}`;
  }
  const recent = S.archive.length ? `<div class="sec"><h2>Últimas partidas</h2>${archiveHtml(4)}<button class="btn-ghost" id="seeAll" style="width:100%;margin-top:4px">📊 Clasificación y todas las partidas</button></div>` : '';
  $('#app').innerHTML = modeTabs() + body + recent + `<button class="btn-gold fab" id="start">▶ Empezar partida</button>`;
  bindModeTabs();
  const on = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  if (D.mode === 'ai') {
    $('#aiName').onchange = () => { D.ai.name = cleanName($('#aiName').value); save(); };
    on('[data-pick]', b => b.onclick = () => { D.ai.name = b.dataset.pick; render(); });
    on('[data-col]', b => b.onclick = () => { syncDraft(); D.ai.color = +b.dataset.col; render(); });
    on('[data-riv]', b => b.onclick = () => { syncDraft(); D.ai.rivals = +b.dataset.riv; render(); });
    on('[data-lv]', b => b.onclick = () => { syncDraft(); D.ai.level = +b.dataset.lv; render(); });
  } else {
    on('[data-st]', b => b.onclick = () => { syncDraft(); const [c, t] = b.dataset.st.split(':'); D.local.seats[+c].t = t; render(); });
    on('[data-nm]', el => el.onchange = () => { D.local.seats[+el.dataset.nm].name = cleanName(el.value); save(); });
    on('[data-lv]', b => b.onclick = () => { syncDraft(); D.local.level = +b.dataset.lv; render(); });
  }
  const sa = $('#seeAll'); if (sa) sa.onclick = () => openArchive('ranking');
  document.querySelectorAll('#app [data-arch]').forEach(el => el.onclick = () => showArchived(+el.dataset.arch));
  $('#start').onclick = () => { syncDraft(); startFromDraft(); };
}
function syncDraft() {
  const D = S.draft;
  const n = $('#aiName'); if (n && D.mode === 'ai') D.ai.name = cleanName(n.value);
  document.querySelectorAll('[data-nm]').forEach(el => { D.local.seats[+el.dataset.nm].name = cleanName(el.value); });
  save();
}
function canonName(n, def) { const t = cleanName(n); if (!t) return def; const r = S.roster.find(x => nkey(x) === nkey(t)); return r || t; }
function remember(n) { if (n && !isPlaceholder(n) && !S.roster.some(x => nkey(x) === nkey(n))) S.roster.push(n); }
// Colores de los rivales: primero el de enfrente
const RIVALS = [[2], [2, 1], [2, 1, 3]];
function startFromDraft() {
  const D = S.draft;
  let seats;
  if (D.mode === 'ai') {
    const me = D.ai.color, name = canonName(D.ai.name, 'Tú');
    remember(name);
    seats = [{ c: me, name, ai: false, me: true }].concat(RIVALS[D.ai.rivals - 1].map(k => ({ c: (me + k) % 4, name: COL[(me + k) % 4].n, ai: true, level: D.ai.level })));
  } else {
    seats = D.local.seats.map((s, c) => s.t === 'x' ? null : s.t === 'm' ? { c, name: COL[c].n, ai: true, level: D.local.level } : { c, name: canonName(s.name, 'Jugador ' + (c + 1)), ai: false }).filter(Boolean);
    if (seats.length < 2) { toast('Hacen falta al menos dos jugadores'); return; }
    if (!seats.some(s => !s.ai)) { toast('Pon al menos una persona'); return; }
    const names = seats.filter(s => !s.ai).map(s => nkey(s.name));
    if (new Set(names).size !== names.length) { toast('Hay dos jugadores con el mismo nombre'); return; }
    seats.forEach(s => { if (!s.ai) remember(s.name); });
  }
  newGame(D.mode, seats);
}
function newGame(mode, seats) {
  seats = seats.slice().sort((a, b) => a.c - b.c);
  const st = P.nueva(seats.map(s => s.c));
  // empieza un color al azar
  st.turno = seats[fairDie() % seats.length].c;
  const humans = seats.filter(s => !s.ai);
  S.game = { id: uid(), created: Date.now(), mode, seats, st, orient: (humans.find(s => s.me) || humans[0] || seats[0]).c, log: [] };
  ANIM_KEY = null; BUSY = false;
  save(); render(); keepAwake();
  toast('Empieza ' + COL[st.turno].n);
}
function rematch() {
  const g = S.game; if (!g) return;
  // en la revancha empieza el siguiente color
  newGame(g.mode, g.seats.map(s => Object.assign({}, s)));
}

/* ================= Partida local ================= */
let BUSY = false, AIT = null;
function gameVm(g) {
  const st = g.st, seat = seatOf(g, st.turno);
  const humanTurn = seat && !seat.ai && st.fase === 'mover';
  return Object.assign({}, st, {
    names: Object.fromEntries(g.seats.map(s => [s.c, s.name])), ai: Object.fromEntries(g.seats.map(s => [s.c, s.ai])),
    orient: g.orient, you: (g.seats.find(s => s.me) || {}).c, movs: humanTurn && !BUSY ? P.movimientos(st).map(m => ({ i: m.i, a: m.a })) : []
  });
}
const seatOf = (g, c) => g.seats.find(s => s.c === c);
function statusLine(vm, mine, who) {
  if (vm.fase === 'fin') return { cls: 'end', t: vm.you === vm.ganador ? '<span>🏆 ¡Has ganado!</span>' : `<span>${esc(`🏆 ¡${cname(vm, vm.ganador)} gana la partida!`)}</span>` };
  const u = vm.ultimo, n = who || cname(vm, vm.turno), sp = t => `${dot(vm.turno)}<span>${esc(t)}</span>`;
  if (!mine) return { cls: '', t: sp(vm.ai[vm.turno] ? `Juega ${n} (máquina)…` : `Juega ${n}…`) };
  if (vm.fase === 'tirar') {
    const again = u && u.c === vm.turno && (u.tipo === 'mueve' || (u.tipo === 'tira' && u.d === 6));
    return { cls: 'go', t: sp(again ? `${n}: ¡vuelves a tirar!` : `${n}: tira el dado`) };
  }
  if (vm.premio) return { cls: 'go', t: sp(`${n}: cuentas ${vm.valor}. Elige ficha`) };
  if (vm.dado === 5 && vm.movs.length === 1 && vm.fichas[vm.turno][vm.movs[0].i] === P.CASA) return { cls: 'go', t: sp(`${n}: con el 5 sale una ficha`) };
  return { cls: 'go', t: sp(vm.valor === 7 ? `${n}: mueves 7 (el 6 cuenta 7). Elige ficha` : `${n}: mueves ${vm.valor}. Elige ficha`) };
}
function renderGame() {
  const g = S.game, st = g.st, vm = gameVm(g);
  const seat = seatOf(g, st.turno), mine = seat && !seat.ai && st.fase !== 'fin';
  const multiHuman = g.seats.filter(s => !s.ai).length > 1;
  $('#subtitle').textContent = g.mode === 'ai' ? 'Contra la máquina · ' + LEVELS[(g.seats.find(s => s.ai) || {}).level || 2].name : 'Entre amigos';
  const S1 = statusLine(vm, mine, multiHuman || !seat || !seat.me ? null : 'Te toca');
  const canRoll = mine && st.fase === 'tirar' && !BUSY;
  const shownDie = st.fase === 'mover' ? st.dado : g.lastDie;
  const ended = st.fase === 'fin';
  $('#app').innerHTML = `<div class="gm">
    ${playerChips(vm)}
    <div class="gb"><div class="board" id="pBoard">${boardSvg(vm)}</div></div>
    <div class="gs">
      <div class="gstatus ${S1.cls}">${S1.t}</div>
      ${ended ? `<div class="sec" style="margin:8px 0 0">${resultsHtml(vm)}</div>
        <div class="gacts" style="margin-top:8px"><button class="btn-gold" id="gRe">🔁 Revancha</button><button class="btn-ghost" id="gShare">📤 Compartir</button><button class="btn-ghost" id="gNew">✚ Nueva</button></div>`
      : `<div class="drow"><button class="dice ${canRoll ? 'go' : ''}" id="dice" style="--dc:${COL[st.turno].h}" ${canRoll ? '' : 'disabled'} aria-label="Tirar el dado">${diceFace(shownDie)}</button>
        <div class="glog">${(g.log || []).slice(-3).reverse().map((t, k) => `<div class="${k ? 'mut' : ''}">${esc(t)}</div>`).join('') || '<div class="mut">Saca un 5 para salir de casa.</div>'}</div></div>`}
    </div></div>`;
  bindBoardTap(vm, i => humanMove(i));
  const d = $('#dice'); if (d) d.onclick = humanRoll;
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('gRe', rematch);
  on('gNew', () => { S.game = null; render(); });
  on('gShare', () => shareResult(vm, g));
  const dur = animateLast(vm);
  if (ended) { finishLocal(g); return; }
  schedule(g, dur);
}
// Al tocar el tablero: la ficha que se puede mover más cerca (o su destino)
function bindBoardTap(vm, fn) {
  const el = $('#pBoard'); if (!el || !vm.movs || !vm.movs.length) return;
  const svg = el.querySelector('svg');
  el.onclick = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    let best = null, bd = 1e9;
    const cand = [];
    piecePositions(vm).forEach(o => { if (o.c === vm.turno && vm.movs.some(x => x.i === o.i)) { const v = rot(o, (4 - (vm.orient || 0)) % 4); cand.push({ i: o.i, x: v.x, y: v.y }); } });
    vm.movs.forEach(mv => { const v = viewSpot(vm, vm.turno, mv.a, mv.i, Math.min(3, vm.fichas[vm.turno].filter(r => r === P.META).length)); cand.push({ i: mv.i, x: v.x, y: v.y }); });
    cand.forEach(c => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } });
    if (best && bd < 7.5) { vibrate(10); fn(best.i); }
    else if (vm.movs.length) toast('Toca una de las fichas que brillan');
  };
}
function logEv(g) {
  const vm = gameVm(g), t = describe(vm, g.st.ultimo);
  if (t) { g.log = (g.log || []).concat([t]).slice(-30); }
}
function humanRoll() {
  const g = S.game; if (!g || BUSY || g.st.fase !== 'tirar') return;
  const seat = seatOf(g, g.st.turno); if (!seat || seat.ai) return;
  BUSY = true; clearTimeout(AIT);
  const ms = speed().roll;
  rollAnim(ms);
  setTimeout(() => {
    BUSY = false;
    if (S.game !== g || g.st.fase !== 'tirar') return;
    P.tirar(g.st, fairDie()); g.lastDie = g.st.ultimo && g.st.ultimo.d || 6; logEv(g);
    if (g.st.ultimo && g.st.ultimo.tipo === 'tres6') toast(describe(gameVm(g), g.st.ultimo));
    save(); render();
  }, ms);
}
function humanMove(i) {
  const g = S.game; if (!g || BUSY || g.st.fase !== 'mover') return;
  const seat = seatOf(g, g.st.turno); if (!seat || seat.ai) return;
  if (!P.mover(g.st, i)) { Sound.play('bad'); return; }
  clearTimeout(AIT);
  logEv(g); save(); render();
}
// Turnos de la máquina y movimiento automático cuando solo hay una opción
function schedule(g, animMs) {
  clearTimeout(AIT); AIT = null;
  const st = g.st; if (st.fase === 'fin') return;
  const seat = seatOf(g, st.turno); if (!seat) return;
  const sp = speed();
  if (seat.ai) {
    AIT = setTimeout(() => aiStep(g), animMs + (st.fase === 'tirar' ? sp.move : sp.move * 0.8));
    return;
  }
  if (st.fase === 'mover' && S.autoMove !== false) {
    const ms = P.movimientos(st);
    if (ms.length && ms.every(m => m.a === ms[0].a && (m.i === ms[0].i || st.fichas[st.turno][m.i] === st.fichas[st.turno][ms[0].i]))) {
      AIT = setTimeout(() => { if (S.game === g && g.st.fase === 'mover') humanMove(ms[0].i); }, animMs + 520);
    }
  }
}
function aiStep(g) {
  if (S.game !== g || BUSY) return;
  const st = g.st, seat = seatOf(g, st.turno);
  if (!seat || !seat.ai || st.fase === 'fin') return;
  if (!$('#modal').classList.contains('hidden')) { AIT = setTimeout(() => aiStep(g), 500); return; }   // espera a que se cierre la ventana
  if (st.fase === 'tirar') {
    BUSY = true;
    const ms = speed().roll; rollAnim(ms);
    setTimeout(() => {
      BUSY = false;
      if (S.game !== g) return;
      P.tirar(st, fairDie()); g.lastDie = st.ultimo && st.ultimo.d || 6; logEv(g);
      if (st.ultimo && st.ultimo.tipo === 'tres6') toast(describe(gameVm(g), st.ultimo));
      save(); render();
    }, ms);
    return;
  }
  const i = P.elegir(st, seat.level || 2);
  if (i != null) { P.mover(st, i); logEv(g); }
  save(); render();
}
// Partida terminada: al historial (una vez) y sonido
function finishLocal(g) {
  if (g.done) return;
  g.done = true; g.finished = Date.now();
  Sound.play('end'); vibrate([30, 60, 30]);
  archiveUpsert(archiveEntry(g));
  save(); autoBackup(true);
}
function archiveEntry(g) {
  const st = g.st;
  return { id: g.id, created: g.created, finished: g.finished || Date.now(), mode: g.mode,
    seats: g.seats.map(s => Object.assign({}, s)), orden: st.orden.slice(), stats: JSON.parse(JSON.stringify(st.stats)),
    metas: st.colores.map(c => [c, st.fichas[c].filter(r => r === P.META).length]), n: st.n };
}
function archiveUpsert(a) {
  const k = S.archive.findIndex(x => x.id === a.id);
  if (k >= 0) S.archive[k] = a; else S.archive.unshift(a);
  if (S.archive.length > MAX_ARCHIVE) S.archive.length = MAX_ARCHIVE;
}
function shareResult(vm, a) {
  const st = vm.stats;
  const when = new Date(a.finished || a.created).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  shareImage(drawShareImage({
    title: '🏆 ' + cname(vm, vm.ganador) + ' gana', subtitle: 'Parchís · ' + when + ' · ' + (vm.n || 0) + ' tiradas',
    cols: ['#', 'Jugador', '🏁', '🍽', '🎲6'],
    rows: vm.orden.map((c, k) => [k === 0 ? '🏆' : (k + 1) + 'º', cname(vm, c), (vm.fichas ? vm.fichas[c].filter(r => r === P.META).length : '') + '/4', st.comidas[c] || 0, st.seises[c] || 0]),
    note: '🏁 fichas en la meta · 🍽 fichas comidas · 🎲6 seises'
  }), 'parchis-resultado.png', 'Resultado de la partida de Parchís 🎲');
}
// Ver una partida del historial
function showArchived(k) {
  const a = S.archive[k]; if (!a) return;
  const vm = archVm(a);
  openModal(`<h3>🎲 Partida del ${new Date(a.finished || a.created).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
    <div class="sub">${a.mode === 'ai' ? 'Contra la máquina' : a.mode === 'online' ? 'En línea' : 'Entre amigos'} · ${a.n || 0} tiradas</div>${resultsHtml(vm)}
    <div class="acts"><button class="btn-ghost" id="arDel">🗑 Borrar</button><button class="btn-ghost" id="arSh">📤 Compartir</button><button class="btn-gold" id="arOk">Cerrar</button></div>`);
  $('#arOk').onclick = closeModal;
  $('#arSh').onclick = () => shareResult(vm, a);
  $('#arDel').onclick = () => confirmBox('Borrar la partida', 'Se quitará del historial y de la clasificación.', 'Borrar', () => { S.archive.splice(k, 1); save(); render(); toast('Partida borrada'); }, true);
}
function archVm(a) {
  const fichas = [0, 1, 2, 3].map(() => [P.CASA, P.CASA, P.CASA, P.CASA]);
  (a.metas || []).forEach(([c, m]) => { for (let i = 0; i < m; i++) fichas[c][i] = P.META; });
  return { colores: a.seats.map(s => s.c), orden: a.orden, ganador: a.orden[0], stats: a.stats, fichas, n: a.n,
    names: Object.fromEntries(a.seats.map(s => [s.c, s.name + (s.ai ? ' 🤖' : '')])), ai: {} };
}

/* ================= Jugar en línea ================= */
const ON = { ws: null, estado: 'desconectado', sala: null, quiere: false, intentos: 0, timer: null, ping: null, listo: null, rolling: false, ultimoTurno: null };
function onToken() {
  S.online = S.online || {};
  if (!S.online.token) { const a = new Uint8Array(18); crypto.getRandomValues(a); S.online.token = Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join(''); save(); }
  return S.online.token;
}
const onNombre = () => (S.online && S.online.nombre) || '';
function onConectar() {
  if (!ONLINE_URL) return;
  ON.quiere = true;
  if (ON.ws && (ON.ws.readyState === 0 || ON.ws.readyState === 1)) return;
  clearTimeout(ON.timer);
  onSetEstado('conectando');
  let ws;
  try { ws = new WebSocket(ONLINE_URL); } catch (e) { onReintentar(); return; }
  ON.ws = ws;
  ws.onopen = () => {
    ON.intentos = 0; onSetEstado('conectado');
    ws.send(JSON.stringify({ t: 'hola', token: onToken(), nombre: onNombre() }));
    clearInterval(ON.ping); ON.ping = setInterval(() => onEnviar({ t: 'ping' }), 25000);
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'hola') {
      if (!Array.isArray(m.juegos) || !m.juegos.includes('parchis')) { ON.listo = false; onSetEstado('preparando'); ON.ws = null; ws.close(); clearTimeout(ON.timer); if (ON.quiere) ON.timer = setTimeout(onConectar, 60000); return; }
      ON.listo = true; onSetEstado('conectado');
      return;
    }
    if (m.t === 'sala') { ON.listo = true; onRecibirSala(m.sala); }
    else if (m.t === 'error') { ON.rolling = false; toast(m.msg); }
    else if (m.t === 'fuera') { toast(m.motivo || 'Has salido de la partida'); onRecibirSala(null); }
  };
  ws.onclose = () => { if (ON.ws !== ws) return; clearInterval(ON.ping); ON.ws = null; onSetEstado('desconectado'); if (ON.quiere) onReintentar(); };
  ws.onerror = () => {};
}
function onReintentar() { clearTimeout(ON.timer); const ms = Math.min(15000, 1000 * 2 ** ON.intentos++); ON.timer = setTimeout(onConectar, ms); }
function onEnviar(m) {
  if (!ON.ws || ON.ws.readyState !== 1) { if (m.t !== 'ping') toast('Sin conexión con el servidor. Reintentando…'); onConectar(); return false; }
  ON.ws.send(JSON.stringify(m)); return true;
}
function onSetEstado(e) {
  if (e === 'desconectado' && ON.listo === false) e = 'preparando';
  ON.estado = e;
  document.querySelectorAll('#onJoin, #onCreate').forEach(b => { b.disabled = e === 'preparando'; });
  const el = $('#onStatus'); if (el) el.innerHTML = onEstadoHtml();
}
const onEstadoHtml = () => ({ conectado: '🟢 Conectado', conectando: '🟡 Conectando…', desconectado: '🔴 Sin conexión · reintentando', preparando: '🛠 El parchís en línea estará disponible muy pronto' })[ON.estado];
document.addEventListener('visibilitychange', () => { if (!document.hidden && ON.quiere && ON.estado !== 'conectado') { ON.intentos = 0; onConectar(); } });

function onRecibirSala(sala) {
  const antes = ON.sala;
  ON.sala = sala;
  S.online = S.online || {}; S.online.enSala = !!sala; save();
  if (sala && sala.partida) {
    const p = sala.partida;
    const miTurno = sala.estado === 'jugando' && p.turnoSilla === sala.yo;
    if (miTurno && ON.ultimoTurno !== sala.yo) AvisoTurno.sonar();          // sonido y vibración (se quita en ajustes)
    ON.ultimoTurno = sala.estado === 'jugando' ? p.turnoSilla : null;
    if (sala.estado === 'fin') onArchivar(sala);
  }
  if (!sala && !antes) return;
  const wait = ON.rolling ? Math.max(0, ON.rolling - Date.now()) : 0;
  ON.rolling = false;
  if (!S.game) { if (wait) setTimeout(() => { if (!S.game) render(); }, wait); else render(); }
}
// Al terminar: la partida pasa al historial y al ranking
function onArchivar(sala) {
  const p = sala.partida; if (!p || !p.partida) return;
  const pa = p.partida, id = 'on-' + pa.id;
  if (S.archive.some(a => a.id === id)) return;
  const seats = Object.keys(pa.color).map(pid => ({ c: pa.color[pid], name: cleanName(pa.nombres[pid]).replace(/^🤖\s*/, '') || COL[pa.color[pid]].n, ai: pa.bots.includes(pid), me: pid === sala.yo })).sort((a, b) => a.c - b.c);
  S.archive.unshift({ id, created: pa.created, finished: Date.now(), mode: 'online', seats, orden: pa.orden, stats: pa.stats,
    metas: p.colores.concat(pa.orden.filter(c => !p.colores.includes(c))).map(c => [c, p.fichas[c].filter(r => r === P.META).length]), n: pa.n });
  if (S.archive.length > MAX_ARCHIVE) S.archive.length = MAX_ARCHIVE;
  Sound.play('end'); save(); autoBackup(true);
}
function renderOnline() {
  S.online = S.online || {};
  if (!ON.quiere) onConectar();
  const s = ON.sala;
  if (!s) return onRenderInicio();
  if (s.estado === 'espera') return onRenderEspera(s);
  return onRenderMesa(s);
}
function onRenderInicio() {
  $('#subtitle').textContent = 'Jugar en línea';
  const o = Object.assign({ nivel: 'normal' }, (S.online && S.online.opciones) || {});
  $('#app').innerHTML = `${modeTabs()}
    <div class="sec"><h2>Tu nombre</h2>
      <input id="onName" maxlength="18" placeholder="Cómo te verán los demás" value="${esc(onNombre())}" autocomplete="off" style="width:100%"></div>
    <div class="sec"><h2>Unirse a una partida</h2>
      <div class="mut" style="margin-bottom:8px">Pide el código a quien la ha creado.</div>
      <div class="row" style="gap:8px"><input id="onCode" maxlength="4" placeholder="Código" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0;width:0;text-transform:uppercase;letter-spacing:4px;font-weight:700;text-align:center">
      <button class="btn-gold" id="onJoin" style="flex:1;min-width:0" ${ON.estado === 'preparando' ? 'disabled' : ''}>Unirse</button></div></div>
    <div class="sec"><h2>Crear una partida</h2>
      <label class="f"><span>Nivel de la máquina<em>Si rellenas sillas con la máquina</em></span>
        <span class="kinds" data-on="nivel" style="flex:none;width:62%;margin:0">${[['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']].map(([v, t]) => `<button data-v="${v}" class="${o.nivel === v ? 'on' : ''}">${t}</button>`).join('')}</span></label>
      <button class="btn-gold" id="onCreate" style="width:100%;margin-top:8px" ${ON.estado === 'preparando' ? 'disabled' : ''}>Crear partida</button></div>
    <div class="mut" style="text-align:center;margin:0 0 4px">De 2 a 4 jugadores; las sillas libres las puede ocupar la máquina. El dado lo tira el servidor.</div>
    <div class="mut" id="onStatus" style="text-align:center;margin:6px 0 20px">${onEstadoHtml()}</div>`;
  bindModeTabs();
  const nameOk = () => { const n = cleanName($('#onName').value).slice(0, 18); if (!n) { toast('Escribe tu nombre'); $('#onName').focus(); return null; } S.online.nombre = n; save(); return n; };
  $('#onName').onchange = () => { S.online.nombre = cleanName($('#onName').value).slice(0, 18); save(); };
  document.querySelectorAll('[data-on] button').forEach(b => b.onclick = () => b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)));
  $('#onCode').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('#onJoin').onclick = () => {
    const n = nameOk(); if (!n) return;
    const c = $('#onCode').value.trim().toUpperCase(); if (c.length !== 4) { toast('El código tiene 4 letras o números'); return; }
    onEnviar({ t: 'unirse', codigo: c, nombre: n });
  };
  $('#onCreate').onclick = () => {
    const n = nameOk(); if (!n) return;
    const b = document.querySelector('[data-on="nivel"] .on');
    const opciones = { nivel: b ? b.dataset.v : 'normal' };
    S.online.opciones = opciones; save();
    onEnviar({ t: 'crear', juego: 'parchis', opciones, nombre: n });
  };
}
function onRenderEspera(s) {
  $('#subtitle').textContent = 'Partida en línea · esperando';
  const host = s.asientos.find(a => a.anfitrion);
  $('#app').innerHTML = `
    <div class="sec" style="text-align:center"><div class="mut">Código de la partida</div>
      <div class="on-code">${esc(s.codigo)}</div>
      <button class="btn-gold" id="onInvite" style="width:100%">📲 Enviar el código (WhatsApp…)</button>
      <div class="mut" style="margin-top:8px">Los demás abren Parchís → <b>En línea</b> → <b>Unirse</b> y ponen el código.</div></div>
    <div class="sec"><h2>Jugadores (${s.asientos.length}/${s.max})</h2>
      ${s.asientos.map(a => `<div class="on-seat"><span class="on-dot ${a.conectado ? 'ok' : ''}"></span><span class="n">${esc(a.nombre)}${a.id === s.yo ? ' <small>(tú)</small>' : ''}${a.anfitrion ? ' 👑' : ''}</span>
        ${s.anfitrion && a.id !== s.yo ? `<button class="btn-ghost sm" data-quitar="${a.id}" aria-label="Quitar">✕</button>` : ''}</div>`).join('')}
      ${s.anfitrion && s.asientos.length < s.max ? '<button class="btn-ghost" id="onBot" style="width:100%;margin-top:8px">🤖 Añadir a la máquina</button>' : ''}</div>
    ${s.anfitrion
      ? `<button class="btn-gold" id="onStart" style="width:100%" ${s.asientos.length >= s.min ? '' : 'disabled'}>Empezar la partida</button>
         <div class="mut" style="text-align:center;margin-top:6px">${s.asientos.length < s.min ? 'Espera a que entre alguien o añade a la máquina.' : 'Con dos jugadores, los colores van enfrentados. Cuando estéis todos, pulsa Empezar.'}</div>`
      : `<div class="sec" style="text-align:center">⏳ Esperando a que ${esc(host ? host.nombre : 'el anfitrión')} empiece la partida…</div>`}
    <button class="btn-ghost" id="onLeave" style="width:100%;margin-top:12px">Salir</button>
    <div class="mut" id="onStatus" style="text-align:center;margin:10px 0 20px">${onEstadoHtml()}</div>`;
  $('#onInvite').onclick = () => onInvitar(s.codigo);
  const b = $('#onBot'); if (b) b.onclick = () => onEnviar({ t: 'bot' });
  const st = $('#onStart'); if (st) st.onclick = () => onEnviar({ t: 'empezar' });
  document.querySelectorAll('[data-quitar]').forEach(x => x.onclick = () => onEnviar({ t: 'quitar', asiento: x.dataset.quitar }));
  $('#onLeave').onclick = () => confirmBox('Salir', 'Saldrás de esta partida.', 'Salir', () => onEnviar({ t: 'salir' }));
}
async function onInvitar(codigo) {
  const enlace = isPlay() ? '🤖 Android: ' + PLAY_URL + '\n🍏 iPhone: ' + WEB_URL : DESCARGA_URL;
  const text = `🎲 ¡Juega al parchís conmigo!\n\nAbre la app Parchís → En línea → Unirse y pon el código:\n\n*${codigo}*\n\n¿No tienes la app? Es gratis, para Android e iPhone:\n${enlace}`;
  try {
    if (isNative()) { await window.Capacitor.Plugins.Share.share({ title: 'Partida de parchís', text, dialogTitle: 'Invitar' }); return; }
    if (navigator.share) { await navigator.share({ title: 'Partida de parchís', text }); return; }
    await navigator.clipboard.writeText(text); toast('Invitación copiada');
  } catch (e) { if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) toast('No se pudo compartir'); }
}
function onlineVm(s) {
  const p = s.partida;
  const names = {}, ai = {};
  for (const pid in p.color) { names[p.color[pid]] = String(p.nombres[pid] || '').replace(/^🤖\s*/, ''); ai[p.color[pid]] = (s.asientos.find(a => a.id === pid) || {}).bot || p.bots.includes(pid); }
  return Object.assign({}, p, { names, ai, you: p.yo, orient: p.yo == null ? 0 : p.yo, movs: ON.rolling ? [] : p.movs || [] });
}
function onRenderMesa(s) {
  const p = s.partida, vm = onlineVm(s), yo = p.yo;
  const ended = s.estado === 'fin';
  $('#subtitle').textContent = ended ? 'En línea · terminada' : 'En línea · ' + s.codigo;
  const seatsByC = {}; for (const pid in p.color) seatsByC[p.color[pid]] = s.asientos.find(a => a.id === pid) || {};
  const mine = !ended && yo != null && p.turno === yo;
  const S1 = statusLine(vm, mine, mine ? 'Te toca' : null);
  const canRoll = mine && p.fase === 'tirar' && !ON.rolling;
  if (p.ultimo && p.ultimo.tipo === 'tira') ON.lastDie = p.ultimo.d; else if (p.ultimo && p.ultimo.tipo === 'tres6') ON.lastDie = 6;
  const shownDie = p.fase === 'mover' ? p.dado : ON.lastDie;
  const yaRev = (s.revancha || []).includes(s.yo);
  $('#app').innerHTML = `<div class="gm">
    ${playerChips(vm, seatsByC)}
    <div class="gb"><div class="board" id="pBoard">${boardSvg(vm)}</div></div>
    <div class="gs">
      <div class="gstatus ${S1.cls}">${S1.t}</div>
      ${ended ? `<div class="sec" style="margin:8px 0 0">${resultsHtml(vm)}<div class="mut">Guardada en tu historial y en la clasificación.</div></div>
        <div class="gacts" style="margin-top:8px"><button class="btn-gold" id="onRe" ${yaRev ? 'disabled' : ''}>${yaRev ? '⏳ Esperando a los demás' : '🔁 Revancha'}</button><button class="btn-ghost" id="gShare">📤 Compartir</button><button class="btn-ghost" id="onLeave2">Salir</button></div>`
      : `<div class="drow"><button class="dice ${canRoll ? 'go' : ''}" id="dice" style="--dc:${COL[p.turno].h}" ${canRoll ? '' : 'disabled'} aria-label="Tirar el dado">${diceFace(shownDie)}</button>
        <div class="glog"><div>${esc(describe(vm, p.ultimo)) || '<span class="mut">Saca un 5 para salir de casa.</span>'}</div><div class="mut" id="onStatus">${onEstadoHtml()} · ${esc(s.codigo)}</div></div></div>`}
    </div></div>`;
  bindBoardTap(vm, i => { if (onEnviar({ t: 'jugada', a: { tipo: 'mover', ficha: i } })) { p.movs = []; } });
  const d = $('#dice'); if (d) d.onclick = () => { if (ON.rolling) return; const ms = speed().roll; ON.rolling = Date.now() + ms; rollAnim(ms); if (!onEnviar({ t: 'jugada', a: { tipo: 'tirar' } })) ON.rolling = false; };
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('onRe', () => onEnviar({ t: 'jugada', a: { tipo: 'revancha' } }));
  on('gShare', () => shareResult(vm, { created: Date.now() }));
  on('onLeave2', () => { onEnviar({ t: 'salir' }); S.draft.mode = 'online'; save(); });
  const dur = animateLast(vm);
  // una sola opción: se mueve sola
  const ms = vm.movs;
  if (mine && p.fase === 'mover' && S.autoMove !== false && ms.length && ms.every(m => m.a === ms[0].a && p.fichas[yo][m.i] === p.fichas[yo][ms[0].i])) {
    const key = evKey(vm) + '|auto';
    if (ON.auto !== key) { ON.auto = key; setTimeout(() => { if (ON.sala === s && !S.game) onEnviar({ t: 'jugada', a: { tipo: 'mover', ficha: ms[0].i } }); }, dur + 520); }
  }
}
function leaveOnline() {
  const s = ON.sala;
  if (!s) return;
  if (s.estado === 'jugando') confirmBox('Abandonar la partida', 'Tu silla la ocupará la máquina hasta el final.', 'Abandonar', () => onEnviar({ t: 'salir' }));
  else onEnviar({ t: 'salir' });
}
// Al abrir la app: si estabas en una partida en línea, vuelve a ella
document.addEventListener('DOMContentLoaded', () => { try { if (S.online && S.online.enSala) onConectar(); } catch (e) {} });
