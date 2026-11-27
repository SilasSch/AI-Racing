# KI-Rennlabor

Kleine neuronale Netze lernen per Evolution Autofahren, live im Browser.
Sie sehen nur neun Abstände zur Wand, ihr Tempo, ihr seitliches Rutschen und ihren Lenkwinkel,
und sie müssen das Gelernte auf Strecken übertragen, die im Training nie vorkommen.

Stufe 1 (Fahren lernen) ist fertig. Geplant sind Ausdauerrennen mit Boxenstrategie und mehrere Teams.

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

- `npm test`: Tests des Simulationskerns (Node, ohne Browser).
- `npm run smoke`: bedient die Seite in einem echten Browser (Playwright muss vorhanden sein).
- `npm run proof`: Lernnachweis über 10 Startwerte, dauert einige Minuten.
- `npm run bench`: misst die Rechenzeit pro Generation.

## Aufbau

| Ort | Inhalt |
|---|---|
| `src/core/` | Simulation ohne Browser: Zufall, Netz, Strecke, Generator, Physik, Sensoren, Welt, Evolution, Trainer |
| `src/ui/` | Oberfläche: Streckenansicht, Netzansicht, Lernkurve, Probefahrt, Zeichenmodus |
| `index.html` | die Seite |
| `test/` | Tests je Kernmodul |
| `scripts/` | lokaler Server, Messung, Lernnachweis, Browser-Rauchtest |

## Dokumente

- [Design](docs/superpowers/specs/2026-11-27-ki-endurance-rennen-design.md)
- [Plan Stufe 1](docs/superpowers/plans/2026-11-27-stufe-1-fahren-lernen.md)
- [Lernnachweis Stufe 1](docs/stufe-1-nachweis.md)
