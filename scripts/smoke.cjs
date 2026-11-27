// Browser smoke test. Starts the dev server, drives the page with Playwright,
// prints one line per check and exits non-zero if any check fails.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 4311;
const URL = `http://localhost:${PORT}/`;
let failed = 0;
function report(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
}
async function check(name, fn) {
  try { const detail = await fn(); report(name, true, typeof detail === 'string' ? detail : ''); }
  catch (e) { report(name, false, String(e.message).split('\n')[0]); }
}
const gen = async (page) => Number((await page.textContent('#stat-gen')).trim());
async function setRange(page, selector, value) {
  await page.evaluate(([sel, v]) => {
    const el = document.querySelector(sel);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [selector, String(value)]);
}
async function openAdvanced(page) {
  if (!(await page.evaluate(() => document.querySelector('details.advanced').open))) await page.click('details.advanced summary');
}
/** Loads the page in a fresh context whose storage holds `stored` before any page script runs. */
async function freshPageWithStorage(browser, url, stored) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((value) => { try { localStorage.setItem('rennlabor:fahren', value); } catch { /* ignore */ } }, stored);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url);
  await p.waitForSelector('#stat-gen');
  const generation = Number((await p.textContent('#stat-gen')).trim());
  const usable = await p.evaluate(() => !document.querySelector('#btn-start').disabled);
  await ctx.close();
  if (errs.length) throw new Error(errs.join(' | '));
  if (generation !== 0) throw new Error(`Generation ist ${generation}`);
  if (!usable) throw new Error('Start ist deaktiviert');
}
async function waitGen(page, min, ms) {
  await page.waitForFunction((m) => Number(document.querySelector('#stat-gen').textContent) >= m, min, { timeout: ms });
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const noErrors = () => { if (errors.length) { const e = errors.splice(0).join(' | '); throw new Error(e); } };

  try {
    await check('Seite lädt ohne Konsolenfehler, Generation 0', async () => {
      await page.goto(URL);
      await page.waitForSelector('#stat-gen');
      if ((await gen(page)) !== 0) throw new Error('Generation ist nicht 0');
      noErrors();
    });

    await check('vor dem Start ist die Strecke schon gezeichnet', async () => {
      const colours = await page.evaluate(() => {
        const c = document.querySelector('#cv-track');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
        return seen.size;
      });
      if (colours < 3) throw new Error(`nur ${colours} Farben`);
    });

    await check('Training bei max erreicht Generation 3', async () => {
      await page.click('#speed-max');
      await page.click('#btn-start');
      await waitGen(page, 3, 30000);
      noErrors();
    });

    await check('langer blockierter Frame: Training läuft danach normal weiter', async () => {
      await page.click('#speed-1');
      const before = await gen(page);
      await page.evaluate(() => { const end = performance.now() + 5000; while (performance.now() < end) { /* block */ } });
      const worst = await page.evaluate(() => new Promise((resolve) => {
        let last = performance.now(), max = 0, n = 0;
        const tick = (now) => { max = Math.max(max, now - last); last = now; if (++n < 20) requestAnimationFrame(tick); else resolve(max); };
        requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
      }));
      if (worst > 200) throw new Error(`Frame dauerte ${worst | 0} ms`);
      await page.click('#speed-max');
      await waitGen(page, before + 1, 30000);
      noErrors();
    });

    await check('Regler ändern die Mutation', async () => {
      await openAdvanced(page);
      await setRange(page, '#mut-rate', 0.3);
      const shown = await page.textContent('#mut-rate-value');
      if (!shown.includes('30')) throw new Error(`Anzeige: ${shown}`);
      await setRange(page, '#mut-sigma', 0.2);
      const sigma = await page.textContent('#mut-sigma-value');
      if (!sigma.includes('0,20')) throw new Error(`Anzeige: ${sigma}`);
      noErrors();
    });

    await check('Stand übersteht ein Neuladen', async () => {
      const before = await gen(page);
      await page.click('#btn-start'); // pause
      await page.reload();
      await page.waitForSelector('#stat-gen');
      const after = await gen(page);
      if (after < 3 || after < before - 1) throw new Error(`vorher ${before}, nachher ${after}`);
      noErrors();
    });

    await check('kaputter gespeicherter Stand: Seite startet frisch', async () => {
      await freshPageWithStorage(browser, URL, '{kaputt');
    });

    await check('veralteter gespeicherter Stand: Seite startet frisch', async () => {
      await freshPageWithStorage(browser, URL, JSON.stringify({ version: 0, genomes: [] }));
    });

    await check('gespeicherter Stand mit kaputten Gewichten: Seite startet frisch', async () => {
      await freshPageWithStorage(browser, URL, JSON.stringify({ version: 1, rules: 'fahren', genomes: ['###'] }));
    });

    await check('Seed-Feld: Unsinn gibt Hinweis, Zahl wird übernommen', async () => {
      await openAdvanced(page);
      const before = await gen(page);
      await page.fill('#seed', 'abc');
      await page.click('#btn-reset');
      if (!(await page.isVisible('#seed-hint'))) throw new Error('kein Hinweis');
      if ((await gen(page)) !== before) throw new Error('Unsinn hat das Training zurückgesetzt');
      await page.fill('#seed', '77');
      await page.click('#btn-reset');
      if ((await page.inputValue('#seed')) !== '77') throw new Error('Seed nicht übernommen');
      if (await page.isVisible('#seed-hint')) throw new Error('Hinweis bleibt stehen');
      noErrors();
    });

    await check('Zurücksetzen ohne Eingabe würfelt einen neuen Seed', async () => {
      await page.fill('#seed', '');
      await page.click('#btn-reset');
      const a = await page.inputValue('#seed');
      await page.fill('#seed', '');
      await page.click('#btn-reset');
      const b = await page.inputValue('#seed');
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || a === b) throw new Error(`${a} / ${b}`);
      if ((await gen(page)) !== 0) throw new Error('Generation nicht zurückgesetzt');
      noErrors();
    });

    await check('Probefahrt: ohne trainiertes Auto ist der Knopf aus', async () => {
      if (!(await page.isDisabled('#btn-probe'))) throw new Error('Knopf ist aktiv');
    });

    await check('Probefahrt auf neuer Zufallsstrecke liefert ein Ergebnis', async () => {
      await page.click('#speed-max');
      await page.click('#btn-start');
      await waitGen(page, 6, 60000);
      await page.click('#btn-probe');
      await page.waitForFunction(() => {
        const el = document.querySelector('#probe-msg');
        return !el.hidden && /Runde geschafft|Wandkontakt|Stehen geblieben|Zeit abgelaufen/.test(el.textContent);
      }, null, { timeout: 60000 });
      const before = await gen(page);
      await page.waitForTimeout(600);
      if ((await gen(page)) !== before) throw new Error('Training läuft während der Probefahrt weiter');
      await page.click('#btn-start'); // resume
      await waitGen(page, before + 1, 30000);
      await page.click('#btn-start'); // pause
      noErrors();
    });

    const drawOn = async (points) => {
      const box = await page.locator('#cv-draw').boundingBox();
      const at = (p) => [box.x + p[0] * box.width, box.y + p[1] * box.height];
      await page.mouse.move(...at(points[0]));
      await page.mouse.down();
      for (const p of points.slice(1)) await page.mouse.move(...at(p));
      await page.mouse.up();
    };
    const circle = Array.from({ length: 73 }, (_, i) => [0.5 + 0.2 * Math.cos((i / 72) * 2 * Math.PI), 0.5 + 0.32 * Math.sin((i / 72) * 2 * Math.PI)]);
    const eight = Array.from({ length: 97 }, (_, i) => { const a = (i / 96) * 2 * Math.PI; return [0.5 + 0.35 * Math.sin(a), 0.5 + 0.6 * Math.sin(a) * Math.cos(a)]; });

    await check('Zeichnen: Kreis wird zur Strecke, bestes Auto fährt', async () => {
      await page.click('#tab-zeichnen');
      await page.waitForSelector('#cv-draw', { state: 'visible' });
      if (!(await page.isDisabled('#btn-draw-go'))) throw new Error('Knopf vor dem Zeichnen aktiv');
      await drawOn(circle);
      await page.waitForFunction(() => !document.querySelector('#btn-draw-go').disabled, null, { timeout: 5000 });
      await page.click('#btn-draw-go');
      await page.waitForFunction(() => {
        const el = document.querySelector('#draw-result');
        return !el.hidden && /Runde geschafft|Wandkontakt|Stehen geblieben|Zeit abgelaufen/.test(el.textContent);
      }, null, { timeout: 90000 });
      noErrors();
    });

    await check('Zeichnen: Breite ändern baut die Strecke neu', async () => {
      await setRange(page, '#draw-width', 6);
      const shown = await page.textContent('#draw-width-value');
      if (!shown.includes('12')) throw new Error(`Anzeige: ${shown}`);
      if (await page.isDisabled('#btn-draw-go')) throw new Error('Strecke ging verloren');
      noErrors();
    });

    await check('Zeichnen: einzelner Klick wird verständlich abgelehnt', async () => {
      await drawOn([[0.3, 0.3]]);
      const msg = await page.textContent('#draw-msg');
      if (!msg.includes('noch keine Strecke')) throw new Error(`Meldung: ${msg}`);
      if (!(await page.isDisabled('#btn-draw-go'))) throw new Error('Knopf aktiv');
      noErrors();
    });

    await check('Zeichnen: Acht wird als Kreuzung abgelehnt', async () => {
      await drawOn(eight);
      const msg = await page.textContent('#draw-msg');
      if (!msg.includes('kreuzt sich')) throw new Error(`Meldung: ${msg}`);
      noErrors();
    });

    await check('Zeichnen: Strich über den Rand hinaus stört nicht', async () => {
      await drawOn([[0.2, 0.2], [0.8, 0.2], [1.3, 0.5], [0.8, 0.9], [0.2, 0.9], [-0.3, 0.5], [0.2, 0.25]]);
      await page.waitForTimeout(100);
      noErrors();
    });

    await check('Zeichnen: Löschen leert die Fläche', async () => {
      await drawOn(circle);
      await page.click('#btn-draw-clear');
      if (!(await page.isDisabled('#btn-draw-go'))) throw new Error('Knopf aktiv');
      await page.click('#tab-training');
      await page.waitForSelector('#cv-track', { state: 'visible' });
      noErrors();
    });

    await check('ohne Speicher (gesperrt) bleibt die Seite bedienbar', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(URL);
      await p.click('#speed-max');
      await p.click('#btn-start');
      await waitGen(p, 1, 30000);
      await ctx.close();
      if (errs.length) throw new Error(errs.join(' | '));
    });

    await check('400 px breit: kein horizontales Scrollen', async () => {
      await page.setViewportSize({ width: 400, height: 800 });
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) throw new Error(`${over} px zu breit`);
      await page.setViewportSize({ width: 1280, height: 900 });
      noErrors();
    });

    await check('dunkles Thema: dunkler Hintergrund', async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g).map(Number);
      if (r + g + b > 180) throw new Error(bg);
      await page.emulateMedia({ colorScheme: 'light' });
      noErrors();
    });

    if (process.env.SMOKE_SHOTS) {
      const dir = process.env.SMOKE_SHOTS;
      await page.click('#speed-1');
      await page.click('#btn-start');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(dir, 'light.png'), fullPage: true });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(dir, 'dark.png'), fullPage: true });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 400, height: 800 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(dir, 'phone.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nalle Prüfungen bestanden');
  process.exit(failed ? 1 : 0);
})();
