# KI-Rennlabor

Kleine neuronale Netze lernen per Evolution Autofahren, live im Browser.
Sie sehen nur neun Abstände zur Wand, ihr Tempo, ihr seitliches Rutschen und ihren Lenkwinkel,
und sie müssen das Gelernte auf Strecken übertragen, die im Training nie vorkommen.

Zwei Modi sind fertig:

- **Fahren lernen:** Zufallsnetze lernen, eine Strecke zu fahren. Wandkontakt beendet die Fahrt.
- **Ausdauer:** Reifen verschleißen, Sprit wird verbraucht und wiegt, Wandkontakt macht Schaden.
  Ein zweites kleines Netz entscheidet einmal pro Runde über Box, Tankmenge, Reifen und Tempo.
  Diese Strategie wird gelernt, es gibt keine programmierte Boxenregel.

Geplant sind mehrere Teams mit verschiedenen Autos, die gegeneinander fahren.

## Ausprobieren

```bash
npm run serve
```

Danach http://localhost:4173 öffnen. Es gibt keine Abhängigkeiten zu installieren.

## Prüfen

```bash
npm test
```

```bash
npm run smoke
```

```bash
npm run proof
```

```bash
npm run proof:ausdauer
```

- `npm test`: Tests des Simulationskerns (Node, ohne Browser).
- `npm run smoke`: bedient die Seite in einem echten Browser (Playwright muss vorhanden sein).
- `npm run proof`: Lernnachweis „Fahren lernen“ über 10 Startwerte, dauert einige Minuten.
- `npm run proof:ausdauer`: Nachweis „Ausdauer“ über 6 Startwerte samt Vergleich mit festen Strategien, dauert etwa 10 Minuten.
- `npm run bench`: misst die Rechenzeit pro Generation.

## Aufbau

| Ort | Inhalt |
|---|---|
| `src/core/` | Simulation ohne Browser: Zufall, Netz, Strecke, Generator, Physik, Sensoren, Welt, Evolution, Trainer, Verschleiß und Box, Strategie-Netz |
| `src/ui/` | Oberfläche: Streckenansicht, Netzansicht, Lernkurve, Probefahrt, Zeichenmodus |
| `index.html` | die Seite |
| `test/` | Tests je Kernmodul |
| `scripts/` | lokaler Server, Messung, Lernnachweis, Browser-Rauchtest |

## Dokumente

- [Design](docs/superpowers/specs/2026-11-27-ki-endurance-rennen-design.md)
- [Plan Stufe 1](docs/superpowers/plans/2026-11-27-stufe-1-fahren-lernen.md)
- [Lernnachweis Stufe 1](docs/stufe-1-nachweis.md)
- [Plan Stufe 2](docs/superpowers/plans/2026-11-27-stufe-2-ausdauer.md)
- [Nachweis Stufe 2](docs/stufe-2-nachweis.md)
