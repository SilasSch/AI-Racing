# Stufe 1: Fahren lernen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Webseite, auf der eine Population kleiner Netze per Evolution live lernt, auf Zufallsstrecken zu fahren, mit messbarer Übertragung auf nie gesehene und selbst gezeichnete Strecken.

**Architecture:** Ein Simulationskern aus reinen ES-Modulen unter `src/core/` ohne Browser-Abhängigkeit, der in Node getestet und im Browser unverändert geladen wird. Ein `Trainer` steuert Generationen als Zustandsmaschine, die schrittweise vorgerückt werden kann (für die Live-Ansicht) oder am Stück (für Tests). Die Oberfläche unter `src/ui/` zeichnet auf Canvas und ruft nur die Schnittstellen des Kerns auf.

**Tech Stack:** JavaScript (ES-Module), Node 22 mit `node:test`, Canvas 2D, keine Laufzeit-Abhängigkeiten. Playwright (vorinstalliert) nur für den Browser-Rauchtest.

**Spec:** `docs/superpowers/specs/2026-11-27-ki-endurance-rennen-design.md` (Abschnitte 6, 7, 10, 11, 12 Stufe 1)

## Global Constraints

- Keine Bibliotheken zur Laufzeit. Netz, Evolution, Physik, Diagramme von Hand.
- Kein `Math.random()` und kein `Date` unter `src/core/`. Aller Zufall kommt aus `createRng(seed)`.
- Fester Zeitschritt `DT = 1/30` s. Gleicher Seed ergibt auf derselben Engine dasselbe Ergebnis.
- Das Netz sieht nur: 9 Wandabstände, Tempo längs, Tempo quer, Lenkwinkel. Keine Position, kein Fortschritt, keine Krümmung.
- Jedes Training beginnt mit Zufallsgewichten. Es werden keine Gewichte mitgeliefert.
- Regeln (Wandkontakt, Sensor-Kanäle, Episodendauer) kommen als Regelsatz-Objekt in den Kern, nicht als Konstanten im Code der Simulation.
- Mehrere Autos teilen sich eine Welt ohne Wechselwirkung.
- Oberfläche auf Deutsch. Seite hält den Seitenvertrag für veröffentlichte Seiten ein: kein eigenes `<html>/<head>/<body>`, Farb-Tokens für hell und dunkel, 16px Seitenrand, kein horizontales Scrollen bei 400px, `localStorage` nur in try/catch.
- Zahlenwerte in diesem Plan sind Startwerte. Task 10 darf sie abstimmen; verbotene Eingaben (siehe oben) und fest programmiertes Fahrverhalten sind kein zulässiger Hebel.
- Commits enden mit den Attributionszeilen der Sitzung. Arbeit auf Branch `stufe-1-fahren-lernen`.

## Review Focus

1. **Tab im Hintergrund oder langer Frame:** Der Browser drosselt die Bildschleife. Erwartet: Training läuft danach normal weiter, ohne Aufholjagd und ohne eingefrorene Seite (Frame-Delta wird begrenzt). → Task 11
2. **Gespeicherter Stand kaputt, veraltet oder Speicher gesperrt:** Erwartet: Seite startet frisch und bleibt bedienbar, keine Fehlermeldung in der Konsole. → Task 11
3. **Seed-Feld mit Unsinn** (leer, Buchstaben, negativ, riesig): Erwartet: wird zu einer gültigen Zahl gemacht oder mit Hinweis abgelehnt; nie `NaN` im Kern. → Task 8 (Kern), Task 11 (Feld)
4. **Zeichnen mit Minimal-Eingaben** (ein Klick, winziger Kringel, Strich aus der Fläche hinaus): Erwartet: verständliche Ablehnung, keine Ausnahme. → Task 9, Task 12
5. **Stillstand und Tempo null in der Physik** (Division `P/v`, Lenkgrenze bei `v = 0`): Erwartet: nie `NaN` oder `Infinity` im Zustand. → Task 5

## Dateien

| Datei | Aufgabe |
|---|---|
| `package.json` | `"type": "module"`, Skripte `test`, `serve`, `bench`, `proof`, `smoke` |
| `src/core/rng.js` | geseedeter Zufall, Seed-Mischung |
| `src/core/net.js` | Feedforward-Netz auf flachem Genom |
| `src/core/track.js` | Strecke aus Kontrollpunkten, Abstandsfeld, Strahlen, Fortschritt, Gültigkeit |
| `src/core/generator.js` | Zufallsstrecken nach Schwierigkeit |
| `src/core/drawn.js` | Strecke aus gezeichnetem Strich |
| `src/core/car.js` | Fahrphysik |
| `src/core/rules.js` | Regelsatz „fahren“ |
| `src/core/sensors.js` | Sensor-Kanäle → Netzeingabe |
| `src/core/world.js` | viele Autos auf einer Strecke, Episodenende |
| `src/core/evolution.js` | nächste Generation |
| `src/core/trainer.js` | Generationen, Lehrplan, Testsatz, Speichern |
| `src/ui/*.js`, `index.html` | Oberfläche |
| `scripts/bench.js`, `scripts/proof.js`, `scripts/serve.js`, `scripts/smoke.cjs` | Messung, Lernnachweis, lokaler Server, Browser-Rauchtest |
| `test/*.test.js` | Tests je Kernmodul |

---

### Task 1: Projektgerüst und Zufall

**Files:** Create `package.json`, `src/core/rng.js`, `test/rng.test.js`, `.gitignore`

**Interfaces – Produces:**
- `hashSeed(...parts: number[]): number` → uint32, mischt beliebig viele Ganzzahlen
- `createRng(seed: number): Rng` mit `next(): number` in [0,1), `range(a, b)`, `int(n)` in 0…n−1, `normal()` (Mittel 0, Streuung 1), und Eigenschaft `state: number` (lesbar und setzbar, für Speichern)
- `normalizeSeed(value: unknown): number` → uint32; `NaN`, leere Eingabe, Text ohne Zahl ergeben `0`; negative und zu große Zahlen werden per `>>> 0` gefaltet

- [ ] **Step 1: Tests schreiben**

```js
test('gleicher Seed, gleiche Folge', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
test('state setzen setzt die Folge fort', () => {
  const a = createRng(7); a.next(); const s = a.state; const x = a.next();
  const b = createRng(1); b.state = s; assert.equal(b.next(), x);
});
test('next liegt in [0,1), normal hat Mittel ~0 und Streuung ~1', () => { /* 20000 Züge, |Mittel| < 0.03, |Std-1| < 0.03 */ });
test('hashSeed trennt Reihenfolge', () => assert.notEqual(hashSeed(1, 2), hashSeed(2, 1)));
test('normalizeSeed', () => {
  for (const v of ['', 'abc', NaN, undefined, null]) assert.equal(normalizeSeed(v), 0);
  assert.equal(normalizeSeed('123'), 123);
  assert.equal(normalizeSeed(-1), 4294967295);
  assert.ok(Number.isInteger(normalizeSeed(1e20)));
});
```

- [ ] **Step 2:** `node --test test/` → schlägt fehl (Modul fehlt)
- [ ] **Step 3:** `rng.js` umsetzen. Generator: mulberry32 (ein uint32 Zustand). `normal()` per Box-Muller ohne zwischengespeicherten zweiten Wert, damit `state` den Generator vollständig beschreibt.
- [ ] **Step 4:** `node --test test/` → grün
- [ ] **Step 5:** Commit `feat: project scaffold and seeded rng`

### Task 2: Netz

**Files:** Create `src/core/net.js`, `test/net.test.js`

**Interfaces – Produces:**
- `genomeLength(sizes: number[]): number`: je Schicht `(in + 1) * out`
- `randomGenome(sizes, rng): Float32Array`: Gewichte `normal() / sqrt(in)`, Bias 0
- `createScratch(sizes): Float32Array[]`: ein Puffer je Schicht ab der ersten versteckten
- `forward(genome, sizes, input: Float32Array, scratch): Float32Array`: gibt `scratch.at(-1)` zurück, `tanh` auf allen Schichten; die Aktivierungen bleiben in `scratch` lesbar (für die Netz-Ansicht)
- Genom-Layout: Schicht für Schicht, je Ausgangsknoten erst die `in` Gewichte, dann der Bias

- [ ] **Step 1: Tests**

```js
test('Länge', () => assert.equal(genomeLength([12, 16, 16, 2]), 514));
test('Handrechnung', () => {
  const sizes = [2, 1]; const g = Float32Array.from([0.5, -1, 0.25]);
  const out = forward(g, sizes, Float32Array.from([1, 2]), createScratch(sizes));
  assert.ok(Math.abs(out[0] - Math.tanh(0.5 - 2 + 0.25)) < 1e-6);
});
test('Ausgaben liegen in [-1,1] und sind endlich', () => { /* 100 Zufallsgenome, Eingaben in [-5,5] */ });
```

- [ ] **Step 2:** Test läuft rot · **Step 3:** umsetzen, ohne Allokation in `forward` · **Step 4:** grün · **Step 5:** Commit `feat: feedforward net on flat genome`

### Task 3: Strecke, Abstandsfeld, Strahlen

**Files:** Create `src/core/track.js`, `test/track.test.js`

**Interfaces – Produces:**
- `buildTrack(points: {x, y}[], halfWidth: number): Track`: geschlossener zentripetaler Catmull-Rom-Spline durch die Punkte, neu abgetastet auf `SAMPLE = 2` m
- `Track`: `{ n, xs: Float32Array, ys: Float32Array, length, halfWidth, bounds: {minX, minY, maxX, maxY}, start: {x, y, heading, index} }`. Bogenlänge des Abtastpunkts `i` ist `i * length / n`.
- `wallDistance(track, x, y): number`: Abstand zur nächsten Wand, positiv auf der Fahrbahn, ≤ 0 außerhalb
- `castRay(track, x, y, angle, range): number`: Strecke bis zur Wand, höchstens `range`
- `locate(track, x, y, hint: number): number`: Index des nächsten Mittellinienpunkts, gesucht in `hint ± 20`
- `validateTrack(track): { ok: true } | { ok: false, reason: 'zu-kurz' | 'kreuzt-sich' | 'beruehrt-sich' | 'zu-eng' }`
  - `zu-kurz`: `length < 400`
  - `kreuzt-sich`: zwei nicht benachbarte Mittelliniensegmente schneiden sich
  - `beruehrt-sich`: zwei Abtastpunkte, entlang der Strecke mehr als `6 * halfWidth` auseinander, liegen näher als `2 * halfWidth + 2`
  - `zu-eng`: kleinster Krümmungsradius `< halfWidth + 4`
- `start`: der Punkt, hinter dem die folgenden 120 m die geringste größte Krümmung haben; `heading` in Fahrtrichtung

Umsetzung des Abstandsfelds: Raster mit 2 m Zellen über `bounds` plus Rand; jede Zelle speichert den Abstand zur Mittellinie, begrenzt auf `halfWidth + 6`. `wallDistance = halfWidth − Feld(bilinear)`. `castRay` geht in Schritten von `max(wallDistance, 0.5)` vor und verfeinert den letzten Schritt linear.

- [ ] **Step 1: Tests** (Kreis mit Radius 100 aus 24 Punkten, `halfWidth = 8`)

```js
test('Länge ~ Kreisumfang', () => assert.ok(Math.abs(t.length - 2 * Math.PI * 100) < 6));
test('Wandabstand: Mitte, Rand, außen', () => {
  near(wallDistance(t, 100, 0), 8, 0.6); near(wallDistance(t, 107, 0), 1, 0.6);
  assert.ok(wallDistance(t, 112, 0) <= 0); assert.ok(wallDistance(t, 0, 0) <= 0);
});
test('Strahl quer trifft nach ~8 m, entlang nach Sehnenlänge', () => {
  near(castRay(t, 100, 0, 0, 150), 8, 0.8);            // nach außen
  near(castRay(t, 100, 0, Math.PI, 150), 8, 0.8);      // nach innen
  near(castRay(t, 100, 0, Math.PI / 2, 150), Math.sqrt(108 ** 2 - 100 ** 2), 2); // tangential
});
test('Strahl ohne Wand in Reichweite gibt range zurück', () => near(castRay(t, 100, 0, Math.PI / 2, 10), 10, 1e-6));
test('locate folgt dem Auto um den Kreis', () => { /* 360 Schritte, Index wächst monoton modulo n */ });
test('Gültigkeit', () => {
  assert.deepEqual(validateTrack(t), { ok: true });
  assert.equal(validateTrack(buildTrack(acht, 8)).reason, 'kreuzt-sich');       // Achterschleife
  assert.equal(validateTrack(buildTrack(kreis(100, 24), 60)).ok, true);
  assert.equal(validateTrack(buildTrack(kreis(15, 12), 14)).reason, 'zu-kurz');
  assert.equal(validateTrack(buildTrack(haarnadel, 8)).reason, 'zu-eng');       // Spitze mit Radius ~5
  assert.equal(validateTrack(buildTrack(uForm, 8)).reason, 'beruehrt-sich');    // zwei Schenkel 10 m auseinander
});
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: track geometry, distance field, ray casting`

### Task 4: Streckengenerator

**Files:** Create `src/core/generator.js`, `test/generator.test.js`

**Interfaces – Consumes:** `buildTrack`, `validateTrack`, `createRng`, `hashSeed`
**Produces:**
- `difficultyParams(d: number): { halfWidth, points, amplitude }` mit `halfWidth = 9 → 5.5`, `points = 7 → 14` (gerundet), `amplitude = 0.12 → 0.45`, linear in `d`, `d` auf [0,1] begrenzt
- `generateTrack(seed: number, difficulty: number): Track`: immer gültig

Verfahren: `points` Winkel gleichmäßig um den Kreis mit Zufallsversatz bis ±35 % des Winkelabstands; Radius `190 * (1 + amplitude * u)` mit `u` in [−1,1]; x mit Faktor 1…1.5 strecken, dann zufällig drehen; mit 50 % spiegeln, mit 50 % Reihenfolge umkehren (Fahrtrichtung). Ungültig → neuer Versuch mit `hashSeed(seed, versuch)`; ab dem 10. Fehlversuch sinkt `amplitude` je Versuch um 5 %.

- [ ] **Step 1: Tests**

```js
test('1000 Strecken über alle Schwierigkeiten sind gültig', () => {
  for (let i = 0; i < 1000; i++) assert.deepEqual(validateTrack(generateTrack(i, i / 999)), { ok: true });
});
test('gleicher Seed, gleiche Strecke', () => assert.deepEqual(generateTrack(5, 0.5).xs, generateTrack(5, 0.5).xs));
test('schwerer heißt schmaler und kurviger', () => { /* Mittel über 50 Seeds: halfWidth und mittlerer Radius sinken von d=0 zu d=1 */ });
test('beide Fahrtrichtungen kommen vor', () => { /* Vorzeichen der umlaufenen Fläche über 40 Seeds: beide ≥ 8 mal */ });
test('Schwierigkeit außerhalb [0,1] wird begrenzt', () => assert.deepEqual(difficultyParams(7), difficultyParams(1)));
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün (Laufzeit des 1000er-Tests notieren; über 20 s → Abstandsfeld-Aufbau beschleunigen) · **Step 5:** Commit `feat: procedural track generator with difficulty`

### Task 5: Fahrphysik

**Files:** Create `src/core/car.js`, `test/car.test.js`

**Interfaces – Produces:**
- `CAR = { mass: 1000, power: 300000, drag: 0.6, rolling: 150, grip: 1.4, brake: 1.0, wheelbase: 2.6, maxSteer: 0.5, steerRate: 2.5, overdrive: 1.3 }` (SI-Einheiten; `drag` ist der Faktor vor `v²`, `brake` der Anteil der Haftung, den die Bremse abrufen kann)
- `createCar(pose: {x, y, heading}): CarState` → `{ x, y, heading, vx, vy, steer }` (`vx` längs, `vy` quer im Fahrzeugsystem)
- `steerLimit(speed, spec): number` = `min(maxSteer, atan(wheelbase * overdrive * grip * 9.81 / speed²))`, bei `speed < 1` gleich `maxSteer`
- `stepCar(car, steerCmd, throttleCmd, spec, dt): void`: beide Kommandos in [−1,1], werden begrenzt; verändert `car`

Modell je Schritt: Lenkwinkel nähert sich `steerCmd * steerLimit` mit `steerRate`. Giergeschwindigkeit `vx / wheelbase * tan(steer)`. Längsbeschleunigung aus Gas (`min(power / max(vx, 5), grip * m * g) / m`) oder Bremse (`brake * grip * g`, nie über null hinaus), minus Luft- und Rollwiderstand. Reibungskreis: verfügbare Querbeschleunigung `sqrt(max(0, (grip*g)² − a_längs²))`. Die Reifen bauen `vy` ab, höchstens mit dieser Querbeschleunigung. Danach Blickrichtung drehen, Geschwindigkeit im Weltsystem beibehalten und neu in `vx`/`vy` zerlegen. Kein Rückwärtsfahren: `vx ≥ 0`.

- [ ] **Step 1: Tests**

```js
test('Höchsttempo ~79 m/s', () => { /* 60 s Vollgas geradeaus: 75 < vx < 83 */ });
test('Bremsweg aus 60 m/s', () => { /* Vollbremsung: 105 m < Weg < 150 m, Endtempo 0, nie negativ */ });
test('langsame Kurve folgt der Lenkgeometrie', () => { /* vx gehalten bei 10, steerCmd 0.5: Bahnradius ≈ wheelbase / tan(0.25) ± 10 %, |vy| < 0.3 */ });
test('zu schnell in die Kurve rutscht', () => { /* 60 m/s, voller Lenkeinschlag: nach 1 s |vy| > 1 und Bahnradius > v²/(grip*g) * 0.95 */ });
test('Bremsen in der Kurve kostet Seitenführung', () => { /* gleiche Kurve mit Vollbremsung: größeres max |vy| als ohne */ });
test('Stillstand bleibt endlich', () => {
  const c = createCar({ x: 0, y: 0, heading: 0 });
  for (const [s, t] of [[0, 0], [1, -1], [-1, 1], [NaN, NaN]]) { stepCar(c, s, t, CAR, 1 / 30); for (const k in c) assert.ok(Number.isFinite(c[k])); }
});
```

`NaN`-Kommandos werden als 0 behandelt.

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: car physics with friction circle`

### Task 6: Regelsatz, Sensoren, Welt

**Files:** Create `src/core/rules.js`, `src/core/sensors.js`, `src/core/world.js`, `test/world.test.js`

**Interfaces – Consumes:** Task 2, 3, 5
**Produces:**
- `DT = 1 / 30`
- `RULES_FAHREN = { id: 'fahren', wallContact: 'fatal', episodeSeconds: 45, lapTimeout: 120, stall: { seconds: 3, minProgress: 5 }, rayRange: 150, channels }` mit `channels` = 9 × `{ type: 'ray', angle }` bei −90, −55, −30, −12, 0, 12, 30, 55, 90 Grad, dann `{ type: 'speed' }`, `{ type: 'slip' }`, `{ type: 'steer' }`
- `sense(track, car, rules, spec, out: Float32Array): void`: Strahl `dist / rayRange`, `speed = vx / 80`, `slip = clamp(vy / 20, −1, 1)`, `steer = steer / spec.maxSteer`
- `createWorld(track, rules, spec, sizes, genomes: Float32Array[], opts?: { untilLap?: boolean }): World`
- `World`: `{ track, time, done, cars: Car[] }`; `Car`: `{ state: CarState, genome, alive, endReason: null | 'wand' | 'stillstand' | 'zeit' | 'runde', progress, time, index, input, scratch }`. `progress` in Metern entlang der Mittellinie seit dem Start, über Runden hinweg, rückwärts negativ.
- `stepWorld(world): void`: ein `DT` für alle lebenden Autos: `sense` → `forward` → `stepCar` → `locate` → Fortschritt → Endebedingungen. `done`, wenn kein Auto mehr lebt.
- `runToEnd(world): void`
- Ende eines Autos: `wallDistance ≤ 0` → `'wand'`; in den letzten `stall.seconds` weniger als `stall.minProgress` Fortschritt → `'stillstand'`; ohne `untilLap`: `time ≥ episodeSeconds` → `'zeit'`; mit `untilLap`: `progress ≥ track.length` → `'runde'`, `time ≥ lapTimeout` → `'zeit'`
- Netzausgabe 0 ist Lenkung, Ausgabe 1 ist Gas (positiv) oder Bremse (negativ)

- [ ] **Step 1: Tests** (Kreisstrecke aus Task 3; Hilfsgenom, dessen Bias konstante Ausgaben erzwingt)

```js
test('sense: 12 Werte in [-1,1], mittlerer Strahl sieht weiter als die seitlichen', ...);
test('Geradeaus-Vollgas endet an der Wand', () => { /* endReason 'wand', 20 < progress < 200 */ });
test('Null-Ausgabe endet als Stillstand nach ~3 s', () => { /* endReason 'stillstand', time in [3, 3.2] */ });
test('Kreisfahrer überlebt bis zur Zeit', () => { /* Genom lenkt konstant passend, Gas klein: endReason 'zeit', progress > 300 */ });
test('untilLap endet nach einer Runde', () => { /* endReason 'runde', progress ≥ length */ });
test('Autos beeinflussen sich nicht', () => { /* Welt mit [a, b] ergibt für a dieselben Zahlen wie Welt mit [a] */ });
test('gleiche Eingabe, gleiches Ergebnis', ...);
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: rules, sensors and multi-car world`

### Task 7: Evolution

**Files:** Create `src/core/evolution.js`, `test/evolution.test.js`

**Produces:**
- `EVO_DEFAULTS = { popSize: 60, elites: 4, tournament: 3, crossover: 0.5, rate: 0.1, sigma: 0.15 }`
- `nextGeneration(genomes: Float32Array[], fitness: number[], params, rng): Float32Array[]`: gleiche Anzahl; die `elites` besten unverändert an den Anfang (als Kopien); Rest: Turnierauswahl, mit Wahrscheinlichkeit `crossover` gewichtsweises Mischen zweier Eltern, dann je Gewicht mit Wahrscheinlichkeit `rate` ein Zuschlag `normal() * sigma`

- [ ] **Step 1: Tests**

```js
test('Größe bleibt, Eliten sind die Besten und unverändert', ...);
test('Eltern werden nicht verändert', ...);
test('rate 0 und crossover 0 ergibt nur Kopien vorhandener Genome', ...);
test('Auswahl bevorzugt hohe Fitness', () => { /* 1 Genom mit Fitness 100, 59 mit 0, rate 0, crossover 0: > 50 % Kopien des Besten */ });
test('gleicher rng-Zustand, gleiche Kinder', ...);
test('Fitness NaN zählt als -Infinity', ...);
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: evolution operators`

### Task 8: Trainer, Lehrplan, Testsatz

**Files:** Create `src/core/trainer.js`, `test/trainer.test.js`

**Interfaces – Consumes:** Task 1, 2, 4, 5, 6, 7
**Produces:**
- `createTrainer(opts?: { seed?, rules?, spec?, hidden?, evo? }): Trainer`. Vorgaben: `seed 1`, `RULES_FAHREN`, `CAR`, `hidden [16, 16]`, `EVO_DEFAULTS`. `seed` läuft durch `normalizeSeed`.
- `Trainer`: `{ seed, rules, spec, sizes, evo, gen, difficulty, trackIndex, world, genomes, champion: Float32Array | null, history: GenStats[], tests: TestStats[] }`. `evo.rate` und `evo.sigma` dürfen von außen geändert werden und gelten ab der nächsten Generation.
- `advance(trainer, maxSteps: number): boolean`: rückt die laufende Welt höchstens `maxSteps` Schritte vor; wechselt zur nächsten der `TRACKS_PER_GEN = 3` Strecken; nach der dritten: Statistik, Lehrplan, ggf. Test, neue Generation. Gibt `true` zurück, wenn dabei eine Generation abgeschlossen wurde.
- `runGeneration(trainer): GenStats`
- `GenStats`: `{ gen, best, mean, difficulty, clean }`: `best`/`mean` als Durchschnittstempo in m/s (mittlere Distanz / `episodeSeconds`, negative Distanz zählt 0); `clean` = Anzahl der drei Strecken, die der Beste ohne Wandkontakt und mit ≥ 600 m geschafft hat
- Lehrplan: `clean ≥ 2` → `difficulty = min(1, difficulty + 0.1)`. Sinkt nie.
- `testTracks(): Track[]`: 20 feste Strecken, Schwierigkeit `i / 19`, einmal erzeugt und zwischengespeichert
- `runTest(genome, trainer): { passed, meanSpeed, perTrack: { ok, reason, speed }[] }`: jede Teststrecke mit `untilLap`; `ok` heißt `endReason === 'runde'`
- `TEST_EVERY = 5`: nach jeder 5. Generation `runTest(champion)` → `tests.push({ gen, passed, meanSpeed })`
- `serialize(trainer): object` (JSON-fähig, Genome als Base64, mit `version: 1`) und `restoreTrainer(data): Trainer | null` (`null` bei falscher Version oder beschädigten Daten, wirft nie)
- Seeds: Trainingsstrecke `hashSeed(1, seed, gen, k) & 0x7fffffff`; Teststrecke `(hashSeed(2, i) | 0x80000000) >>> 0`. Die Mengen sind dadurch disjunkt. Evolution: `createRng(hashSeed(3, seed))`.
- Ein Genom wird über die drei Strecken mit dem Mittelwert bewertet; Eliten werden jede Generation neu bewertet.

- [ ] **Step 1: Tests**

```js
test('gleicher Seed, identischer Verlauf', () => { /* 3 Generationen: history gleich, champion byteweise gleich */ });
test('advance in kleinen Schritten = runGeneration', () => { /* advance(t, 7) in Schleife gegen runGeneration */ });
test('Speichern und Fortsetzen ändert nichts', () => { /* 2 Gen., serialize → JSON → restore, 2 weitere; gleich wie 4 am Stück */ });
test('restoreTrainer verträgt Müll', () => { for (const d of [null, {}, { version: 99 }, 'x', { version: 1, genomes: ['###'] }]) assert.equal(restoreTrainer(d), null); });
test('Seed-Unsinn ergibt gültigen Trainer', () => { for (const s of ['', 'abc', NaN, -5, 1e20]) assert.ok(Number.isInteger(createTrainer({ seed: s }).seed)); });
test('Test- und Trainings-Seeds überschneiden sich nicht', ...);
test('Teststrecken sind unabhängig vom Trainer-Seed', ...);
test('Schwierigkeit sinkt nie und steigt nur bei clean ≥ 2', ...);
test('es wird gelernt', () => { /* seed 1, 30 Generationen: difficulty ≥ 0.1 und best der letzten Gen. ≥ 2 × best der ersten */ });
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün. Schlägt nur „es wird gelernt“ fehl, zuerst mit `superpowers:systematic-debugging` Fehler in Sensoren/Physik/Fortschritt ausschließen, erst dann Zahlen ändern. · **Step 5:** Commit `feat: trainer with curriculum, held-out test set, save/restore`

### Task 9: Gezeichnete Strecke

**Files:** Create `src/core/drawn.js`, `test/drawn.test.js`

**Produces:**
- `trackFromStroke(points: {x, y}[], halfWidth: number): { ok: true, track: Track } | { ok: false, reason: 'zu-wenig' | 'zu-kurz' | 'kreuzt-sich' | 'beruehrt-sich' | 'zu-eng' }`. Punkte in Metern.
- `REASON_TEXT: Record<reason, string>`, deutsche Sätze für die Oberfläche, z. B. `'kreuzt-sich': 'Die Strecke kreuzt sich selbst. Kreuzungen kann das Auto nicht fahren.'`

Verfahren: nicht endliche Punkte verwerfen; weniger als 8 Punkte oder Ausdehnung unter 60 m → `zu-wenig`; Ende mit Anfang verbinden; auf 25 m Abstand neu abtasten; 2 Glättungsdurchgänge (Chaikin); `buildTrack`; `validateTrack`. Über die Glättung hinaus wird nichts korrigiert.

- [ ] **Step 1: Tests**

```js
test('verwackelter Kreis wird angenommen', () => { /* Radius 120, 200 Punkte, Rauschen ±2 m */ });
test('ein Punkt, leere Liste, Kringel von 5 m', () => { for (const p of [[], [{ x: 0, y: 0 }], kringel]) assert.equal(trackFromStroke(p, 8).reason, 'zu-wenig'); });
test('NaN-Punkte werden ignoriert', ...);
test('Acht wird abgelehnt', () => assert.equal(trackFromStroke(acht, 8).reason, 'kreuzt-sich'));
test('jede Ablehnung hat einen Text', () => { /* alle reasons in REASON_TEXT */ });
test('angenommene Strecke ist fahrbar', () => { /* validateTrack ok, start gesetzt */ });
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: track from hand-drawn stroke`

### Task 10: Messung, Lernnachweis, Abstimmung

**Files:** Create `scripts/bench.js`, `scripts/proof.js`, `docs/stufe-1-nachweis.md`

- [ ] **Step 1:** `scripts/bench.js`: misst Auto-Schritte pro Sekunde (60 Autos, Strecke `generateTrack(1, 0.5)`, 2000 Weltschritte, Genom das im Kreis überlebt) und die Dauer von 10 Generationen. Ausgabe: `car-steps/s` und `ms/Generation`.
- [ ] **Step 2:** `npm run bench`. Ziel: Generation im Mittel **unter 700 ms**. Wird das verfehlt: erst Profil ansehen (`node --prof`), dann in dieser Reihenfolge: Allokationen in `stepWorld`/`castRay` entfernen; Netz und Sensoren nur jeden 2. Schritt rechnen (`rules.controlEvery = 2`); `episodeSeconds` auf 35.
- [ ] **Step 3:** `scripts/proof.js [--seeds 10] [--gens 150]`: je Seed ein Kindprozess (parallel bis Kernzahl); pro Seed `runGeneration` bis `tests.at(-1).passed ≥ 16` oder Generation 150. Ausgabe als Tabelle: Seed, Generation des Bestehens oder „nicht bestanden“, beste `passed`, Schwierigkeit. Exit-Code 0, wenn mindestens 8 von 10 bestehen.
- [ ] **Step 4:** `npm run proof`. Besteht es nicht: Verlauf der gescheiterten Seeds ansehen (wo crasht der Beste: Kurventyp, Schwierigkeit?) und gezielt abstimmen. Zulässige Hebel: `EVO_DEFAULTS`, Lehrplan-Schritt und -Schwelle, `episodeSeconds`, Strahlwinkel und -reichweite, Physikwerte, Generator-Parameter. Unzulässig: neue Eingaben, die die Strecke verraten; fest programmiertes Verhalten; ausgesuchte Seeds; Abschwächen der Abnahme.
- [ ] **Step 5:** `docs/stufe-1-nachweis.md` schreiben: Ausgabe von `bench` und `proof` wörtlich, die endgültigen Zahlenwerte, und was geändert wurde. Besteht der Nachweis nach ehrlichem Abstimmen nicht, steht das Ergebnis dort, wie es ist, und der Auftraggeber wird gefragt.
- [ ] **Step 6:** `node --test test/` grün (Tests, deren Zahlen sich durch Abstimmung geändert haben, anpassen und im Commit begründen) · Commit `feat: benchmark and learning proof, tuned constants`

### Task 11: Oberfläche: Training

**Files:** Create `index.html`, `src/ui/main.js`, `src/ui/theme.js`, `src/ui/view-track.js`, `src/ui/view-net.js`, `src/ui/view-chart.js`, `src/ui/storage.js`, `scripts/serve.js`, `scripts/smoke.cjs`

Vor dem ersten Diagramm-Code die Skill `dataviz` laden. Seitenvertrag siehe Global Constraints.

**Interfaces – Consumes:** `createTrainer`, `advance`, `runTest`, `serialize`, `restoreTrainer`, `Trainer`, `World`, `DT`
**Produces (DOM-IDs, die der Rauchtest und Task 12 verwenden):** `#tab-training`, `#tab-zeichnen`, `#btn-start`, `#speed-1`, `#speed-4`, `#speed-max`, `#btn-reset`, `#seed`, `#mut-rate`, `#mut-sigma`, `#stat-gen`, `#stat-diff`, `#stat-test`, `#cv-track`, `#cv-net`, `#cv-chart`
- `src/ui/storage.js`: `saveState(key, obj): boolean`, `loadState(key): object | null`; beide fangen jeden Fehler
- `src/ui/view-track.js`: `createTrackView(canvas): { setTrack(track), draw(world, leaderIndex), clear() }`: Strecke einmal in einen Zwischenpuffer, pro Bild nur die Autos
- `src/ui/main.js` exportiert für Task 12: `getChampion(): { genome, sizes, rules, spec } | null`

Verhalten:
- Titel der Seite: „KI-Rennlabor“. Zwei Ansichten über `location.hash` (`#training`, `#zeichnen`), Start ist Training.
- Aufbau nach Spec Abschnitt 10: Strecke mit allen Autos der Generation, der Führende (größter `progress` unter den Lebenden) hervorgehoben mit seinen 9 Strahlen; daneben sein Netz (Knoten nach Aktivierung gefärbt, Verbindungen nach Vorzeichen und Stärke); darunter die Lernkurve (Training und Test als zwei Linien über die Generation, Schwierigkeit als Stufenlinie auf zweiter Skala oder eigenem Streifen) und die Kennzahlen Generation, Schwierigkeit, „Test: x/20“.
- Vor dem ersten Start zeigt die Seite eine Strecke mit stehender Zufallspopulation und einen kurzen Satz, was gleich passiert.
- Tempo: `1x` = Echtzeit über einen Zeit-Akkumulator; `4x`; `max` = `advance` in Scheiben bis 12 ms pro Bild, Strecke zeigt dann nur den Stand nach jeder Scheibe. Das Frame-Delta wird auf 100 ms begrenzt.
- `Zurücksetzen` würfelt einen neuen Seed, trägt ihn in `#seed` ein und beginnt mit Zufallsgewichten. Ein eingetragener Seed wird beim Zurücksetzen übernommen (`normalizeSeed`); war die Eingabe keine Zahl, erscheint ein Hinweis neben dem Feld.
- Regler `#mut-rate` (0.01–0.5) und `#mut-sigma` (0.02–0.5) schreiben in `trainer.evo`.
- Nach jeder Generation `saveState('fahren', serialize(trainer))`; beim Laden `restoreTrainer(loadState('fahren'))`, bei `null` frischer Trainer.
- Canvas-Farben kommen aus den CSS-Tokens und werden bei Themenwechsel neu gelesen. Canvas-Größe folgt dem Container und `devicePixelRatio`.

- [ ] **Step 1:** `scripts/serve.js` (statischer Server für das Repo-Wurzelverzeichnis, Port 4173) und `scripts/smoke.cjs` mit diesen Prüfungen, jede als eigene Zeile `ok`/`FAIL`:
  - Seite lädt ohne Konsolenfehler; `#stat-gen` zeigt 0
  - Klick `#speed-max`, `#btn-start`: `#stat-gen` ≥ 3 innerhalb 30 s; `#cv-track` ist nicht einfarbig
  - nach Neuladen ist `#stat-gen` weiterhin ≥ 3 (gespeicherter Stand)
  - `localStorage['fahren'] = '{kaputt'` und Neuladen: lädt ohne Konsolenfehler, `#stat-gen` ist 0
  - `#seed` = `abc`, `#btn-reset`: Hinweis sichtbar, kein Konsolenfehler; `#seed` = `77`, `#btn-reset`: Feld zeigt 77
  - Seite 5 s per `page.evaluate` blockierender Schleife anhalten, danach steigt `#stat-gen` weiter und ein Bild dauert unter 200 ms
  - Breite 400 px: `document.documentElement.scrollWidth <= innerWidth`
  - `emulateMedia({ colorScheme: 'dark' })`: Hintergrund von `body` ist dunkel
- [ ] **Step 2:** `node scripts/smoke.cjs` → FAIL (Seite fehlt)
- [ ] **Step 3:** Seite und UI-Module umsetzen
- [ ] **Step 4:** `node scripts/smoke.cjs` → alle `ok`. Einmal je einen Screenshot hell/dunkel/400 px ansehen und sichtbare Fehler beheben.
- [ ] **Step 5:** Commit `feat: training view`

### Task 12: Oberfläche: Probefahrt und Zeichnen

**Files:** Create `src/ui/draw-mode.js`; Modify `index.html`, `src/ui/main.js`, `scripts/smoke.cjs`

**Interfaces – Consumes:** `getChampion`, `createTrackView`, `trackFromStroke`, `REASON_TEXT`, `generateTrack`, `createWorld`, `stepWorld`
**Produces (DOM-IDs):** `#btn-probe`, `#cv-draw`, `#draw-width`, `#btn-draw-clear`, `#btn-draw-go`, `#draw-msg`

Verhalten:
- `#btn-probe` „Neue Zufallsstrecke“ in der Trainingsansicht: pausiert das Training, erzeugt eine Strecke aus einem Seed mit gesetztem höchstem Bit (wie die Teststrecken, also nie im Training) bei der aktuellen Schwierigkeit, und lässt den Besten mit `untilLap` darauf fahren. Danach steht dort das Ergebnis in Worten („Runde geschafft in 31,2 s“ oder „Wandkontakt nach 420 m“). Ohne Besten ist der Knopf deaktiviert.
- Zeichenansicht: Zeichenfläche bildet 700 × 450 m ab. Zeichnen mit Maus oder einem Finger (`pointerdown/move/up` mit `setPointerCapture`, weitere Finger werden ignoriert, Punkte außerhalb werden auf den Rand begrenzt). Beim Loslassen: `trackFromStroke`; bei Erfolg wird die Strecke mit Breite angezeigt, sonst `REASON_TEXT[reason]` in `#draw-msg`. `#draw-width` (halbe Breite 5.5–9 m) baut die Strecke neu. `#btn-draw-go` „Bestes Auto fahren“ ist nur mit gültiger Strecke und vorhandenem Besten aktiv und zeigt danach das Ergebnis wie bei der Probefahrt.

- [ ] **Step 1:** `smoke.cjs` erweitern:
  - nach kurzem Training: `#btn-probe` klicken → Ergebnistext erscheint innerhalb 60 s
  - `#tab-zeichnen`; mit `page.mouse` einen Kreis ziehen → `#btn-draw-go` aktiv, `#draw-msg` leer; klicken → Ergebnistext
  - einfacher Klick ohne Bewegung → `#draw-msg` zeigt den Text für `zu-wenig`, kein Konsolenfehler
  - eine Acht ziehen → `#draw-msg` zeigt den Text für `kreuzt-sich`
  - Strich, der die Fläche verlässt → kein Konsolenfehler
- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** `node scripts/smoke.cjs` alle `ok`, `node --test test/` grün · **Step 5:** Commit `feat: test drive on unseen track and draw-your-own track`

### Task 13: Veröffentlichen

**Files:** Create `README.md`

- [ ] **Step 1:** `README.md`: was das Projekt ist, `npm test`, `npm run serve`, `npm run proof`, Verweis auf Spec, Plan und `docs/stufe-1-nachweis.md`.
- [ ] **Step 2:** Seite veröffentlichen: `index.html` als Seite, alle Dateien unter `src/` als Begleitdateien unter demselben relativen Pfad. Laden die ES-Module in der veröffentlichten Seite nicht, stattdessen mit `npx esbuild src/ui/main.js --bundle --format=iife --outfile=dist/app.js` bündeln, `dist/` in `.gitignore`, und die Seite gegen `dist/app.js` veröffentlichen.
- [ ] **Step 3:** Auf der veröffentlichten Seite einmal prüfen: Training startet, Generation zählt hoch, Test x/20 erscheint.
- [ ] **Step 4:** Commit `docs: readme`, Branch pushen, Draft-PR anlegen. Beschreibung: was die Stufe kann, Ergebnis des Lernnachweises wörtlich, Link zur Seite.
