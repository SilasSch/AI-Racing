# Stufe 2: Ausdauer – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein zweiter Modus „Ausdauer“, in dem Reifen verschleißen, Sprit verbraucht wird, Wandkontakt Schaden macht und ein zweites kleines Netz lernt, wann die Box lohnt.

**Architecture:** Der Kern bekommt einen zweiten Regelsatz `RULES_AUSDAUER`. Welt und Trainer lesen Episodendauer, Wandkontakt, Sensor-Kanäle und das Kriterium „sauber“ aus dem Regelsatz; der Pfad für `RULES_FAHREN` rechnet bitgleich weiter. Verschleiß, Schaden und Box liegen in einem eigenen Modul, das die Welt pro Schritt aufruft. Das Genom ist Fahrer-Netz plus Strategie-Netz hintereinander.

**Tech Stack:** wie Stufe 1 (ES-Module, Node 22 `node:test`, Canvas 2D, SVG, keine Laufzeit-Abhängigkeiten, Playwright nur für den Rauchtest).

**Spec:** `docs/superpowers/specs/2026-11-27-ki-endurance-rennen-design.md` (Abschnitte 6.1, 6.5, 7.1, 8, 10, 11, 12 Stufe 2, 13). Messwerte aus Stufe 1: `docs/stufe-1-nachweis.md`.

## Global Constraints

- Alle Global Constraints aus `2026-11-27-stufe-1-fahren-lernen.md` gelten weiter.
- `RULES_FAHREN` verhält sich nach dieser Stufe exakt wie vorher: gleicher Seed, gleicher Verlauf, Byte für Byte. Ein vor dieser Stufe gespeicherter Stand lädt weiter.
- Boxenentscheidungen, Tankmenge, Reifenwechsel und Tempovorgabe kommen ausschließlich aus dem Strategie-Netz. Keine fest programmierte Boxenregel, auch nicht als Rückfallebene.
- Das Strategie-Netz sieht nur: Tankfüllung, Reifenverschleiß, Schaden, verbleibende Rennzeit, geschätzte Runden bis Tank leer, letzte Rundenzeit im Verhältnis zur besten, konstanter Eingang.
- Das Fahrer-Netz sieht zusätzlich nur: aktuelle Haftung, Gewichtsanteil Sprit, Tempovorgabe.
- Keine mitgelieferten Gewichte. Stufe 2 darf auf Fahrern aufbauen, die der Nutzer in seinem Browser in „Fahren lernen“ trainiert hat.
- Die beiden Modi haben getrennte gespeicherte Stände (`rennlabor:fahren`, `rennlabor:ausdauer`).
- Rennlänge und Verschleißraten richten sich nach gemessenen Rundenzeiten (45–75 s), nicht nach dem Richtwert aus dem Design.
- Arbeit auf Branch `stufe-2-ausdauer`, abgezweigt von `stufe-1-fahren-lernen`.

## Review Focus

1. **Alter Stand aus Stufe 1** (gespeichert vor dieser Änderung, ohne neue Felder): lädt, trainiert weiter, gleicher Verlauf wie ohne Neuladen. → Task 1
2. **Grenzwerte von Sprit, Reifen, Schaden:** Tank genau leer an der Boxeneinfahrt, Verschleiß über 1, Schaden 1 während des Stopps, Tankziel unter aktuellem Stand. Erwartet: nie negativer Sprit, nie negative Standzeit, nie `NaN`. → Task 3, Task 5
3. **Stopp am Rennende:** Entscheidung „Box“, wenn die Restzeit kürzer als der Stopp ist; Auto steht in der Box, wenn die Zeit abläuft; Rundentest (`untilLap`) mit Boxenwunsch. Erwartet: Distanz zählt bis zur Einfahrt, Rundentest endet an der Linie ohne Stopp. → Task 5
4. **Start aus Stufe-1-Fahrern, wenn deren Stand fehlt, kaputt ist oder andere Netzgrößen hat:** Erwartet: klarer Hinweis, Start von null, keine Ausnahme. → Task 6, Task 8
5. **Moduswechsel mitten im Lauf oder während einer Probefahrt:** Erwartet: jeder Modus setzt an seinem eigenen Stand fort, nichts wandert zwischen den Modi, Probefahrt endet sauber. → Task 8

## Dateien

| Datei | Änderung |
|---|---|
| `src/core/rules.js` | `RULES_AUSDAUER`, Felder `clean`, `endurance`, `strategy` |
| `src/core/car.js` | `stepCar` nimmt Zustand des Autos (Haftung, Leistung, Masse), meldet genutzte Kräfte |
| `src/core/endurance.js` | neu: Reifenkurve, Verschleiß, Verbrauch, Wandkontakt als Schaden, Boxenstopp |
| `src/core/strategy.js` | neu: Eingaben und Ausgaben des Strategie-Netzes |
| `src/core/sensors.js` | Kanäle `grip`, `fuel`, `pace` |
| `src/core/world.js` | Ausdauer-Pfad: Zustand je Auto, Runden, Entscheidungspunkt, Box, Ausfall |
| `src/core/trainer.js` | Rennlänge je Generation, Kriterium „sauber“ aus dem Regelsatz, Start aus Fahrern, Regelsatz-Register |
| `src/ui/*`, `index.html` | Modus-Umschalter, Anzeigen für Sprit, Reifen, Schaden, Boxenfunk, 16×, Stopps in Kurve und Tabelle |
| `scripts/proof-ausdauer.js`, `scripts/bench.js` | Nachweis und Messung für Stufe 2 |
| `test/*.test.js` | Tests je Modul, `test/golden-fahren.test.js` neu |

---

### Task 1: Regelsatz-Schnittstelle, ohne Verhaltensänderung

**Files:** Create `test/golden-fahren.test.js`; Modify `src/core/rules.js`, `src/core/world.js`, `src/core/trainer.js`, `test/trainer.test.js`

**Interfaces – Produces:**
- `RULES_FAHREN` bekommt: `tracksPerGen: 3`, `raceSeconds: [45, 45]`, `clean: (car, track) => car.endReason === 'zeit' && car.progress >= 600`, `endurance: null`, `strategy: null`
- `createWorld(track, rules, spec, sizes, genomes, opts?: { untilLap?, seconds? })`: `seconds` ersetzt `rules.episodeSeconds` für diese Welt
- `Trainer.raceSeconds: number`: Fahrzeit der laufenden Generation, aus `rules.raceSeconds` gezogen mit `createRng(hashSeed(5, seed, gen)).range(min, max)`; bei `min === max` ohne Zufallszug genau dieser Wert
- `GenStats.seconds`: Fahrzeit der Generation; `best`/`mean` teilen durch diesen Wert
- `RULE_SETS` wird exportiert als `ruleSet(id): object | undefined`
- `restoreTrainer`: fehlendes `seconds` in alten `history`-Einträgen ist erlaubt

- [ ] **Step 1:** `test/golden-fahren.test.js` schreiben, **bevor** Kern-Code geändert wird: Trainer mit Seed 1 und Seed 7, je 6 Generationen; `history` (als JSON) und SHA-256 des Champions als feste Werte in der Testdatei. Die Werte kommen aus einem Lauf auf dem unveränderten Code.
- [ ] **Step 2:** `npm test` → der neue Test ist grün (er hält den Ist-Zustand fest).
- [ ] **Step 3:** Tests für die neuen Felder schreiben:

```js
test('Regelsatz fahren trägt Kriterium und Fahrzeit', () => { /* tracksPerGen 3, raceSeconds [45,45], clean(...) wie bisher */ });
test('opts.seconds überschreibt die Fahrzeit einer Welt', () => { /* Kreisfahrer endet mit 'zeit' bei 10 s */ });
test('alter gespeicherter Stand ohne neue Felder lädt und läuft identisch weiter', () => { /* serialize, Feld seconds aus history löschen, restore, 2 Gen.; gleich wie ohne Umweg */ });
test('ruleSet kennt fahren, unbekannte id ergibt undefined', ...);
```

- [ ] **Step 4:** rot · **Step 5:** umsetzen · **Step 6:** `npm test` grün, Golden-Test unverändert grün · **Step 7:** Commit `refactor: rules carry episode length and clean criterion`

### Task 2: Auto mit Zustand

**Files:** Modify `src/core/car.js`, `test/car.test.js`

**Interfaces – Produces:**
- `stepCar(car, steerCmd, throttleCmd, spec, dt, cond?)` mit `cond: { grip: number, power: number, mass: number }` (Faktor Haftung, Faktor Leistung, Masse in kg). Ohne `cond` gilt `{ grip: 1, power: 1, mass: spec.mass }` und das Ergebnis ist bitgleich zu vorher.
- `steerLimit(speed, spec, gripFactor = 1)`
- `CarState` bekommt `load` (genutzte Haftung dieses Schritts als Anteil der verfügbaren, 0…~1.3) und `energy` (abgegebene Motorarbeit dieses Schritts in Joule, nie negativ). `createCar` setzt beide auf 0.

- [ ] **Step 1: Tests**

```js
test('ohne cond rechnet stepCar wie vorher', () => { /* 300 Schritte mit festen Kommandos gegen cond {1,1,spec.mass}: x, y, heading, vx, vy, steer identisch */ });
test('halbe Haftung: längerer Bremsweg, kleinere Lenkgrenze', () => { /* Bremsweg aus 60 m/s mit grip 0.5 in [1.8, 2.2] × normal; steerLimit(40, CAR, 0.5) < steerLimit(40, CAR) */ });
test('weniger Leistung senkt das Höchsttempo', () => { /* power 0.7: vmax in [0.86, 0.92] × normal */ });
test('mehr Masse beschleunigt langsamer', () => { /* mass 1150: Tempo nach 5 s Vollgas aus 30 m/s kleiner */ });
test('load und energy', () => { /* Stand: 0 und 0; Vollgas: energy > 0; Rollen: energy 0; Vollbremsung: load ≈ 1; Bremse: energy 0 */ });
```

`test('createCar steht still an der Pose')` an die neuen Felder anpassen.

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün inkl. Golden-Test · **Step 5:** Commit `feat: car physics with condition and load reporting`

### Task 3: Verschleiß, Verbrauch, Schaden

**Files:** Create `src/core/endurance.js`, `test/endurance.test.js`

**Interfaces – Produces:**
- `ENDURANCE = { tank: 110, burn: 2.4e-6, paceBurn: 0.3, minPower: 0.7, wearBase: 0.0012, wearLoad: 0.0035, wearSlip: 0.0004, cliff: 0.75, gripWorn: 0.94, gripFloor: 0.6, damageBase: 0.02, damagePerSpeed: 0.012, damageGrip: 0.3, damagePower: 0.4, bounce: 0.6 }` (Startwerte, Task 7 stimmt ab)
- `createCondition(e): { fuel, wear, damage, pace }` → voller Tank, 0, 0, Tempovorgabe 1
- `tyreGrip(wear, e): number`: 1 bei 0, linear auf `gripWorn` bei `cliff`, von dort linear auf `gripFloor` bei 1, darüber `gripFloor`
- `carCondition(cond, spec, e, out): out` füllt `{ grip, power, mass }` für `stepCar`: `grip = tyreGrip · (1 − damageGrip · damage)`, `power = (minPower + (1 − minPower) · pace) · (1 − damagePower · damage)`, bei leerem Tank `power = 0`; `mass = spec.mass + fuel`
- `wearAndBurn(cond, car, e, dt): void`: `wear += (wearBase + wearLoad · load² + wearSlip · |vy|) · dt`; `fuel −= burn · energy · (1 − paceBurn · (1 − pace))`, nie unter 0
- `hitWall(cond, car, track, radius, e): boolean`: Auto steckt in der Wand → zurück auf die Fahrbahn schieben, Geschwindigkeitsanteil zur Wand entfernen, Rest mit `bounce` multiplizieren, `damage += damageBase + damagePerSpeed · Aufprallgeschwindigkeit`, höchstens 1; gibt `true` bei einem Treffer. Wandrichtung aus dem Gefälle von `wallDistance`.

- [ ] **Step 1: Tests**

```js
test('Reifenkurve: 1 → 0.94 am Knick → 0.6, darüber konstant, monoton fallend', ...);
test('carCondition: voller Tank wiegt, Schaden kostet Haftung und Leistung, leerer Tank heißt keine Leistung', ...);
test('Tempovorgabe 0 senkt Leistung auf minPower und Verbrauch überproportional', () => { /* Verbrauch je Joule × 0.7, Leistung × 0.7 */ });
test('Verschleiß wächst mit der Last und beim Rutschen schneller', ...);
test('Sprit wird nie negativ, Verschleiß und Schaden bleiben endlich', () => { /* 1e6 J bei fast leerem Tank; wear über 1; damage bleibt ≤ 1 */ });
test('Wandtreffer: Auto ist danach wieder auf der Fahrbahn, langsamer, mit Schaden', () => { /* Kreisstrecke, Auto mit 30 m/s senkrecht in die Außenwand: wallDistance > radius, Tempo < 20, damage in [0.3, 0.45] */ });
test('Streifen kostet wenig, Frontalaufprall viel', ...);
test('kein Treffer, kein Schaden', ...);
test('Schaden wird nie größer als 1', ...);
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: tyre wear, fuel burn and wall damage`

### Task 4: Strategie-Netz

**Files:** Create `src/core/strategy.js`, `test/strategy.test.js`

**Interfaces – Consumes:** `forward`, `createScratch`
**Produces:**
- `STRATEGY_SIZES = [7, 8, 4]`
- `strategyInput(race, out: Float32Array): void` mit `race: { fuelShare, wear, damage, timeLeftShare, lapsOfFuel, lastLapRatio }` → `[fuelShare, min(1, wear), damage, timeLeftShare, min(1, lapsOfFuel / 5), clamp(lastLapRatio − 1, −1, 1), 1]`
- `decide(genome, offset, input, scratch): { box: boolean, fuelTarget: number, tyres: boolean, pace: number }`: Netz aus `genome` ab `offset`; `box = o0 > 0`, `fuelTarget = (o1 + 1) / 2`, `tyres = o2 > 0`, `pace = (o3 + 1) / 2`
- `forward(genome, sizes, input, scratch, offset = 0)` in `net.js`: liest die Gewichte ab `offset`

- [ ] **Step 1: Tests**

```js
test('forward mit offset liest das zweite Netz im Genom', () => { /* [2,1]-Netz hinter 5 Füllwerten: gleiches Ergebnis wie allein */ });
test('strategyInput: 7 Werte in [-1,1], Reihenfolge wie im Design', ...);
test('decide bildet die vier Ausgaben ab', () => { /* Genom mit Bias-Werten: box true/false, fuelTarget 0.25, tyres, pace 0.9 */ });
test('fehlende Rundenzeit (erste Runde) ergibt 0 im Eingang, nie NaN', ...);
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün · **Step 5:** Commit `feat: strategy net`

### Task 5: Ausdauer-Welt mit Box

**Files:** Modify `src/core/rules.js`, `src/core/sensors.js`, `src/core/world.js`, `src/core/endurance.js`; Create `test/world-ausdauer.test.js`

**Interfaces – Consumes:** Task 1–4
**Produces:**
- `RULES_AUSDAUER = { id: 'ausdauer', wallContact: 'damage', tracksPerGen: 3, raceSeconds: [200, 320], lapTimeout: 150, stall: { seconds: 4, minProgress: 5 }, rayRange: 150, carRadius: 1, channels: [...die 12 aus fahren, { type: 'grip' }, { type: 'fuel' }, { type: 'pace' }], endurance: ENDURANCE, strategy: { sizes: STRATEGY_SIZES, decideBefore: 80 }, pit: { base: 14, perKg: 0.06, tyres: 6, perDamage: 20, exitSpeed: 15 }, clean: (car, track) => car.endReason === 'zeit' && car.progress >= track.length }`
- `sense`: `grip` = aktueller Haftungsfaktor, `fuel` = `fuel / tank`, `pace` = Tempovorgabe; für Autos ohne Zustand 1, 0, 1
- Genom im Ausdauer-Modus: Fahrer-Netz (`sizes`), dahinter Strategie-Netz. `genomeLengthFor(rules, sizes): number` in `world.js`
- `Car` bekommt im Ausdauer-Modus: `cond`, `laps`, `lapStart` (Zeit), `lastLap`, `bestLap`, `fuelAtLapStart`, `fuelPerLap`, `decision` (letzte Entscheidung oder `null`), `pit` (`null` oder `{ left: Sekunden, fuel, tyres }`), `stops`, `pitTime` (Summe), `stints: { start, end }[]`
- neue `endReason`: `'schaden'` (Schaden 1), `'sprit'` (Tank leer **und** Auto steht), dazu weiterhin `'stillstand'`, `'zeit'`, `'runde'`
- `pitDuration(cond, decision, rules): number` in `endurance.js` = `base + perKg · max(0, fuelTarget · tank − fuel) + (tyres ? pit.tyres : 0) + perDamage · damage`
- Ablauf je Schritt für ein Auto: in der Box → Zeit abziehen, bei 0 Tank, Reifen, Schaden setzen und mit `exitSpeed` an der Startpose freigeben; sonst `sense` → Fahrer-Netz → `stepCar` mit Zustand → `wearAndBurn` → Wand (`hitWall`) → Fortschritt. Überschreitet der Fortschritt `k · length − decideBefore`, entscheidet das Strategie-Netz (auch einmal beim Start); `pace` gilt sofort. Überschreitet er `k · length`: Runde zählen, Rundenzeit und Verbrauch je Runde merken; bei `decision.box` beginnt der Stopp. Mit `untilLap` endet das Auto an der Linie, ohne Stopp.
- Ein Auto in der Box zählt nicht als Stillstand. Läuft die Rennzeit ab, endet es mit `'zeit'`; seine Distanz ist der Fortschritt bis zur Einfahrt.

- [ ] **Step 1: Tests** (Kreisstrecke; Fahrer-Teil des Genoms mit festen Ausgaben wie in `world.test.js`, Strategie-Teil mit festen Ausgaben über Bias)

```js
test('Regelsatz ausdauer: 15 Kanäle, Wandkontakt als Schaden', ...);
test('sense liefert Haftung, Tankanteil, Tempovorgabe', ...);
test('ohne Box rollt das Auto mit leerem Tank aus und fällt aus', () => { /* endReason 'sprit', vorher fuel === 0 */ });
test('mit Box in jeder Runde: Stopps > 0, Tank wird gefüllt, Rennen endet mit zeit', ...);
test('Stopp dauert so lange wie pitDuration und das Auto steht dabei', () => { /* Fortschritt ändert sich während pit nicht; Dauer ± 1 Schritt */ });
test('Reifenwechsel nur wenn gewählt; Reparatur setzt Schaden auf 0', ...);
test('Tankziel unter aktuellem Stand: keine negative Standzeit, Tank bleibt', ...);
test('Entscheidung fällt einmal pro Runde und einmal am Start', () => { /* Zähler über decision-Wechsel */ });
test('Tempovorgabe wirkt: pace 0 fährt langsamer und verbraucht weniger je Runde', ...);
test('Wand macht Schaden statt Ende; Schaden 1 ist Ausfall', () => { /* Geradeausfahrer: endReason 'schaden' oder 'stillstand', nie 'wand'; damage wächst */ });
test('Zeit läuft während des Stopps ab: endReason zeit, Distanz bis zur Einfahrt', ...);
test('untilLap endet an der Linie ohne Stopp', ...);
test('Autos beeinflussen sich nicht', ...);
test('gleiche Eingabe, gleiches Ergebnis', ...);
test('nie NaN: 200 Zufallsgenome fahren ein Rennen', () => { /* alle Zustandswerte endlich, fuel ≥ 0, damage ≤ 1 */ });
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen; der Pfad für Regelsätze ohne `endurance` bleibt Zeile für Zeile unverändert · **Step 4:** grün inkl. Golden-Test · **Step 5:** Commit `feat: endurance world with pit stops`

### Task 6: Trainer für Ausdauer

**Files:** Modify `src/core/trainer.js`, `test/trainer.test.js`; Create `test/trainer-ausdauer.test.js`

**Interfaces – Produces:**
- `createTrainer({ rules: RULES_AUSDAUER, ... })`: Genomlänge über `genomeLengthFor`; Strategie-Gewichte zufällig wie beim Fahrer-Netz
- `createTrainer({ rules, drivers: { genomes: Float32Array[], sizes: number[], difficulty: number } })`: jedes Genom der neuen Population entsteht aus einem der Fahrer (der Reihe nach, bei weniger Fahrern als Plätzen von vorn); Gewichte der bisherigen Eingaben werden übernommen, die der neuen Eingaben sind 0, das Strategie-Netz ist zufällig. `difficulty` wird übernommen. Passen versteckte Schichten nicht → `null`.
- `expandDriver(genome, fromSizes, toSizes): Float32Array | null`
- `GenStats` im Ausdauer-Modus zusätzlich: `stops` (Stopps des Besten, Mittel über die Strecken), `retired` (Anzahl seiner Ausfälle, 0…3), `laps` (Runden des Besten, Mittel)
- `runTest` nutzt `untilLap` unter dem Regelsatz des Trainers; `ok` heißt `'runde'`
- `ruleSet('ausdauer')` liefert den Regelsatz; `serialize`/`restoreTrainer` funktionieren für beide

- [ ] **Step 1: Tests**

```js
test('Ausdauer-Trainer: Genomlänge = Fahrer [15,16,16,2] + Strategie [7,8,4]', ...);
test('gleicher Seed, identischer Verlauf (Ausdauer)', ...);
test('Rennlänge je Generation liegt in [200, 320] und ist für alle Autos gleich', ...);
test('Speichern und Laden (Ausdauer) ändert nichts', ...);
test('expandDriver: alte Gewichte bleiben, neue Eingaben wiegen 0', () => { /* Netz mit 12 und mit 15 Eingaben liefert bei neuen Eingaben = beliebig dieselbe Ausgabe */ });
test('Start aus Fahrern: Population fährt sofort (Fortschritt der Besten ≥ 600 m in Generation 1)', () => { /* Fahrer aus 25 Generationen fahren-Training, Seed 2 */ });
test('Start aus unpassenden Fahrern ergibt null', () => { /* andere versteckte Schichten, leere Liste, kaputte Längen */ });
test('GenStats trägt stops, retired, laps', ...);
test('fahren-Trainer hat diese Felder nicht und läuft wie bisher', ...);
```

- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** grün inkl. Golden-Test · **Step 5:** Commit `feat: trainer for endurance, start from trained drivers`

### Task 7: Messung, Abstimmung, Nachweis

**Files:** Create `scripts/proof-ausdauer.js`, `docs/stufe-2-nachweis.md`; Modify `scripts/bench.js`, `package.json`

- [ ] **Step 1:** `bench.js` um den Ausdauer-Modus erweitern (`ms/Generation` für 10 Generationen ab Stufe-1-Fahrern). Ziel: **unter 5 s** pro Generation im Mittel. Verfehlt: zuerst Profil, dann in dieser Reihenfolge `raceSeconds` auf `[160, 260]`, Sensoren und Netz nur jeden 2. Schritt, Population 40. Nicht die Physik vereinfachen.
- [ ] **Step 2:** Raten abstimmen mit einem trainierten Fahrer bei Tempovorgabe 1: Tank reicht 110 ± 15 s, Reifen erreichen den Knick nach 170 ± 25 s. `burn`, `wearBase`, `wearLoad` anpassen und die gemessenen Werte notieren.
- [ ] **Step 3:** `scripts/proof-ausdauer.js [--seeds 6] [--gens 80]`: je Startwert erst 60 Generationen „fahren“, dann Ausdauer aus diesen Fahrern. Geprüft wird der Beste jeder 5. Generation in einem frischen Rennen (mittlere Rennlänge, Strecke aus dem Kontrollsatz): (a) kein Ausfall, (b) mindestens ein Stopp, (c) dasselbe Auto mit Strategie „nie Box“ fällt wegen `'sprit'` aus. Ausgabe je Startwert: Generation des ersten Bestehens, Stopps, Stintlängen, Distanz, und zum Vergleich die Distanz der Generation 5. Exit 0, wenn mindestens 4 von 6 bestehen.
- [ ] **Step 4:** Lauf. Besteht es nicht: Verlauf der gescheiterten Startwerte ansehen (Ausfallgründe, Stopps pro Rennen, Tankmenge). Zulässige Hebel: Raten und Zeiten in `ENDURANCE` und `pit`, `raceSeconds`, Evolutionsparameter, Lehrplan. Unzulässig: Boxenregeln im Code, zusätzliche Eingaben, ausgesuchte Startwerte, Abschwächen der drei Bedingungen.
- [ ] **Step 5:** Zusätzlich messen und berichten, **ob** Strategie gelernt wird, nicht nur ob das Rennen überlebt wird: Distanz des Besten gegen zwei feste Vergleichsstrategien mit demselben Fahrer (jede Runde Box; Box nur bei Tank unter 15 %). Die Vergleichsstrategien existieren nur in diesem Skript.
- [ ] **Step 6:** `docs/stufe-2-nachweis.md`: Ausgaben wörtlich, endgültige Werte, Änderungen gegenüber dem Plan. Fällt der Vergleich aus Step 5 schlecht aus, steht das dort unverändert.
- [ ] **Step 7:** `npm test` grün · Commit `feat: endurance benchmark and proof, tuned rates`

### Task 8: Oberfläche

**Files:** Modify `index.html`, `src/ui/main.js`, `src/ui/view-track.js`, `src/ui/view-net.js`, `src/ui/view-chart.js`, `src/ui/probe.js`, `scripts/smoke.cjs`; Create `src/ui/gauges.js`

**Produces (DOM-IDs):** `#mode-fahren`, `#mode-ausdauer`, `#start-choice` (mit `#btn-from-drivers`, `#btn-from-zero`), `#start-note`, `#speed-16`, `#gauges` (mit `#g-fuel`, `#g-tyres`, `#g-damage`), `#radio`, `#stat-stops`

Verhalten:
- Umschalter „Fahren lernen“ / „Ausdauer“ über der Strecke. Jeder Modus hat eigenen Trainer und eigenen gespeicherten Stand. Wechsel pausiert, beendet eine laufende Probefahrt und zeigt Kennzahlen, Kurve und Tabelle des gewählten Modus.
- Erster Besuch von „Ausdauer“ (kein gespeicherter Stand): Auswahl `#start-choice`. „Mit meinen Fahrern starten“ ist nur aktiv, wenn „Fahren lernen“ mindestens 20 Generationen hat; sonst steht daneben, warum nicht. Scheitert die Übernahme, erscheint in `#start-note` „Die Fahrer aus ‚Fahren lernen‘ passen nicht. Ausdauer beginnt mit Zufallsnetzen.“ und es wird von null gestartet.
- „Zurücksetzen“ im Ausdauer-Modus zeigt die Auswahl erneut.
- `#gauges`: drei Balken für das führende Auto (Sprit, Reifen, Schaden) mit Zahl; Reifenbalken zeigt den Knick als Marke. Nur im Ausdauer-Modus sichtbar.
- `#radio` („Boxenfunk“): letzte Entscheidung des führenden Autos in Worten, z. B. „Diese Runde an die Box · tanken auf 80 % · neue Reifen · Tempo 85 %“ oder „Draußen bleiben · Tempo 100 %“.
- Autos in der Box stehen neben der Startlinie und sind als solche erkennbar. Die Statuszeile nennt Runden und Stopps des Führenden.
- `#speed-16` (16×) nur im Ausdauer-Modus.
- Kachel `#stat-stops`: Stopps des Besten in der letzten Generation. Tabelle und Tooltip der Lernkurve nennen Stopps und Ausfälle.
- Netz-Ansicht zeigt das Fahrer-Netz mit 15 Eingaben („Haftung“, „Sprit“, „Tempo-Vorgabe“).
- Probefahrt und Zeichenmodus nutzen den Regelsatz des gewählten Modus; das Ergebnis nennt den Modus.
- Erklärtext im Ausdauer-Modus: was dazukommt, und dass die Box gelernt, nicht programmiert wird.

- [ ] **Step 1:** `smoke.cjs` erweitern:
  - Modus Ausdauer ohne trainierte Fahrer: `#btn-from-drivers` deaktiviert mit Begründung; `#btn-from-zero` startet, `#stat-gen` zählt, `#gauges` sichtbar
  - nach 20 Generationen „Fahren lernen“: Ausdauer → Zurücksetzen → „Mit meinen Fahrern starten“ → nach 1 Generation `#stat-stops` ist eine Zahl, `#radio` hat Text
  - Wechsel zurück zu „Fahren lernen“: `#stat-gen` zeigt wieder dessen Wert, `#gauges` verborgen; erneut Ausdauer: dessen Wert
  - Neuladen: beide Stände erhalten
  - kaputter Stand unter `rennlabor:ausdauer`: Seite lädt, Auswahl erscheint, kein Konsolenfehler
  - kaputter Stand unter `rennlabor:fahren` bei vorhandenem Ausdauer-Stand: beide Modi bedienbar
  - Moduswechsel während einer Probefahrt: kein Konsolenfehler, Probefahrt-Meldung verschwindet
  - Probefahrt im Ausdauer-Modus liefert ein Ergebnis
  - 400 px: kein horizontales Scrollen im Ausdauer-Modus
- [ ] **Step 2:** rot · **Step 3:** umsetzen · **Step 4:** `node scripts/smoke.cjs` alle `ok`, `npm test` grün; je ein Screenshot Ausdauer hell und 400 px ansehen und sichtbare Fehler beheben · **Step 5:** Commit `feat: endurance mode in the page`

### Task 9: Veröffentlichen

- [ ] **Step 1:** `README.md` um den Ausdauer-Modus, `npm run proof:ausdauer` und den Nachweis ergänzen.
- [ ] **Step 2:** Seite auf dieselbe Adresse veröffentlichen (`index.html` und alle Dateien unter `src/`).
- [ ] **Step 3:** Commit `docs: readme for stage 2`, Branch pushen, Draft-PR gegen `stufe-1-fahren-lernen` anlegen: was die Stufe kann, Nachweis wörtlich, was der Vergleich aus Task 7 Step 5 ergab.
