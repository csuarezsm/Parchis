// Genera las capturas y gráficos para la ficha de Google Play.
// Uso (desde la raíz del repo): node play-store/capturas.mjs [movil|tablet7|tablet10]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = ROOT + 'play-store/';
const APP = 'file://' + ROOT + 'www/index.html';
const b = await chromium.launch();

// Datos de ejemplo: partidas terminadas para la clasificación
const seed = () => {
  const names = ['Carlos', 'Tere', 'Aitor', 'Lola']; let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const base = new Date(2026, 9, 1, 20).getTime();
  for (let i = 0; i < 40; i++) {
    const ai = rnd() < 0.35, n = ai ? 4 : 2 + Math.floor(rnd() * 3);
    const cols = [0, 1, 2, 3].slice(0, n);
    const ppl = names.slice().sort(() => rnd() - 0.5);
    const seats = cols.map((c, k) => ai && k > 0 ? { c, name: COL[c].n, ai: true, level: 2 + (i % 2) } : { c, name: ppl[k], ai: false, me: ai || undefined });
    const orden = cols.slice().sort(() => rnd() - 0.5);
    const st = { comidas: [0, 0, 0, 0], comido: [0, 0, 0, 0], metas: [0, 0, 0, 0], seises: [0, 0, 0, 0], tiradas: 0 };
    cols.forEach(c => { st.comidas[c] = Math.floor(rnd() * 7); st.comido[c] = Math.floor(rnd() * 6); st.seises[c] = 5 + Math.floor(rnd() * 15); });
    S.archive.unshift({ id: 'demo' + i, created: base + i * 864e5 / 2, finished: base + i * 864e5 / 2 + 1800e3, mode: ai ? 'ai' : 'local', seats, orden, stats: st,
      metas: orden.map((c, k) => [c, k === 0 ? 4 : Math.max(0, 3 - k)]), n: 180 + Math.floor(rnd() * 200) });
  }
  S.roster = names.slice(); save();
};
// Prepara cada pantalla dentro de la app (se ejecuta en el navegador)
const setup = async (name) => {
  const mid = () => {
    const g = S.game, f = g.st.fichas;
    f[0] = [5, 30, P.CASA, 66]; f[1] = [12, 12, 40, P.CASA]; f[2] = [P.META, 50, 20, P.CASA]; f[3] = [2, 44, P.CASA, P.CASA];
    g.st.stats.comidas = [2, 1, 3, 0]; g.st.n = 64;
    g.log = ['Rojo se come una ficha de Verde: cuenta 20.', 'Azul saca un 6.', 'Azul mueve 6.'];
  };
  if (name === '1-partida') {
    newGame('ai', [{ c: 0, name: 'Carlos', ai: false, me: true }, { c: 1, name: 'Azul', ai: true, level: 2 }, { c: 2, name: 'Rojo', ai: true, level: 2 }, { c: 3, name: 'Verde', ai: true, level: 2 }]);
    mid(); const g = S.game; g.st.turno = 0; g.st.fase = 'mover'; g.st.dado = 4; g.st.valor = 4; g.lastDie = 4; ANIM_KEY = evKey(gameVm(g)); render();
  }
  if (name === '2-inicio') { S.game = null; S.draft.mode = 'ai'; S.draft.ai = Object.assign(S.draft.ai, { name: 'Carlos', level: 2, rivals: 3 }); render(); }
  if (name === '3-amigos') { S.game = null; S.draft.mode = 'local'; S.draft.local.seats = [{ t: 'p', name: 'Aitor' }, { t: 'p', name: 'Lola' }, { t: 'p', name: 'Tere' }, { t: 'm', name: '' }]; render(); }
  if (name === '4-final') {
    newGame('local', [{ c: 0, name: 'Aitor', ai: false }, { c: 1, name: 'Lola', ai: false }, { c: 2, name: 'Tere', ai: false }, { c: 3, name: 'Verde', ai: true, level: 3 }]);
    const g = S.game, f = g.st.fichas;
    f[0] = [P.META, P.META, 60, 69]; f[1] = [P.META, P.META, P.META, P.META]; f[2] = [P.META, 40, 30, 10]; f[3] = [20, P.CASA, 5, 33];
    g.st.ganador = 1; g.st.fase = 'fin'; g.st.orden = P.clasificar(g.st); g.st.stats = { comidas: [3, 5, 2, 4], comido: [4, 1, 3, 6], metas: [2, 4, 1, 0], seises: [12, 15, 9, 11], tiradas: 260 }; g.st.n = 260;
    g.done = true; ANIM_KEY = evKey(gameVm(g)); render();
  }
  if (name === '5-clasificacion') { S.game = null; render(); openArchive('ranking'); }
};
const SHOTS = ['1-partida', '2-inicio', '3-amigos', '4-final', '5-clasificacion'];
const SIZES = [
  ['movil', 405, 720, 1080 / 405],
  ['tablet7', 600, 960, 2],
  ['tablet10', 1280, 800, 1.5],
];
const only = process.argv[2];
for (const [dev, w, h, dsf] of SIZES) {
  if (only && only !== dev) continue;
  for (const name of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: dev === 'movil', hasTouch: true });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.PARCHIS_ONLINE_URL = ''; }); await p.addInitScript(() => { if (!sessionStorage.s) { localStorage.setItem('parchis.v1', JSON.stringify({ onboarded: true, iosHint: true })); sessionStorage.s = 1; } });
    await p.goto(APP); await p.evaluate(seed); await p.evaluate(setup, name); await p.evaluate(() => document.querySelector('#toast').classList.remove('on')); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}${dev}-${name}.png` });
    await ctx.close();
  }
}
// Icono 512 y gráfico destacado 1024×500
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<img src="data:image/png;base64,${readFileSync(ROOT + 'assets/icon-only.png').toString('base64')}" style="width:512px;height:512px;display:block">`);
await p.screenshot({ path: OUT + 'icono-512.png', clip: { x: 0, y: 0, width: 512, height: 512 } });
const q = await b.newPage({ viewport: { width: 1024, height: 500 } });
await q.setContent(`<html><body style="margin:0;width:1024px;height:500px;background:radial-gradient(circle at 30% 50%,#4a3520,#1c130b 70%);font-family:system-ui,Roboto,sans-serif;display:flex;align-items:center;gap:56px;padding:0 70px;box-sizing:border-box;color:#f8efe3">
  <img src="data:image/png;base64,${readFileSync(ROOT + 'assets/icon-only.png').toString('base64')}" style="width:300px;height:300px;border-radius:64px;box-shadow:0 18px 50px rgba(0,0,0,.45)">
  <div><div style="font-size:104px;font-weight:900;letter-spacing:2px;color:#f4c13d;line-height:1">PARCHÍS</div>
  <div style="font-size:31px;font-weight:600;margin-top:18px;line-height:1.3">El de siempre, de 2 a 4<br>contra la máquina, con amigos<br>o en línea</div>
  <div style="font-size:24px;color:#cdb89d;margin-top:18px">3 niveles · Ranking · Récords · Sin anuncios</div></div></body></html>`, { waitUntil: 'domcontentloaded' });
await q.waitForTimeout(500);
await q.screenshot({ path: OUT + 'grafico-destacado-1024x500.png' });
await b.close();
console.log('Listo: play-store/');
