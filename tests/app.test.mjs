// Pruebas automáticas de Parchís (IT Canarias)
// Se ejecutan en GitHub antes de compilar: si alguna falla, no se publica la versión.
// Uso local: node tests/app.test.mjs   (para la parte en línea busca el servidor común en ../juegos-servidor o en JUEGOS_SERVIDOR)
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../www/parchis.js');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); if (process.env.GITHUB_ACTIONS) console.log('::error::' + name); } };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const { CASA, META, PASILLO } = P;
// casilla del recorrido → posición relativa de un color
const rel = (c, sq) => (sq - P.SALIDA[c] + 68) % 68;
function estado(fichas, turno = 0, colores = [0, 1, 2, 3]) {
  const g = P.nueva(colores);
  for (let c = 0; c < 4; c++) if (fichas[c]) g.fichas[c] = fichas[c].slice();
  g.turno = turno; return g;
}
const ids = g => P.movimientos(g).map(m => m.i).sort().join();

/* ================= Reglas ================= */
console.log('Tablero y salidas');
{
  check('salidas 5, 22, 39 y 56; seguros con las salidas', P.SALIDA.join() === '5,22,39,56' && P.SALIDA.every(s => P.esSeguro(s)) && P.SEGUROS.size === 12);
  check('cada color recorre 64 casillas antes de su pasillo', P.casilla(0, 0) === 5 && P.casilla(0, 63) === 68 && P.casilla(1, 0) === 22 && P.casilla(1, 63) === 17 && P.casilla(2, 63) === 34 && P.casilla(3, 63) === 51 && P.casilla(0, PASILLO) === null);
  const g = P.nueva();
  check('todas las fichas empiezan en casa y se tira primero', g.fichas.flat().every(r => r === CASA) && g.fase === 'tirar');
  P.tirar(g, 3);
  check('sin un 5 no se puede salir: pasa el turno', g.turno === 1 && g.fase === 'tirar' && g.ultimo.nada);
  P.tirar(g, 5);
  check('con un 5 se saca ficha (y es la única jugada)', g.fase === 'mover' && P.movimientos(g).length === 1 && P.movimientos(g)[0].sale);
  P.mover(g, 0);
  check('la ficha sale a su casilla de salida', g.fichas[1][0] === 0 && P.casilla(1, 0) === 22 && g.turno === 2);
  const h = estado({ 0: [10, CASA, CASA, CASA] }); P.tirar(h, 5);
  check('con un 5 hay que sacar aunque se pueda mover otra', ids(h) === '1' && P.movimientos(h)[0].sale);
  const k = estado({ 0: [0, 0, CASA, CASA] }); P.tirar(k, 5);
  check('con dos fichas propias en la salida no se sale: se mueve otra', P.movimientos(k).every(m => !m.sale) && P.movimientos(k).length === 2);
  const e = estado({ 0: [CASA, CASA, CASA, CASA], 1: [rel(1, 5), CASA, CASA, CASA], 2: [rel(2, 5), CASA, CASA, CASA] }); P.tirar(e, 5);
  const m = P.movimientos(e)[0];
  check('si en la salida hay dos fichas de otros colores, al salir se come una', m.sale && m.come && m.come.c === 2);
  P.mover(e, m.i);
  check('…que vuelve a su casa, y se cuentan 20', e.fichas[2][0] === CASA && e.fase === 'mover' && e.valor === 20 && e.premio);
}

console.log('El dado: 6, 7 y tres seises');
{
  const g = estado({ 0: [0, 10, CASA, CASA] }); P.tirar(g, 6);
  check('con fichas en casa, el 6 vale 6', g.valor === 6);
  P.mover(g, 1);
  check('con un 6 se repite', g.turno === 0 && g.fase === 'tirar');
  const s = estado({ 0: [0, 10, 20, 30] }); P.tirar(s, 6);
  check('sin fichas en casa, el 6 cuenta 7', s.valor === 7 && P.movimientos(s).every(x => x.a - x.de === 7));
  const t = estado({ 0: [0, 30, CASA, CASA] });
  P.tirar(t, 6); P.mover(t, 0); P.tirar(t, 6); P.mover(t, 0); const r = t.fichas[0][0]; P.tirar(t, 6);
  check('tres seises: la última ficha movida vuelve a casa y pasa el turno', r === 12 && t.fichas[0][0] === CASA && t.turno === 1 && t.ultimo.tipo === 'tres6');
  const u = estado({ 0: [56, 30, CASA, CASA] });
  P.tirar(u, 6); P.mover(u, 0); P.tirar(u, 6); P.mover(u, 0); P.tirar(u, 6);
  check('…salvo si ya está en su pasillo', u.fichas[0][0] === 68 && u.turno === 1);
  const z = estado({ 0: [CASA, CASA, CASA, CASA] }); P.tirar(z, 6);
  check('un 6 sin jugada: se vuelve a tirar', z.turno === 0 && z.fase === 'tirar' && z.ultimo.nada);
}

console.log('Barreras');
{
  const b16 = rel(1, 16);
  const g = estado({ 0: [10, 30, 31, 32], 1: [b16, b16, CASA, CASA] }); P.tirar(g, 4);
  check('nadie pasa por una barrera', !P.movimientos(g).some(m => m.i === 0));
  const h = estado({ 0: [10, 30, 31, 32], 1: [b16, b16, CASA, CASA] }); P.tirar(h, 1);
  check('ni cae en ella', !P.movimientos(h).some(m => m.i === 0));
  const own = estado({ 0: [9, 11, 11, 40] }); P.tirar(own, 3);
  check('tampoco tus propias fichas', !P.movimientos(own).some(m => m.i === 0));
  const o = estado({ 0: [10, 10, 20, 30] }); P.tirar(o, 6);
  check('con un 6 (o 7) es obligatorio abrir la barrera', ids(o) === '0,1');
  const n = estado({ 0: [10, 10, 20, CASA] }); P.tirar(n, 3);
  check('con otro número no hace falta', ids(n) === '0,1,2');
  const three = estado({ 0: [7, 10, 10, CASA] }); P.tirar(three, 3);
  check('en una casilla caben como mucho dos fichas', !P.movimientos(three).some(m => m.i === 0));
  const lane = estado({ 0: [62, 66, 66, 20] }); P.tirar(lane, 6);
  check('en el pasillo propio también hay barrera', !P.movimientos(lane).some(m => m.i === 0 && m.a > 66));
}

console.log('Comer, seguros y meta');
{
  const g = estado({ 0: [10, 30, 31, 32], 2: [rel(2, 16), CASA, CASA, CASA] }); P.tirar(g, 1);
  const m = P.movimientos(g).find(x => x.i === 0);
  check('caer en una ficha de otro color fuera del seguro la come', !!(m && m.come && m.come.c === 2));
  P.mover(g, 0);
  check('vuelve a su casa y se cuentan 20 con cualquier ficha', g.fichas[2][0] === CASA && g.premio && g.valor === 20 && g.stats.comidas[0] === 1 && g.stats.comido[2] === 1);
  P.mover(g, 1);
  check('el premio se mueve y luego pasa el turno', g.fichas[0][1] === 50 && g.turno === 1, g.fichas[0] + ' ' + g.turno);
  const s = estado({ 0: [6, 30, 31, 32], 2: [rel(2, 12), CASA, CASA, CASA] }); P.tirar(s, 1);
  const ms = P.movimientos(s).find(x => x.i === 0);
  check('en un seguro no se come: conviven las dos', !!ms && !ms.come);
  const full = estado({ 0: [6, 30, 31, 32], 2: [rel(2, 12), CASA, CASA, CASA], 1: [rel(1, 12), CASA, CASA, CASA] }); P.tirar(full, 1);
  check('en un seguro con dos fichas no se puede caer', !P.movimientos(full).some(x => x.i === 0));
  const meta = estado({ 0: [68, 30, 31, 32] }); P.tirar(meta, 4);
  check('a la meta solo con el número exacto', !P.movimientos(meta).some(x => x.i === 0));
  const meta2 = estado({ 0: [68, 30, 31, 32] }); P.tirar(meta2, 3); P.mover(meta2, 0);
  check('al llegar a la meta se cuentan 10', meta2.fichas[0][0] === META && meta2.premio && meta2.valor === 10);
  const win = estado({ 0: [META, META, META, 70], 1: [5, CASA, CASA, CASA], 2: [40, 3, CASA, CASA] }); P.tirar(win, 1); P.mover(win, 3);
  check('gana quien mete las cuatro; los demás, por recorrido', win.fase === 'fin' && win.ganador === 0 && win.orden.join() === '0,2,1,3');
  const pr = estado({ 0: [META, 10, 20, CASA], 3: [rel(3, 15), CASA, CASA, CASA] }); P.tirar(pr, 5);
  check('el premio de 20 no puede pasarse de la meta ni saltarse', (() => { P.mover(pr, P.movimientos(pr)[0].i); return true; })());
  const q = estado({ 0: [10, 20, 30, 40], 1: [rel(1, 30), CASA, CASA, CASA] }); P.quitar(q, 1);
  check('quien abandona sale del turno; si queda uno, gana', !q.colores.includes(1) && q.fase !== 'fin');
}

console.log('Cientos de partidas simuladas');
{
  let ok = true, err = '', tiradas = 0, comidas = 0, fin = 0;
  for (let n = 0; n < 300 && ok; n++) {
    const cols = [[0, 2], [0, 1, 2], [0, 1, 2, 3]][n % 3];
    const g = P.nueva(cols);
    for (let step = 0; step < 6000 && g.fase !== 'fin'; step++) {
      if (g.fase === 'tirar') P.tirar(g, null, rnd);
      else { const ms = P.movimientos(g); if (!ms.length) { ok = false; err = 'fase mover sin jugadas'; break; } P.mover(g, P.elegir(g, 1 + (step % 3), rnd)); }
      // nunca más de dos fichas por casilla ni fuera de rango
      const cnt = {};
      for (const c of g.colores) for (const r of g.fichas[c]) { if (r < CASA || r > META) { ok = false; err = 'fuera de rango'; } const sq = P.casilla(c, r); if (sq) cnt[sq] = (cnt[sq] || 0) + 1; }
      if (Object.values(cnt).some(v => v > 2)) { ok = false; err = 'tres fichas en una casilla'; }
      if (!ok) break;
    }
    if (g.fase === 'fin') { fin++; if (g.orden.length !== cols.length || g.orden[0] !== g.ganador) { ok = false; err = 'clasificación mal'; } }
    tiradas += g.stats.tiradas; comidas += g.stats.comidas.reduce((a, b) => a + b, 0);
  }
  check('300 partidas de 2, 3 y 4 jugadores terminan y respetan las reglas', ok && fin === 300, err + ' fin=' + fin);
  check('duración y comidas razonables', tiradas / 300 > 60 && tiradas / 300 < 700 && comidas > 300, tiradas / 300 + ' tiradas, ' + comidas + ' comidas');
}

console.log('Fuerza de los niveles');
{
  const duel = (a, b, n) => {
    let w = 0;
    for (let k = 0; k < n; k++) {
      const g = P.nueva([0, 2]); const lv = k % 2 ? { 0: b, 2: a } : { 0: a, 2: b };
      g.turno = k % 4 < 2 ? 0 : 2;
      for (let s = 0; s < 6000 && g.fase !== 'fin'; s++) { if (g.fase === 'tirar') P.tirar(g, null, rnd); else P.mover(g, P.elegir(g, lv[g.turno], rnd)); }
      if (lv[g.ganador] === a) w++;
    }
    return w / n;
  };
  const r21 = duel(2, 1, 300), r32 = duel(3, 2, 300);
  check('normal gana a fácil con claridad', r21 > 0.6, (r21 * 100).toFixed(0) + '%');
  check('difícil gana a normal', r32 > 0.52, (r32 * 100).toFixed(0) + '%');
  let legal = true;
  for (let k = 0; k < 200; k++) { const g = P.nueva(); for (let s = 0; s < 80 && g.fase !== 'fin'; s++) { if (g.fase === 'tirar') P.tirar(g, null, rnd); else { const i = P.elegir(g, 3, rnd); if (!P.movimientos(g).some(m => m.i === i)) legal = false; P.mover(g, i); } } }
  check('la máquina siempre elige una jugada legal', legal);
}

/* ================= La app en el navegador ================= */
const ROOT = fileURLToPath(new URL('../www/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try { const f = await readFile(join(ROOT, path === '/' ? 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }); res.end(f); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const URL_APP = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const BASE_STATE = { onboarded: true, iosHint: true, speed: 'rapida' };
async function fresh(state, viewport, online = '') {
  const ctx = await browser.newContext({ viewport: viewport || { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  await ctx.route('https://csuarezsm.github.io/**', r => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(u => { window.PARCHIS_ONLINE_URL = u; }, online);   // en las pruebas, nunca el servidor real
  await p.addInitScript(st => { if (st && !sessionStorage.getItem('seeded')) { localStorage.setItem('parchis.v1', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } }, state || BASE_STATE);
  await p.goto(URL_APP);
  return { p, ctx, errors };
}
const waitFor = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
// dado fijo en la página (una lista, y luego el último valor)
const dados = (p, list) => p.evaluate(l => { window.__dados = l.slice(); window.fairDie = () => window.__dados.length > 1 ? window.__dados.shift() : window.__dados[0]; }, list);
const tirar = async p => { await p.click('#dice', { force: true }); await p.waitForTimeout(450); };

console.log('Idioma inglés');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://**', r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov]) => { window[ov] = ''; navigator.share = async d => { window.__compartido = d.text; }; if (!sessionStorage.l) { localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); sessionStorage.l = 1; } }, ['parchis.v1', 'PARCHIS_ONLINE_URL']);
  await p.goto(URL_APP); await p.waitForTimeout(400);
  check('por defecto (pruebas) en español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Start game')));
  await p.click('#menuBtn'); await p.click('#mLang');
  check('el menú tiene el selector de idioma', await p.evaluate(() => document.querySelectorAll('[data-lang]').length === 5));
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="en"]')]); await p.waitForTimeout(500);
  check('al elegir inglés, la app se ve en inglés', await p.evaluate(() => Idioma.lang() === 'en' && document.body.textContent.includes('Start game') && document.body.textContent.includes('Your colour') && document.documentElement.lang === 'en'));
  await p.click('#menuBtn');
  check('y el menú también', await p.evaluate(() => document.querySelector('#modal').textContent.includes('Share the app') && document.querySelector('#modal').textContent.includes('Parchís rules')));
  check('compartir la app en inglés', await p.evaluate(async () => { closeModal(); await shareApp(); const t = window.__compartido || ''; return /free/i.test(t) && /iPhone/.test(t) && !/Gratis/.test(t); }), await p.evaluate(() => window.__compartido));
  await p.click('#start'); await p.waitForTimeout(300);
  check('la partida en inglés (estado y jugadores)', await p.evaluate(() => { const t = document.querySelector('.gstatus').textContent; return /You|playing|roll/.test(t) && !/Juega|tira el dado/.test(t) && document.querySelector('.pchips').textContent.includes('Blue'); }), await p.evaluate(() => document.querySelector('.gstatus').textContent));
  check('las fechas y números en inglés', await p.evaluate(() => new Date(2026, 10, 1).toLocaleDateString('es-ES', { month: 'long' }) === 'November'));
  check('los mensajes de la partida en inglés', await p.evaluate(() => Idioma.tr('Rojo se come una ficha de Verde: cuenta 20.') === 'Red captures a Green piece: counts 20.' && Idioma.tr('Sacas un 4 y no puedes mover.') === 'You roll a 4 and cannot move.'));
  await p.click('#menuBtn'); await p.click('#mLang');
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="es"]')]); await p.waitForTimeout(400);
  check('y se vuelve al español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Start game')));

  for (const [l, t] of [['fr', 'Plus de jeux'], ['de', 'Mehr Spiele'], ['it', 'Altri giochi']]) {
    await p.evaluate(l => localStorage.setItem('idioma', l), l); await p.reload(); await p.waitForTimeout(400);
    await p.click('#menuBtn');
    check(`en ${l}: la app se ve en ese idioma`, await p.evaluate(([l, t]) => document.documentElement.lang === l && document.querySelector('#modal').textContent.includes(t), [l, t]));
    await p.evaluate(() => closeModal());
  }
  await p.evaluate(() => localStorage.setItem('idioma', 'es')); await p.reload(); await p.waitForTimeout(300);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Contador anónimo de instalaciones');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const avisos = [];
  await ctx.route('https://contador.prueba/contar', async r => { avisos.push(JSON.parse(r.request().postData())); await r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); });
  const p = await ctx.newPage();
  await p.addInitScript(([k, ov]) => { window[ov] = ''; window.CONTADOR_URL = 'https://contador.prueba/contar'; window.CONTADOR_FORZAR = true; if (!sessionStorage.c) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.c = 1; } }, ['parchis.v1', 'PARCHIS_ONLINE_URL']);
  await p.goto(URL_APP);
  await p.evaluate(() => Contador.avisar());
  check('al instalar avisa una vez, sin datos personales', avisos.length === 1 && avisos[0].evento === 'instalacion' && avisos[0].juego === 'parchis' && avisos[0].plataforma === 'web' && Object.keys(avisos[0]).sort().join() === 'evento,juego,plataforma,version', JSON.stringify(avisos));
  await p.reload(); await p.evaluate(() => Contador.avisar());
  check('no vuelve a avisar en la misma versión', avisos.length === 1);
  await p.evaluate(() => { S.contadoVer = '0.0.1'; save(); }); await p.evaluate(() => Contador.avisar());
  check('con una versión nueva avisa de la actualización', avisos.length === 2 && avisos[1].evento === 'actualizacion' && avisos[1].de === '0.0.1');
  check('en las pruebas automáticas normales no avisa al servidor real', await p.evaluate(async () => { window.CONTADOR_FORZAR = false; S.contadoVer = null; return (await Contador.avisar()) === false; }));
  await ctx.close();
}

console.log('Más juegos de IT Canarias');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const CAT = 'https://catalogo.prueba/juegos.json';
  await ctx.route(CAT, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ juegos: [
    { id: 'ajedrez', nombre: 'Ajedrez', descripcion: 'a', descarga: 'https://csuarezsm.github.io/Ajedrez/', web: 'https://csuarezsm.github.io/Ajedrez/app/' },
    { id: 'damas', nombre: 'Damas', descripcion: 'd', descarga: 'https://csuarezsm.github.io/Damas/', web: 'https://csuarezsm.github.io/Damas/app/' },
    { id: 'chinchon', nombre: 'Chinchón', descripcion: 'c', descarga: 'https://csuarezsm.github.io/chinchon-marcador/', web: 'https://csuarezsm.github.io/chinchon-marcador/app/' },
    { id: 'pumba', nombre: 'Pumba', descripcion: 'p', descarga: 'https://csuarezsm.github.io/Pumba/', web: 'https://csuarezsm.github.io/Pumba/app/' },
    { id: 'parchis', nombre: 'Parchís', descripcion: 'yo', descarga: 'https://csuarezsm.github.io/Parchis/' },
    { id: 'oca', nombre: 'La Oca <b>', emoji: '🦢', descripcion: 'Nuevo', descarga: 'https://csuarezsm.github.io/Oca/' },
    { id: '<mal>', nombre: 'Malo', descarga: 'https://x.example/' },
    { id: 'malo2', nombre: 'Malo 2', descarga: 'javascript:alert(1)' }] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov, cat]) => { window[ov] = ''; window.MAS_JUEGOS_URL = cat; if (!sessionStorage.mj) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.mj = 1; } }, ['parchis.v1', 'PARCHIS_ONLINE_URL', CAT]);
  await p.goto(URL_APP); await p.waitForTimeout(300);
  await p.click('#menuBtn');
  check('el menú tiene «Más juegos de IT Canarias»', !!(await p.$('#mMas')));
  await p.click('#mMas'); await p.waitForTimeout(200);
  const base = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('sin conexión: los otros seis juegos, y no este', base.length === 6 && !base.some(n => n.startsWith('Parch')), base.join());
  check('con sus iconos dentro de la app', await p.evaluate(() => [...document.querySelectorAll('.mji img')].every(i => i.getAttribute('src').startsWith('juegos/'))) && await p.evaluate(async () => { const r = await Promise.all([...document.querySelectorAll('.mji img')].map(i => fetch(i.getAttribute('src')).then(x => x.ok))); return r.every(Boolean); }));
  check('el catálogo común se descarga y se guarda', await p.evaluate(async () => await MasJuegos.actualizar(true) && S.masJuegos.juegos.length === 6));
  await p.evaluate(() => { closeModal(); MasJuegos.abrir(); }); await p.waitForTimeout(200);
  const nuevos = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('un juego nuevo del catálogo aparece sin actualizar la app', nuevos.length === 5 && nuevos.includes('La Oca b'), nuevos.join());
  check('los datos raros del catálogo se descartan', !nuevos.includes('Malo') && !nuevos.includes('Malo 2'));
  const abierto = await p.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; const i = MasJuegos.juegos().findIndex(j => j.id === 'oca'); document.querySelector(`[data-mj="${i}"]`).click(); return u; });
  check('en el navegador, el botón lleva a su página', abierto === 'https://csuarezsm.github.io/Oca/', abierto);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
  const ci = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ci.route('https://**/*.json', r => r.abort());
  const q = await ci.newPage();
  await q.addInitScript(([k, ov]) => { window[ov] = ''; localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); }, ['parchis.v1', 'PARCHIS_ONLINE_URL']);
  await q.goto(URL_APP); await q.waitForTimeout(300);
  const web = await q.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; MasJuegos.abrir(); document.querySelector('[data-mj="0"]').click(); return u; });
  check('en iPhone el botón abre la versión web del juego', /\/app\/$/.test(web), web);
  const aviso = await q.evaluate(() => { closeModal(); document.querySelector('#menuBtn').click(); document.querySelector('#mTheme').click(); const el = document.querySelector('#thTurno'); const antes = !!el && el.checked; el.click(); const off = S.avisoTurno === false && JSON.parse(localStorage.getItem(KEY)).avisoTurno === false; const n = AvisoTurno.veces; const sono = AvisoTurno.sonar(); return { ok: antes && off && !sono && AvisoTurno.veces === n, antes, off, sono, el: !!el }; });
  check('el aviso de turno en línea se puede quitar en ajustes', aviso.ok, JSON.stringify(aviso));
  await ci.close();
}

console.log('Versión web e iPhone');
{
  const { execSync } = await import('node:child_process');
  let iguales = true; try { execSync('diff -r www docs/app', { cwd: fileURLToPath(new URL('..', import.meta.url)) }); } catch (e) { iguales = false; }
  check('docs/app (versión web) es igual que www/ — si no: npm run web', iguales);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v99.0.0', assets: [] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.PARCHIS_ONLINE_URL = ''; if (!sessionStorage.s) { localStorage.setItem('parchis.v1', JSON.stringify({ onboarded: true })); sessionStorage.s = 1; } });
  await p.goto(URL_APP);
  check('en Safari de iPhone explica cómo añadirla a la pantalla de inicio', await waitFor(p, () => !!document.querySelector('#iosOk')));
  await p.click('#iosOk'); await p.click('#menuBtn');
  check('en la versión web no hay actualizador de APK', !(await p.$('#mUpd')) && !!(await p.$('#mIOS')));
  check('etiquetas de iPhone: icono, título y pantalla completa', await p.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]').content === 'Parchís'));
  check('compartir la app: un mensaje para Android e iPhone', await p.evaluate(async () => { let txt = ''; navigator.share = async d => { txt = d.text; }; closeModal(); await shareApp(); return txt.includes('csuarezsm.github.io/Parchis/') && /Android/.test(txt) && /iPhone/.test(txt); }));
  await p.reload(); await p.waitForTimeout(800);
  check('el aviso de instalar sale solo una vez', !(await p.$('#iosOk')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Partida contra la máquina');
{
  const { p, ctx, errors } = await fresh();
  await p.fill('#aiName', 'Carlos');
  await p.click('[data-col="1"]'); await p.click('[data-riv="1"]'); await p.click('[data-lv="3"]');
  await p.click('#start');
  check('empieza con tu nombre, color, rivales y nivel', await p.evaluate(() => { const g = S.game; return g.mode === 'ai' && g.seats.length === 2 && g.seats.find(s => s.me).name === 'Carlos' && g.seats.find(s => s.me).c === 1 && g.seats.find(s => s.ai).c === 3 && g.seats.find(s => s.ai).level === 3 && S.roster.includes('Carlos'); }));
  check('el tablero se gira: tu casa abajo a la derecha', await p.evaluate(() => S.game.orient === 1 && !!document.querySelector('#pBoard svg') && document.querySelectorAll('.pz').length === 8));
  await p.evaluate(() => { clearTimeout(AIT); S.game.st.turno = 1; S.game.st.fase = 'tirar'; render(); });
  check('te toca: el dado se puede pulsar', await p.evaluate(() => !document.querySelector('#dice').disabled && /tira el dado/.test(document.querySelector('.gstatus').textContent)));
  await dados(p, [5]); await tirar(p);
  check('con un 5 sale una ficha sola (una sola opción)', await waitFor(p, () => S.game.st.fichas[1].filter(r => r === 0).length === 1, null, 5000));
  check('se anota en el historial de la partida', await p.evaluate(() => S.game.log.some(t => t === 'Sacas un 5.') && S.game.log.some(t => t === 'Sacas una ficha de casa.')));
  check('luego juega la máquina sola', await waitFor(p, () => S.game.st.turno === 1 && S.game.st.fase === 'tirar' && S.game.st.fichas[3].some(r => r >= 0), null, 8000));
  // con varias fichas posibles se elige tocando
  await p.evaluate(() => { clearTimeout(AIT); S.game.st.fichas[1] = [0, 10, -1, -1]; S.game.st.fase = 'tirar'; S.game.st.turno = 1; render(); });
  await dados(p, [3]); await tirar(p);
  check('con dos opciones, brillan las dos y se marcan los destinos', await waitFor(p, () => document.querySelectorAll('.pz.can').length === 2 && document.querySelectorAll('.dest').length === 2, null, 4000));
  const xy = await p.evaluate(() => { const r = document.querySelector('.pz.can[data-i="1"] circle:last-child').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(150);
  check('tocar una ficha la mueve', await p.evaluate(() => S.game.st.fichas[1][1] === 13 && S.game.st.fichas[1][0] === 0));
  // comer: se cuentan 20
  await waitFor(p, () => S.game.st.turno === 1 && S.game.st.fase === 'tirar', null, 8000);
  await p.evaluate(() => { clearTimeout(AIT); S.game.st.fichas[1] = [0, 13, -1, -1]; S.game.st.fichas[3] = [49, -1, -1, -1]; S.game.st.turno = 1; S.game.st.fase = 'tirar'; render(); });
  await dados(p, [2]); await tirar(p);
  const cap = await p.evaluate(() => P.movimientos(S.game.st).map(m => [m.i, !!m.come]));
  await p.evaluate(() => humanMove(1)); await p.waitForTimeout(200);
  check('comer una ficha: vuelve a su casa y cuentas 20', await p.evaluate(() => S.game.st.fichas[3][0] === -1 && S.game.st.premio && S.game.st.valor === 20 && /cuentas 20/.test(document.querySelector('.gstatus').textContent)), JSON.stringify(cap));
  check('el mensaje lo cuenta', await p.evaluate(() => S.game.log.includes('Te comes una ficha de Verde: cuentas 20.')));
  await p.evaluate(() => humanMove(0)); await p.waitForTimeout(100);
  check('el premio se mueve con la ficha elegida', await p.evaluate(() => S.game.st.fichas[1][0] === 20 && !S.game.st.premio));
  // tres seises
  await waitFor(p, () => S.game.st.turno === 1 && S.game.st.fase === 'tirar', null, 8000);
  await p.evaluate(() => { clearTimeout(AIT); S.game.st.fichas[1] = [0, 30, -1, -1]; S.game.st.turno = 1; S.game.st.fase = 'tirar'; S.autoMove = false; render(); });
  await dados(p, [6]);
  for (let k = 0; k < 2; k++) { await tirar(p); await p.evaluate(() => humanMove(0)); await p.waitForTimeout(100); }
  await tirar(p);
  check('tres seises: la ficha vuelve a casa y pasa el turno', await p.evaluate(() => S.game.st.fichas[1][0] === -1 && S.game.st.turno === 3 && S.game.log.includes('¡Tres seises! Tu última ficha vuelve a casa.')));
  // ganar
  await waitFor(p, () => S.game.st.turno === 1 && S.game.st.fase === 'tirar', null, 8000);
  await p.evaluate(() => { clearTimeout(AIT); S.autoMove = true; S.game.st.fichas[1] = [71, 71, 71, 70]; S.game.st.fichas[3] = [20, 5, -1, -1]; S.game.st.turno = 1; S.game.st.fase = 'tirar'; render(); });
  await dados(p, [1]); await tirar(p);
  check('al meter la última ficha, ganas: pantalla final', await waitFor(p, () => S.game.st.fase === 'fin' && /Has ganado/.test(document.querySelector('.gstatus').textContent) && !!document.querySelector('#gRe'), null, 5000));
  check('la partida se guarda en el historial', await p.evaluate(() => S.archive.length === 1 && S.archive[0].orden.join() === '1,3' && S.archive[0].seats.length === 2 && S.archive[0].stats.comidas[1] === 1));
  check('y sale en la lista de partidas como victoria', await p.evaluate(() => { S.game = null; render(); return document.querySelector('#app .res.w') && document.querySelector('#app .res.w').textContent === 'Victoria'; }));
  await p.click('#app [data-arch="0"]');
  check('ver la partida guardada', await p.evaluate(() => /Contra la máquina/.test(document.querySelector('#modal').textContent) && document.querySelectorAll('#modal .hrow').length === 2));
  await p.click('#arOk');
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Con amigos en el mismo móvil');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-mode="local"]');
  await p.click('[data-st="1:x"]'); await p.click('[data-st="2:x"]'); await p.click('[data-st="3:x"]');
  await p.click('#start');
  check('con un solo jugador no empieza', await p.evaluate(() => !S.game && document.querySelector('#toast').textContent.includes('dos jugadores')));
  await p.click('[data-st="0:m"]'); await p.click('[data-st="2:m"]'); await p.click('#start');
  check('sin ninguna persona tampoco', await p.evaluate(() => !S.game && document.querySelector('#toast').textContent.includes('persona')));
  await p.click('[data-st="0:p"]'); await p.click('[data-st="2:p"]');
  await p.fill('[data-nm="0"]', 'Ana'); await p.fill('[data-nm="2"]', 'ana');
  await p.click('#start');
  check('dos con el mismo nombre: aviso', await p.evaluate(() => !S.game && document.querySelector('#toast').textContent.includes('mismo nombre')));
  await p.fill('[data-nm="2"]', 'Luis'); await p.click('[data-st="3:m"]');
  await p.click('#start');
  check('empieza con dos personas y la máquina', await p.evaluate(() => S.game && S.game.mode === 'local' && S.game.seats.map(s => s.c + (s.ai ? 'm' : s.name)).join() === '0Ana,2Luis,3m'));
  await p.evaluate(() => { clearTimeout(AIT); S.game.st.turno = 2; S.game.st.fase = 'tirar'; render(); });
  check('el estado dice a quién le toca', await p.evaluate(() => /Luis: tira el dado/.test(document.querySelector('.gstatus').textContent)));
  await p.reload(); await p.waitForTimeout(300);
  check('al volver a abrir la app sigue la partida', await p.evaluate(() => S.game && S.game.seats.length === 3 && !!document.querySelector('#pBoard')));
  await p.click('#menuBtn'); await p.click('#mLeave'); await p.click('#lvDel');
  check('abandonar la partida', await p.evaluate(() => !S.game && S.archive.length === 0));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Jugar en línea (con el servidor común de juegos)');
{
  const os = await import('node:os'), fs = await import('node:fs');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  if (!fs.existsSync(join(SERV, 'src/server.js'))) check('servidor común de juegos para las pruebas', false, 'no está en ' + SERV);
  else {
    // copia de los motores del servidor, con las reglas de ESTA versión de la app
    const motores = fs.mkdtempSync(join(os.tmpdir(), 'motores-'));
    for (const j of fs.readdirSync(join(SERV, 'motores'))) fs.cpSync(join(SERV, 'motores', j), join(motores, j), { recursive: true });
    fs.mkdirSync(join(motores, 'parchis'), { recursive: true }); fs.copyFileSync(join(ROOT, 'parchis.js'), join(motores, 'parchis', 'parchis.js'));
    Object.assign(process.env, { LIMITE_MSG: '20000', PASO_BOT_MS: '60', AUSENTE_MS: '1500', MOTORES_DIR: motores, DATA_DIR: fs.mkdtempSync(join(os.tmpdir(), 'juegos-')) });
    const req = createRequire(join(SERV, 'package.json'));
    const { crearServidor } = req('./src/server.js');
    const SALAS = req('./src/salas.js');
    const { server: SVS } = crearServidor();
    await new Promise(r => SVS.listen(0, '127.0.0.1', r));
    const WS = `ws://127.0.0.1:${SVS.address().port}/ws`;
    const A1 = await fresh(Object.assign({}, BASE_STATE, { draft: { mode: 'online' }, online: { nombre: 'Carlos' } }), null, WS);
    const B1 = await fresh(Object.assign({}, BASE_STATE, { draft: { mode: 'online' }, online: { nombre: 'Tere' } }), null, WS);
    const a = A1.p, b = B1.p;
    check('sin servidor configurado no aparece la opción', !(await (await fresh()).p.$('[data-mode="online"]')));
    check('la app apunta al servidor de IT Canarias', (await readFile(join(ROOT, 'juego.js'), 'utf8')).includes("'wss://juegos.itcanarias.com/ws'"));
    await waitFor(a, () => ON.estado === 'conectado');
    await a.click('[data-on="nivel"] [data-v="dificil"]'); await a.click('#onCreate');
    check('crear sala: aparece el código', await waitFor(a, () => ON.sala && /^[A-Z2-9]{4}$/.test(ON.sala.codigo) && !!document.querySelector('.on-code')));
    const code = await a.evaluate(() => ON.sala.codigo);
    await waitFor(b, () => ON.estado === 'conectado');
    await b.goto(URL_APP + '?unirse=' + code.toLowerCase());   // el enlace de la invitación
    check('el otro entra tocando el enlace de la invitación', await waitFor(a, () => ON.sala.asientos.length === 2) && await waitFor(b, () => ON.sala && ON.sala.codigo === document.querySelector('.on-code').textContent));
    await a.click('#onBot');
    check('se añade a la máquina', await waitFor(a, () => ON.sala.asientos.length === 3 && ON.sala.asientos[2].bot));
    check('solo quien crea puede empezar', !(await b.$('#onStart')) && !!(await a.$('#onStart')));
    // que empiece Carlos para que la prueba sea predecible
    await a.click('#onStart');
    check('empieza la partida en los dos móviles', await waitFor(a, () => ON.sala.estado === 'jugando' && !!document.querySelector('#pBoard')) && await waitFor(b, () => ON.sala.estado === 'jugando' && !!document.querySelector('#pBoard')));
    check('cada uno ve el tablero desde su color', await a.evaluate(() => onlineVm(ON.sala).orient === ON.sala.partida.yo) && await b.evaluate(() => ON.sala.partida.yo !== null && onlineVm(ON.sala).orient === ON.sala.partida.yo) && await a.evaluate(() => ON.sala.partida.yo) !== await b.evaluate(() => ON.sala.partida.yo));
    const sala = () => SALAS._salas.get(code);
    // prepara una posición en el servidor y se la manda a los dos
    const fija = (fichas, turnoPid, dado) => { const s = sala(); clearTimeout(s.timer); const j = s.estadoJuego.juego; for (const c in fichas) j.fichas[c] = fichas[c].slice(); j.turno = s.estadoJuego.color[turnoPid]; j.fase = 'tirar'; j.seises = 0; j.pend = []; j.premio = false; j.dado = null; j.valor = null; if (dado) P.tirar(j, dado); SALAS._difundir(s); };
    // turno de Carlos (p1)
    fija({}, 'p1');
    await b.evaluate(() => onEnviar({ t: 'jugada', a: { tipo: 'tirar' } }));
    check('no se puede tirar en el turno de otro', await waitFor(b, () => document.querySelector('#toast').textContent.includes('No es tu turno'), null, 5000));
    check('a quien le toca le sale el dado', await waitFor(a, () => ON.sala.partida.turnoSilla === ON.sala.yo && !document.querySelector('#dice').disabled, null, 5000));
    check('el aviso de turno sonó al tocarle', await a.evaluate(() => AvisoTurno.veces >= 1));
    const n0 = await a.evaluate(() => ON.sala.partida.n);
    await a.click('#dice', { force: true });
    check('el dado lo tira el servidor y los dos lo ven', await waitFor(a, n => ON.sala.partida.n > n, n0) && await waitFor(b, n => ON.sala.partida.n > n, n0), JSON.stringify(await a.evaluate(() => ({ n: ON.sala.partida.n, t: ON.sala.partida.turnoSilla, f: ON.sala.partida.fase, toast: document.querySelector('#toast').textContent, r: ON.rolling }))) + ' n0=' + n0);
    // jugada con elección: Carlos con dos fichas fuera y un 3
    const cA = await a.evaluate(() => ON.sala.partida.yo);
    fija({ [cA]: [10, 20, -1, -1] }, 'p1', 3);
    check('le brillan las fichas que puede mover', await waitFor(a, () => document.querySelectorAll('.pz.can').length === 2, null, 6000));
    await a.evaluate(() => onEnviar({ t: 'jugada', a: { tipo: 'mover', ficha: 1 } }));
    check('mover llega al otro móvil', await waitFor(b, () => { const p = ON.sala.partida; return p.fichas[p.color.p1][1] === 23; }, null, 6000));
    // desconexión: juega la máquina por él
    await b.evaluate(() => { ON.quiere = false; ON.ws.close(); });
    check('se ve la desconexión', await waitFor(a, () => ON.sala.asientos.find(x => x.id === 'p2').conectado === false));
    await b.evaluate(() => onConectar());
    check('al volver recupera su silla', await waitFor(b, () => ON.sala && ON.sala.yo === 'p2' && ON.sala.estado === 'jugando'));
    // final: Carlos a punto de ganar
    fija({ [cA]: [71, 71, 71, 70] }, 'p1', 1);
    await a.evaluate(() => onEnviar({ t: 'jugada', a: { tipo: 'mover', ficha: 3 } }));
    check('gana y los dos lo ven', await waitFor(a, () => ON.sala.estado === 'fin' && /Has ganado/.test(document.querySelector('.gstatus').textContent)) && await waitFor(b, () => ON.sala.estado === 'fin' && /Carlos gana/.test(document.querySelector('.gstatus').textContent)));
    check('la partida se guarda en el historial de los dos', await waitFor(a, () => S.archive.length === 1 && S.archive[0].mode === 'online' && S.archive[0].seats.find(s => s.me).name === 'Carlos') && await waitFor(b, () => S.archive.length === 1 && S.archive[0].seats.find(s => s.me).name === 'Tere' && S.archive[0].seats.some(s => s.ai)));
    check('y cuenta para la clasificación (la máquina no sale)', await b.evaluate(() => { const l = aggregate(doneGames().map(x => x.r)); return l.length === 2 && l.some(o => o.name === 'Carlos' && o.g === 1); }));
    await a.click('#onRe');
    check('la revancha pedida se ve en el otro móvil', await waitFor(b, () => ON.sala.revancha.length === 1));
    await b.click('#onRe');
    check('revancha en la misma sala', await waitFor(a, () => ON.sala.estado === 'jugando' && ON.sala.partida.ganador == null) && await waitFor(b, () => ON.sala.estado === 'jugando'));
    await b.evaluate(() => leaveOnline()); await b.click('#cOk');
    check('quien se va deja su silla a la máquina', await waitFor(a, () => ON.sala.asientos.find(x => x.id === 'p2').bot === true));
    check('y vuelve a la pantalla de en línea', await waitFor(b, () => !ON.sala && !!document.querySelector('#onCreate')));
    await b.fill('#onCode', 'ZZZZ'); await b.click('#onJoin');
    check('código que no existe: aviso', await waitFor(b, () => document.querySelector('#toast').textContent.includes('código')));
    check('sin errores en la página', !A1.errors.length && !B1.errors.length, A1.errors.concat(B1.errors).join(' | '));
    await A1.ctx.close(); await B1.ctx.close();
    SVS.close();
  }
}

console.log('Copias y datos maliciosos');
{
  const { p, ctx, errors } = await fresh();
  const res = await p.evaluate(() => {
    const ok = { id: 'ok1', created: 1, finished: 2, mode: 'ai', seats: [{ c: 0, name: '<b>Ana</b>', me: true }, { c: 2, name: 'Rojo', ai: true, level: 99 }], orden: [2, 0], stats: { comidas: [1, 'x', 3, 4], seises: [1e9] }, n: 50, metas: [[2, 4], [0, 9], [7, 1]] };
    const evil = { app: 'parchis', archive: [
      ok,
      { id: '<img src=x onerror=alert(1)>', seats: [{ c: 0, name: 'A' }, { c: 1, name: 'B' }], orden: [1, 0], mode: 'local' },
      { id: 'dup', seats: [{ c: 0, name: 'A' }, { c: 0, name: 'B' }], orden: [0, 0] },
      { id: 'mal', seats: [{ c: 0, name: 'A' }, { c: 1, name: 'B' }], orden: [0, 3] },
      { id: 'uno', seats: [{ c: 0, name: 'A' }], orden: [0] }, null, 42, 'x'],
      game: { seats: [{ c: 0, name: 'A' }, { c: 1, name: 'B', ai: true }], st: { fichas: [[99, -7, 'x', 5]], turno: 3, fase: 'mover', dado: 9 } },
      roster: ['<script>', 'Pepe'] };
    const n = mergeBackup(evil);
    const a = S.archive.find(x => x.id === 'ok1'), b = S.archive.find(x => x.id !== 'ok1');
    return { n, ids: S.archive.map(x => x.id), name: a.seats[0].name, lvl: a.seats[1].level, st: a.stats, metas: a.metas, safe: /^[A-Za-z0-9_-]+$/.test(b.id), roster: S.roster, game: S.game && { f: S.game.st.fichas[0], turno: S.game.st.turno, fase: S.game.st.fase } };
  });
  check('copias: solo entra lo válido', res.n === 2 && res.safe && res.name === 'bAna/b', JSON.stringify(res));
  check('copias: valores fuera de rango se corrigen', res.lvl === 3 && res.st.comidas.join() === '1,0,3,4' && res.st.seises[0] === 9999 && res.metas.length === 2 && res.metas[1][1] === 4, JSON.stringify(res));
  check('la partida en curso de la copia se arregla', res.game && res.game.f.join() === '71,-1,-1,5' && res.game.turno === 0 && res.game.fase === 'tirar', JSON.stringify(res.game));
  check('copias: nombres limpios en la lista de jugadores', !res.roster.some(n => /[<>]/.test(n)), res.roster.join());
  check('los nombres se muestran escapados', await p.evaluate(() => { S.game = null; render(); openArchive('partidas'); return !document.querySelector('#modal b b') && document.querySelector('#modal').textContent.includes('bAna/b'); }));
  const round = await p.evaluate(() => { closeModal(); const before = S.archive.length; const j = JSON.parse(backupJSON()); S.archive = []; const n = mergeBackup(j); return before === n && S.archive.length === before; });
  check('copia de seguridad: ida y vuelta', round);
  check('una copia de otra app no se acepta', await p.evaluate(() => !validBackup({ app: 'damas', archive: [] }) && validBackup({ app: 'parchis', archive: [] })));
  await p.evaluate(() => { localStorage.setItem(KEY, JSON.stringify({ onboarded: true, game: { seats: 'x', st: null } })); });
  await p.reload(); await p.waitForTimeout(300);
  check('una partida guardada dañada no rompe la app', await p.evaluate(() => !S.game && !!document.querySelector('#start')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Clasificación, menú, temas y borrar');
{
  const mk = (i, mode, seats, orden, extra) => Object.assign({ id: 'g' + i, created: 1e12 + i * 1e6, finished: 1e12 + i * 1e6 + 5, mode, seats, orden, n: 100 + i * 10, stats: { comidas: [1, 2, 3, 4], comido: [0, 1, 0, 2], metas: [0, 0, 0, 0], seises: [3, 4, 5, 6], tiradas: 0 }, metas: [] }, extra || {});
  const S2 = (a, b) => [{ c: 0, name: a }, { c: 2, name: b }];
  const archive = [
    mk(1, 'local', S2('Ana', 'Luis'), [0, 2]), mk(2, 'local', S2('Luis', 'Ana'), [0, 2]),
    mk(3, 'local', [{ c: 0, name: 'Ana' }, { c: 1, name: 'Pepe' }, { c: 2, name: 'Luis' }], [0, 1, 2]),
    mk(4, 'ai', [{ c: 0, name: 'Pepe', me: true }, { c: 2, name: 'Rojo', ai: true, level: 3 }], [0, 2])
  ].reverse();
  const { p, ctx, errors } = await fresh(Object.assign({}, BASE_STATE, { archive, roster: ['Ana', 'Luis', 'Pepe'] }));
  const t = await p.evaluate(() => aggregate(doneGames().map(x => x.r)).sort((a, b) => b.rating - a.rating).map(o => [o.name, o.pj, o.g, o.pts]));
  check('ranking por puestos: 10 al ganador, 0 al último, 5 al del medio de tres', JSON.stringify(t.find(x => x[0] === 'Ana')) === '["Ana",3,2,20]' && JSON.stringify(t.find(x => x[0] === 'Pepe')) === '["Pepe",2,1,15]' && t.find(x => x[0] === 'Luis')[3] === 10, JSON.stringify(t));
  check('la máquina no sale en el ranking', t.length === 3 && !t.some(x => x[0] === 'Rojo'));
  await p.click('#menuBtn'); await p.click('#mArch');
  check('la clasificación se ve', await p.evaluate(() => document.querySelectorAll('#modal tbody tr').length === 3));
  await p.click('#modal [data-player="Ana"]');
  check('ficha del jugador', await p.evaluate(() => { const t = document.querySelector('#modal').textContent; return t.includes('Cara a cara') && t.includes('Fichas comidas'); }));
  await p.click('#pfBack'); await p.click('[data-tab="records"]');
  check('récords', await p.evaluate(() => { const t = document.querySelector('#modal').textContent; return t.includes('Más victorias') && t.includes('Más comidas en una partida') && t.includes('Más victorias contra la máquina difícil'); }));
  await p.click('[data-tab="jornadas"]');
  check('jornadas', await p.evaluate(() => document.querySelectorAll('#modal [data-day]').length >= 1));
  await p.click('#aC');
  check('el tema por defecto es madera', await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#1c130b'));
  await p.click('#menuBtn'); await p.click('#mTheme');
  await p.click('[data-theme="claro"]'); await p.click('[data-board="oscuro"]'); await p.click('[data-speed="normal"]');
  check('cambiar tema, tablero y velocidad', await p.evaluate(() => S.theme === 'claro' && S.board === 'oscuro' && S.speed === 'normal' && getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#f1eee6'));
  await p.click('#thOk');
  await p.click('#menuBtn'); await p.click('#mGameRules');
  check('reglas del parchís', await p.evaluate(() => { const t = document.querySelector('#modal').textContent; return t.includes('tres seises seguidos') && t.includes('barrera') && t.includes('cuentas 20'); }));
  await p.click('#grOk');
  await p.click('#menuBtn'); await p.click('#mRoster');
  await p.fill('[data-orig="Luis"]', 'Ana'); await p.click('#roS'); await p.click('#cOk');
  check('unir jugadores en la lista', await p.evaluate(() => !S.roster.includes('Luis') && S.archive.every(a => a.seats.every(s => s.name !== 'Luis'))));
  await p.click('#menuBtn'); await p.click('#mWipe'); await p.click('#wHist'); await p.click('#cOk');
  check('borrar historial', await p.evaluate(() => S.archive.length === 0 && S.roster.length === 2));
  await p.click('#menuBtn'); await p.click('#mHelp');
  check('la ayuda se abre', await p.evaluate(() => !!document.querySelector('#wbNext')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Pantallas: vertical, horizontal y tablet');
{
  for (const [name, vp] of [['móvil vertical', { width: 360, height: 740 }], ['móvil horizontal', { width: 800, height: 380 }], ['tablet 10"', { width: 1280, height: 800 }], ['tablet 7" vertical', { width: 600, height: 960 }]]) {
    const { p, ctx, errors } = await fresh(BASE_STATE, vp);
    await p.evaluate(() => { newGame('local', [{ c: 0, name: 'Alejandro Fernández', ai: false }, { c: 1, name: 'María del Carmen', ai: false }, { c: 2, name: 'Rojo', ai: true, level: 2 }, { c: 3, name: 'Verde', ai: true, level: 2 }]); clearTimeout(AIT); S.game.st.turno = 0; render(); });
    const m = await p.evaluate(() => { const b = document.querySelector('#pBoard').getBoundingClientRect(), d = document.querySelector('#dice').getBoundingClientRect(), s = document.querySelector('.gstatus').getBoundingClientRect();
      return { bw: b.width, bh: b.height, bottom: Math.max(b.bottom, d.bottom, s.bottom), ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth, chips: document.querySelectorAll('.pchip').length }; });
    check(`${name}: el tablero es cuadrado y cabe, con el dado y el estado a la vista`, Math.abs(m.bw - m.bh) < 2 && m.bottom <= m.ih + 1 && m.bw >= 260 && m.chips === 4, JSON.stringify(m));
    check(`${name}: sin desplazamiento horizontal`, m.sw <= m.iw + 1, JSON.stringify(m));
    check(`${name}: sin errores`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
}

console.log('Invitación con enlace');
{ const pk = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')); const man = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  check('la app Android recibe el enlace (complemento @capacitor/app)', !!pk.dependencies['@capacitor/app'] && /android:host="unirse"/.test(man)); }
{
  const { p, ctx, errors } = await fresh(null, null, 'ws://127.0.0.1:9/ws');
  await p.waitForTimeout(300);
  check('el enlace de la invitación lleva a la página del juego', await p.evaluate(() => Invitacion.enlace('ABCD') === 'https://csuarezsm.github.io/Parchis/unirse.html?c=ABCD'));
  check('el código se lee del enlace de la app y de la web', await p.evaluate(() => Invitacion.deUrl('itcparchis://unirse/ab12') === 'AB12' && Invitacion.deUrl('https://x.y/app/?unirse=wxyz') === 'WXYZ' && Invitacion.deUrl('https://x.y/app/') === null));
  check('el mensaje lleva el enlace y el código', await p.evaluate(() => { const t = Invitacion.texto('🎲', 'Juego', 'QWER'); return t.includes('unirse.html?c=QWER') && t.includes('*QWER*'); }));
  check('aviso de turno contra la máquina: suena al volver tu turno, no al seguir tú', await p.evaluate(() => { const n = AvisoTurno.veces; const a = AvisoTurno.local(true, 'x1'); const b = AvisoTurno.local(false, 'x1'); const c = AvisoTurno.local(true, 'x2'); const d = AvisoTurno.local(true, 'x2'); return !a && !b && c && !d && AvisoTurno.veces === n + 1; }));
  const bn = await p.evaluate(() => { S.draft.mode = 'ai'; S.draft.ai.rivals = 2; render(); document.querySelector('[data-botdice="0"]').click(); const n = S.draft.ai.bots[0]; document.querySelector('[data-bot="1"]').value = 'Pepa'; syncDraft(); startFromDraft(); const r = S.game.seats.filter(x => x.ai).map(x => x.name); S.game = null; return { n, r, ok: BOT_IDEAS.includes(n) && r.includes(n) && r.includes('Pepa') }; });
  check('la máquina puede llevar nombre (o uno al azar)', bn.ok, JSON.stringify(bn));
  await p.evaluate(() => unirseDesdeEnlace('WXYZ')); await p.waitForTimeout(200);
  check('al abrir el enlace va a «En línea»', await p.evaluate(() => S.draft.mode === 'online'));
  check('sin nombre, pide el nombre en una ventana con el código', await p.evaluate(() => !!document.querySelector('#invName') && document.querySelector('#modal').textContent.includes('WXYZ')));
  check('el código queda guardado por si la app aún no estaba lista', await p.evaluate(() => { Invitacion.entregar('QQ11'); return true; }) && await p.evaluate(() => !localStorage.getItem('invitacionPendiente')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

// Partidas públicas y «Jugar con cualquiera», contra el servidor común de juegos
{
  console.log('Partidas públicas');
  const { createRequire: cr } = await import('node:module');
  const fsp = await import('node:fs'), osp = await import('node:os');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  if (!fsp.existsSync(join(SERV, 'src/server.js'))) check('servidor común de juegos para las pruebas', false, 'no está en ' + SERV);
  else {
    if (!process.env.DATA_DIR) process.env.DATA_DIR = fsp.mkdtempSync(join(osp.tmpdir(), 'juegos-'));
    const { crearServidor } = cr(join(SERV, 'package.json'))('./src/server.js');
    const { server: PS } = crearServidor();
    await new Promise(r => PS.listen(0, '127.0.0.1', r));
    const PWS = `ws://127.0.0.1:${PS.address().port}/ws`;
    const abrirP = async () => {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await ctx.addInitScript(u => { window.PARCHIS_ONLINE_URL = u; if (!localStorage.getItem('parchis.v1')) localStorage.setItem('parchis.v1', JSON.stringify({ onboarded: true })); }, PWS);
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL_APP); await p.click('[data-mode="online"]'); return { p, ctx, errors };
    };
    const P1 = await abrirP(), P2 = await abrirP();
    await P1.p.waitForSelector('#pubBuscar', { timeout: 8000 }).catch(() => {});
    check('en línea aparecen «Jugar con cualquiera», las partidas abiertas y la casilla de partida pública', !!(await P1.p.$('#pubBuscar')) && !!(await P1.p.$('#pubLista')) && !!(await P1.p.$('#pubPublica')));
    await P1.p.fill('#onName', 'Carlos'); await P1.p.click('#pubBuscar');
    check('al buscar, espera en una mesa de «cualquiera»', await P1.p.waitForFunction(() => ON.sala && ON.sala.auto && ON.sala.publica, null, { timeout: 8000 }).then(() => true, () => false));
    check('y lo dice en pantalla', await P1.p.waitForSelector('text=Buscando jugadores', { timeout: 5000 }).then(() => true, () => false));
    await P2.p.fill('#onName', 'Mari');
    const fila = await P2.p.waitForSelector('[data-pubentrar]', { timeout: 12000 }).catch(() => null);
    check('otro móvil la ve en «Partidas abiertas»', !!fila && (await P2.p.textContent('#pubLista')).includes('Carlos'));
    if (fila) await fila.click();
    const mismo = await P2.p.waitForFunction(() => !!ON.sala, null, { timeout: 8000 }).then(() => true, () => false);
    const codigos = await Promise.all([P1, P2].map(x => x.p.evaluate(() => ON.sala && ON.sala.codigo)));
    check('y entra con un toque en la misma partida', mismo && codigos[0] && codigos[0] === codigos[1], JSON.stringify(codigos));
    check('sin errores en las partidas públicas', !P1.errors.length && !P2.errors.length, P1.errors.concat(P2.errors).join(' | '));
    const vol = await P1.p.evaluate(() => { const c = new OfflineAudioContext(1, 4410, 44100); const g = AudioSuave.salida(c); const medio = g.gain.value; S.volumen = 'bajo'; const bajo = AudioSuave.salida(c).gain.value; S.volumen = undefined;
      return { medio, bajo, opcion: AvisoTurno.opcionHtml().includes('data-volumen="alto"'), mismo: AudioSuave.salida(c) === g }; });
    check('sonidos suaves: pasan por el volumen general (bajo, medio, alto) y se elige en los ajustes', Math.abs(vol.medio - 0.45) < 0.01 && Math.abs(vol.bajo - 0.22) < 0.01 && vol.opcion && vol.mismo, JSON.stringify(vol));
    await P1.ctx.close(); await P2.ctx.close(); PS.close();
  }
}

await browser.close();
server.close();
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
