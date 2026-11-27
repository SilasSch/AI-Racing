// Learning curve: three stacked panels over the same generation axis.
// One scale per panel, never two scales in one plot.
//   A  average speed: training (best car) and test tracks, same measure
//   B  unknown tracks completed, out of 20
//   C  difficulty of the training tracks

const KMH = 3.6;
const PAD = { left: 44, right: 74, top: 22 };
const PANEL = { a: 150, b: 74, c: 30, gap: 34, axis: 40 };
const GOAL = 16;

const fmt = (v, digits = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function niceStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

export function createChart(svg, tip, table) {
  let history = [], tests = [], geometry = null;

  function render() {
    const width = Math.max(300, svg.parentElement.clientWidth);
    const height = PAD.top + PANEL.a + PANEL.gap + PANEL.b + PANEL.gap + PANEL.c + PANEL.axis;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    const x0 = PAD.left, x1 = width - PAD.right;
    const maxGen = Math.max(20, history.length);
    const x = (gen) => x0 + ((x1 - x0) * (gen - 1)) / (maxGen - 1);

    const topA = PAD.top, topB = topA + PANEL.a + PANEL.gap, topC = topB + PANEL.b + PANEL.gap;
    let maxSpeed = 60;
    for (const h of history) maxSpeed = Math.max(maxSpeed, h.best * KMH);
    for (const t of tests) maxSpeed = Math.max(maxSpeed, t.meanSpeed * KMH);
    const stepA = niceStep(maxSpeed, 4);
    maxSpeed = Math.ceil(maxSpeed / stepA) * stepA;
    const yA = (v) => topA + PANEL.a * (1 - v / maxSpeed);
    const yB = (v) => topB + PANEL.b * (1 - v / 20);
    const yC = (v) => topC + PANEL.c * (1 - v);
    geometry = { x, x0, x1, maxGen, topA, bottom: topC + PANEL.c };

    const out = [];
    const line = (xa, ya, xb, yb, cls) => out.push(`<line x1="${xa.toFixed(1)}" y1="${ya.toFixed(1)}" x2="${xb.toFixed(1)}" y2="${yb.toFixed(1)}" class="${cls}"/>`);
    const text = (tx, ty, str, cls = '', anchor = 'start') => out.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" class="${cls}">${str}</text>`);

    // panel A
    text(x0, topA - 8, 'Durchschnittstempo in km/h', 'title');
    for (let v = 0; v <= maxSpeed + 1e-9; v += stepA) {
      line(x0, yA(v), x1, yA(v), v === 0 ? 'axis' : 'gridline');
      text(x0 - 8, yA(v) + 4, fmt(v), '', 'end');
    }
    // panel B
    text(x0, topB - 8, 'Unbekannte Strecken geschafft, von 20', 'title');
    for (const v of [0, 10, 20]) {
      line(x0, yB(v), x1, yB(v), v === 0 ? 'axis' : 'gridline');
      text(x0 - 8, yB(v) + 4, String(v), '', 'end');
    }
    line(x0, yB(GOAL), x1, yB(GOAL), 'goal');
    text(x1 + 8, yB(GOAL) + 4, `Ziel ${GOAL}`);
    // panel C
    text(x0, topC - 8, 'Schwierigkeit der Trainingsstrecken, von 10', 'title');
    line(x0, yC(0), x1, yC(0), 'axis');
    text(x0 - 8, yC(1) + 4, '10', '', 'end');
    text(x0 - 8, yC(0) + 4, '0', '', 'end');

    // x axis
    const stepX = niceStep(maxGen, Math.max(3, Math.floor((x1 - x0) / 90)));
    for (let g = stepX; g <= maxGen; g += stepX) {
      line(x(g), yC(0), x(g), yC(0) + 4, 'axis');
      text(x(g), yC(0) + 17, String(g), '', 'middle');
    }
    text((x0 + x1) / 2, yC(0) + 34, 'Generation', '', 'middle');

    if (!history.length) {
      text((x0 + x1) / 2, topA + PANEL.a / 2, 'Noch keine Generation gefahren. Drück auf Start.', 'empty', 'middle');
    } else {
      // difficulty as steps
      let d = `M${x(1).toFixed(1)} ${yC(0).toFixed(1)}`;
      history.forEach((h, i) => {
        const left = i === 0 ? x(1) : (x(h.gen - 1) + x(h.gen)) / 2;
        const right = i === history.length - 1 ? x(h.gen) : (x(h.gen) + x(h.gen + 1)) / 2;
        d += `L${left.toFixed(1)} ${yC(h.difficulty).toFixed(1)}L${right.toFixed(1)} ${yC(h.difficulty).toFixed(1)}`;
      });
      d += `L${x(history.at(-1).gen).toFixed(1)} ${yC(0).toFixed(1)}Z`;
      out.push(`<path d="${d}" class="diff"/>`);

      const path = (points) => points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
      const train = history.map((h) => [x(h.gen), yA(h.best * KMH)]);
      out.push(`<path d="${path(train)}" class="s1"/>`);
      const testA = tests.map((t) => [x(t.gen), yA(t.meanSpeed * KMH)]);
      const testB = tests.map((t) => [x(t.gen), yB(t.passed)]);
      if (tests.length) {
        out.push(`<path d="${path(testA)}" class="s2"/>`, `<path d="${path(testB)}" class="s2"/>`);
        const r = tests.length > 40 ? 2.5 : 4;
        for (const [px, py] of [...testA, ...testB]) out.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" class="dot2"/>`);
      }
      // direct labels at the line ends, kept apart
      let ly1 = train.at(-1)[1] + 4;
      if (tests.length) {
        let ly2 = testA.at(-1)[1] + 4;
        if (Math.abs(ly1 - ly2) < 14) { if (ly1 <= ly2) { ly1 -= 7; ly2 += 7; } else { ly1 += 7; ly2 -= 7; } }
        text(x1 + 8, ly2, 'Test', 'end');
      }
      text(x1 + 8, ly1, 'Training', 'end');
    }
    out.push(`<line id="chart-cross" class="cross" x1="0" x2="0" y1="${topA}" y2="${(topC + PANEL.c).toFixed(1)}" visibility="hidden"/>`);
    out.push(`<rect id="chart-hit" x="${x0}" y="${topA}" width="${x1 - x0}" height="${(topC + PANEL.c - topA).toFixed(1)}" fill="transparent" tabindex="0" aria-label="Werte je Generation ablesen"/>`);
    svg.innerHTML = out.join('');
    bindHover();
    renderTable();
  }

  function renderTable() {
    const rows = ['<tr><th>Generation</th><th>Strecken geschafft</th><th>Tempo Test (km/h)</th><th>Tempo Training (km/h)</th><th>Schwierigkeit</th></tr>'];
    for (const t of tests) {
      const h = history[t.gen - 1];
      rows.push(`<tr><td>${t.gen}</td><td>${t.passed} / 20</td><td>${fmt(t.meanSpeed * KMH)}</td><td>${h ? fmt(h.best * KMH) : '–'}</td><td>${h ? Math.round(h.difficulty * 10) : '–'} / 10</td></tr>`);
    }
    if (!tests.length) rows.push('<tr><td colspan="5" style="text-align:left">Der erste Test kommt nach Generation 5.</td></tr>');
    table.innerHTML = rows.join('');
  }

  function tipRow(label, value, keyClass) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'name';
    const key = document.createElement('i');
    key.className = `key ${keyClass}`;
    name.append(key, document.createTextNode(label));
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = value;
    row.append(name, val);
    return row;
  }

  function showAt(gen) {
    const g = geometry;
    const h = history[gen - 1];
    const cross = svg.querySelector('#chart-cross');
    if (!h || !cross) return hide();
    const cx = g.x(gen);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    const test = tests.find((t) => t.gen === gen);
    tip.replaceChildren();
    const head = document.createElement('b');
    head.textContent = `Generation ${gen}`;
    tip.append(head, tipRow('Training', `${fmt(h.best * KMH)} km/h`, ''));
    if (test) {
      tip.append(tipRow('Test', `${fmt(test.meanSpeed * KMH)} km/h`, 'test'), tipRow('Geschafft', `${test.passed} / 20`, 'test'));
    }
    tip.append(tipRow('Schwierigkeit', `${Math.round(h.difficulty * 10)} / 10`, 'none'));
    tip.hidden = false;
    const scale = svg.clientWidth / svg.viewBox.baseVal.width;
    const left = cx * scale;
    const flip = left > svg.clientWidth - 200;
    tip.style.left = `${flip ? left - tip.offsetWidth - 12 : left + 12}px`;
    tip.style.top = `${g.topA * scale}px`;
  }

  function hide() {
    tip.hidden = true;
    svg.querySelector('#chart-cross')?.setAttribute('visibility', 'hidden');
  }

  let focusGen = 1;
  function bindHover() {
    const hit = svg.querySelector('#chart-hit');
    const genAt = (event) => {
      const box = svg.getBoundingClientRect();
      const vx = ((event.clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
      const g = geometry;
      const gen = Math.round(1 + ((vx - g.x0) / (g.x1 - g.x0)) * (g.maxGen - 1));
      return Math.max(1, Math.min(history.length, gen));
    };
    hit.addEventListener('pointermove', (e) => { focusGen = genAt(e); showAt(focusGen); });
    hit.addEventListener('pointerdown', (e) => { focusGen = genAt(e); showAt(focusGen); });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => { focusGen = history.length; showAt(focusGen); });
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      focusGen = Math.max(1, Math.min(history.length, focusGen + (e.key === 'ArrowLeft' ? -1 : 1)));
      showAt(focusGen);
    });
  }

  return {
    /** @param {object[]} nextHistory GenStats per generation  @param {object[]} nextTests test results */
    update(nextHistory, nextTests) { history = nextHistory; tests = nextTests; hide(); render(); },
    resize() { render(); },
  };
}
