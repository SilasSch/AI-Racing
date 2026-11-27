# Stufe 1: Lernnachweis und Messung

Stand: 2026-11-27. Beide Ausgaben stammen vom Code dieses Commits und sind wörtlich wiedergegeben.

## Lernnachweis

Abnahme laut Design: Der Beste schafft nach höchstens 150 Generationen mindestens 16 von 20 Teststrecken,
geprüft über 10 Startwerte, von denen mindestens 8 bestehen müssen. Befehl: `npm run proof`

```
Lernnachweis: mindestens 16 von 20 unbekannten Strecken innerhalb von 150 Generationen

Seed | bestanden in Generation | Testsatz (20) | Kontrollsatz (100) | Schwierigkeit am Ende | Rechenzeit
-----|-------------------------|---------------|--------------------|-----------------------|-----------
   1 | 105                     | 16/20         | 77/100             | 1                     | 51 s
   2 | 45                      | 17/20         | 93/100             | 1                     | 17 s
   3 | 40                      | 18/20         | 92/100             | 0.9                   | 15 s
   4 | 50                      | 20/20         | 98/100             | 1                     | 22 s
   5 | 55                      | 19/20         | 98/100             | 1                     | 24 s
   6 | 75                      | 16/20         | 85/100             | 1                     | 36 s
   7 | 40                      | 18/20         | 95/100             | 1                     | 18 s
   8 | 80                      | 16/20         | 79/100             | 1                     | 38 s
   9 | 65                      | 18/20         | 91/100             | 1                     | 29 s
  10 | 95                      | 16/20         | 90/100             | 1                     | 40 s

Kontrollsatz: Das Auto, das den Test als erstes bestand, schafft im Mittel 90 von 100 Strecken, die weder Training noch Auswahl je gesehen haben (schlechtester Startwert: 77).
10 von 10 Startwerten bestanden (gefordert: 8).
```

Was diese Zahlen bedeuten und was nicht:

- „Bestanden in Generation" ist der **erste** Test, bei dem das beste Auto der Generation 16 von 20 schafft.
  Getestet wird alle 5 Generationen. Das entspricht der Abnahmebedingung, ist aber die freundlichste Lesart:
  Von bis zu 30 schwankenden Tests zählt der erste Treffer.
- **Kontrollsatz (100)** ist die ehrliche Messung. Diese 100 Strecken sieht weder das Training noch
  irgendeine Auswahl. Gefahren wird dasselbe Auto, das den Test als erstes bestand. Im Mittel schafft es
  90 von 100, beim schwächsten Startwert 77. Die Übertragung auf unbekannte Strecken ist also echt,
  liegt aber nicht bei jedem Startwert über 80 %.
- Das Testergebnis schwankt nach dem ersten Bestehen weiter, teils stark. Jede Generation kürt das Auto
  zum Besten, das auf ihren drei Strecken am weitesten kam, und darunter sind auch schnelle Draufgänger
  mit Glück. Die Lernkurve auf der Seite zeigt diese Schwankung unverändert.
- Für Probefahrt und gezeichnete Strecken nutzt die Seite deshalb das Auto mit dem bisher besten
  Testergebnis (`trainer.proven`) und nennt es beim Namen („Auto aus Generation N"). Dessen eigene
  Testzahl ist geschönt, weil es nach genau diesem Test ausgesucht wurde.

## Rundenzeit: Abweichung vom Design

Das Design (Abschnitt 6.3) nennt als Richtwert 20 bis 30 simulierte Sekunden pro Runde auf einer
mittleren Strecke. **Gemessen sind 45 bis 75 Sekunden.** Die Autos fahren zum Zeitpunkt des ersten
Bestehens vorsichtig, mit etwa 100 bis 135 km/h von möglichen 285.

Kürzere Strecken beheben das nicht. Gemessen mit Streckenradius 85, 105 und 125 m statt 190 m
(je 4 Startwerte): Die Runde auf mittleren Strecken dauert weiterhin 32 bis 57 Sekunden, weil die Autos
auf engeren Strecken entsprechend langsamer fahren. Der Lernnachweis besteht in allen Varianten.
Die Streckenlänge bleibt deshalb unverändert.

Folgen: Eine Runde ist länger als die 45 Sekunden Fahrzeit im Training, das Training fährt also nie
eine ganze Runde am Stück. Für Stufe 2 müssen Tankgröße und Rennlänge aus gemessenen Rundenzeiten
abgeleitet werden, nicht aus dem Richtwert.

## Rechenzeit

Befehl: `npm run bench` (ein Kern, Node 22, in dieser Arbeitsumgebung)

```
car-steps/s: 253,390
ms/Generation: 367 (Generationen 26-35, Schwierigkeit 0.6)
```

Ziel war eine Generation im Mittel unter 700 ms. Erreicht. Im ungünstigsten Fall, wenn alle 60 Autos alle
drei Strecken 45 Sekunden lang überleben, sind es 243 000 Auto-Schritte, also knapp eine Sekunde.

## Endgültige Zahlenwerte

| Was | Wert |
|---|---|
| Zeitschritt | 1/30 s |
| Population, Eliten, Turnier | 60, 4, 3 |
| Mischen, Mutationsrate, Mutationsstärke | 0,5 · 0,1 · 0,15 |
| Strecken pro Generation, Fahrzeit je Strecke | 3, 45 s |
| Netz | 12 → 16 → 16 → 2, tanh |
| Sensoren | 9 Strahlen bei ±90°, ±55°, ±30°, ±12°, 0°; Reichweite 150 m; Wert = Wurzel(Abstand / Reichweite) |
| Auto | 1000 kg, 300 kW, Haftung 1,4, Höchsttempo etwa 285 km/h |
| Antrieb nutzt höchstens | 70 % der Haftung (`traction`) |
| Lenkung begrenzt auf | das 1,3-Fache der verfügbaren Haftung (`overdrive`): übersteuern in den Rutscher geht, auf der Stelle drehen nicht |
| Lehrplan | +1 von 10, wenn der Beste der Vorgeneration 2 von 3 neuen Strecken sauber schafft |
| Teststrecken | 20, Schwierigkeit 0 bis 10 gleichmäßig, Seeds mit gesetztem höchstem Bit |
| Kontrollstrecken | 100, eigener Seed-Strom, nur für den Lernnachweis |

## Was gegenüber dem Plan geändert wurde, und warum

1. **Lehrplan misst den Besten der Vorgeneration auf neuen Strecken**, nicht den Besten der laufenden
   Generation. Der Beste von 60 auf genau den Strecken, auf denen er ausgewählt wurde, hat immer Glück gehabt.
   Mit der ursprünglichen Regel stand die Schwierigkeit nach 40 Generationen auf 10, und kein Startwert bestand.
2. **Sensorwerte als Wurzel des Abstands.** Linear ergab ein Abstand von 8 m zur Wand den Wert 0,05.
   Das war zu schwach, um danach zu lenken. Die Eingaben sind weiterhin nur gemessene Abstände.
3. **`traction` 0,7.** Ohne diese Grenze bleibt bei Vollgas unter 80 km/h keine Seitenführung übrig,
   und jedes Zufallsnetz rutscht schon am Start von der Bahn.
4. **Wandkontakt ab 1 m Abstand** (`carRadius`), damit das gezeichnete Auto nicht sichtbar in der Wand steckt.
5. **Ein Rechenschritt endet an der Generationsgrenze.** Vorher konnte ein Aufruf unbemerkt mehrere
   Generationen durchlaufen.

Nicht verändert wurden: die Abnahmebedingung, die Liste erlaubter Eingaben, und es gibt kein fest
programmiertes Fahrverhalten.
