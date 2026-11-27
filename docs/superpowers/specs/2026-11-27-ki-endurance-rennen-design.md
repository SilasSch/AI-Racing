# KI lernt Endurance-Rennen: Design

Stand: 2026-11-27

## 1. Absicht

Der Auftraggeber ist beeindruckt von „KI lernt …“-Videos (Mario, Rennspiele) und
möchte so etwas selbst erleben: einem kleinen neuronalen Netz dabei zusehen, wie es
vom planlosen Crash zum sauberen Fahren kommt. Es geht ums **Zusehen und Verstehen**,
nicht um ein spielbares Spiel und nicht um ein Produkt.

Zwei Wünsche gehen über die üblichen Videos hinaus:

1. Das Gelernte soll auf **unbekannte Strecken** übertragbar sein, und das soll
   messbar sein.
2. Es soll **komplex** sein: echte Fahrphysik, dann ein **Ausdauerrennen** mit Reifen,
   Sprit und Boxenstopps, dann **mehrere Teams** mit verschiedenen Autos, Netzen und
   daraus entstehenden Strategien.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

- Das Lernen passiert live im Browser und ist sichtbar: Autos auf der Strecke,
  Sensorstrahlen, Netz mit Aktivierungen, Lernkurven.
- Das beste Netz fährt Strecken, die es im Training nie gesehen hat, und eine
  Anzeige belegt das mit Zahlen.
- Der Nutzer kann eine eigene Strecke zeichnen und das trainierte Auto darauf fahren
  lassen.
- Strategien (Stintlänge, Tankmenge, Reifenwechsel, Tempo) werden **gelernt**, nicht
  programmiert.
- Nach jeder Stufe gibt es etwas Lauffähiges zum Ansehen.

**Nicht-Ziele (bewusst weggelassen)**

- Mario oder ein Jump'n'Run.
- Gradientenbasiertes RL (DQN, PPO). Gewählt wurde Evolution, siehe Abschnitt 4.
- Wachsende Netzstruktur (NEAT). Die Netze haben feste Größe.
- Echter Verkehr (Kollisionen, Überholen): erst Stufe 4, hier nur vorbereitet.
- Nacht, Regen: nach Stufe 3, hier nicht geplant.
- Vom Menschen steuerbares Auto, 3D-Grafik, Sound, Mehrspieler, Team-Editor.

**Anti-Ziele (wäre ein Fehlschlag, auch wenn es läuft)**

- Fest programmiertes Fahr- oder Boxenverhalten, das als gelernt ausgegeben wird.
- Mitgelieferte, vortrainierte Gewichte. Jedes Training beginnt mit Zufallsgewichten.
- Eingaben, die dem Netz die Strecke verraten (Position, Rundenfortschritt,
  Richtung der Mittellinie, Krümmung voraus). Das Auto sieht nur, was es messen kann.
- Eine Aussage „es verallgemeinert“, ohne dass sie auf nie gesehenen Strecken
  gemessen wurde.
- Eine Simulation, die im Training und im Rennen unterschiedlich rechnet.

## 3. Rahmenbedingungen

- Läuft als Webseite ohne Server und ohne Installation; ausgeliefert als
  veröffentlichte Seite (Artifact), die der Nutzer in der Claude-App öffnet.
- Keine GPU. Alles rechnet in JavaScript im Browser.
- Externe Skripte sind nur von wenigen CDNs erlaubt; geplant ist **ohne jede
  Bibliothek** (Netz, Evolution, Physik, Diagramme von Hand).
- Oberfläche auf Deutsch. Desktop zuerst; auf Telefonbreite muss die Seite bedienbar
  bleiben und darf nicht horizontal scrollen.
- Quelltext, Tests und dieses Dokument liegen im GitHub-Repository
  `SilasSch/AI-Racing`. Die Arbeitsumgebung selbst ist flüchtig; was bleiben soll,
  wird dorthin gepusht.

## 4. Ansätze

| | A: Evolution im Browser | B: echtes RL (DQN) im Browser | C: Python + RL-Bibliothek |
|---|---|---|---|
| Lernen | Population fährt gleichzeitig, die Besten werden kopiert und mutiert | ein Auto, Belohnung pro Schritt, Gradientenabstieg | fertiger PPO |
| Bild | Schwarm wie in den Videos | ein Auto plus Reward-Kurve | Log, danach Video |
| Zeit bis es fährt | etwa 1–2 Minuten | einige Minuten, instabiler | 10+ Minuten ohne GPU |
| RL im strengen Sinn | nein | ja | ja |

**Gewählt: A**, vom Auftraggeber, obwohl die erste Anfrage „Reinforcement Learning“
nannte. Grund: Der Schwarm-Look der Videos und das zuverlässige, schnelle Lernen.
Das bekannte Mario-Video (MarI/O) nutzt selbst Evolution. B war meine Empfehlung,
weil es dem Wortlaut entspricht; C fällt weg, weil man nicht live zusehen kann.

Für das Rennen wurde zusätzlich entschieden: **Geisterrennen** (Autos fahren
gleichzeitig, aber durcheinander hindurch). Echter Verkehr ist Stufe 4.

## 5. Stufen

| Stufe | Inhalt | Fertig, wenn |
|---|---|---|
| 1 | Fahren lernen auf Zufallsstrecken, Verallgemeinerung messen, Strecke zeichnen | Abschnitt 12, Stufe 1 |
| 2 | Ausdauer: Reifen, Sprit, Schaden, Box, Strategie-Netz | Abschnitt 12, Stufe 2 |
| 3 | Teams mit verschiedenen Autos und Netzen, Rennen mit Rangliste | Abschnitt 12, Stufe 3 |
| 4 | Echter Verkehr | nicht Teil dieses Designs |

Jede Stufe wird einzeln geplant, gebaut, veröffentlicht und vom Auftraggeber
angesehen, bevor die nächste beginnt. Die Seite wird dabei erweitert, nicht neu
gebaut.

## 6. Simulation (gilt für alle Stufen)

Entscheidungen in diesem Abschnitt sind meine Vorschläge, soweit nicht anders
vermerkt.

### 6.1 Grundsätze

- **Ein Simulationskern ohne Browser-Abhängigkeit.** Derselbe Code läuft im Browser
  und in Node (für Tests und für den Nachweis, dass gelernt wird).
- **Fester Zeitschritt** und **geseedeter Zufall** überall. Gleicher Seed ergibt
  auf derselben JavaScript-Engine dasselbe Ergebnis. Kein `Math.random()` im Kern.
  Gleichheit zwischen verschiedenen Engines (Node gegen Safari) ist **nicht**
  gefordert; eingebaute Mathematikfunktionen dürfen verwendet werden. (Meine
  Entscheidung.)
- **Seed auf der Seite:** Jedes Zurücksetzen würfelt einen neuen Seed. Er wird
  angezeigt und kann eingetragen werden, um einen Lauf zu wiederholen. Es gibt
  keinen ausgesuchten „Vorzeige-Seed“. (Meine Entscheidung.)
- **Regelsatz pro Stufe:** Der Kern bekommt die Regeln (Wandkontakt, Eingaben,
  Verschleiß, Box) als Regelsatz übergeben. Die Seite bietet die Stufen als
  wählbare Modi „Fahren lernen“ und „Ausdauer“ an, mit getrennt gespeicherten
  Trainingsständen. Stufe 1 bleibt also bestehen, wenn Stufe 2 dazukommt. (Meine
  Entscheidung.)
- **Mehrere Autos in einer Welt** von Anfang an, ohne Wechselwirkung. Kollisionen
  zwischen Autos sind ein Schalter, der in diesem Design aus bleibt (Vorbereitung
  Stufe 4). Sensoren sind als Liste von Kanälen aufgebaut, damit später
  „anderes Auto“-Strahlen dazukommen können.

### 6.2 Strecken

- Geschlossener Rundkurs: Mittellinie plus Breite, durch Wände begrenzt.
- **Generator:** Zufallspunkte, daraus eine geschlossene, glatte Kurve (z. B.
  konvexe Hülle, Zwischenpunkte verschieben, periodischer Spline). Ungültige
  Strecken werden verworfen und neu gewürfelt. Gültig heißt: geschlossen, keine
  Selbstüberschneidung, Fahrbahn berührt sich nirgends selbst, kleinster
  Kurvenradius nicht unter einem von der Breite abhängigen Mindestwert.
- **Schwierigkeit** als Zahl von 0 bis 1 steuert Kurvenenge, Fahrbahnbreite und
  Anzahl der Richtungswechsel.
- **Fahrtrichtung** und Spiegelung zufällig.
- **Start/Ziel** liegt auf dem geradesten Abschnitt. Dort liegt auch die Box.
- **Gezeichnete Strecke:** Der Nutzer zieht mit Maus oder Finger eine Schleife; sie
  wird geschlossen, geglättet und mit einer einstellbaren Breite versehen. Verstößt
  sie gegen die Gültigkeitsregeln, sagt die Seite, was nicht geht (z. B.
  „kreuzt sich selbst“), statt sie stillschweigend zu ändern.
- Fortschritt eines Autos ist die Bogenlänge entlang der Mittellinie plus volle
  Runden. Rückwärtsfahren zählt negativ.

### 6.3 Fahrphysik

Ein vereinfachtes, aber nicht „auf Schienen“ laufendes Modell:

- Zustand: Position, Blickrichtung, Geschwindigkeit längs und quer, Lenkwinkel.
- Antrieb leistungsbegrenzt (viel Schub bei wenig Tempo, wenig bei viel),
  Luftwiderstand quadratisch, Rollwiderstand.
- **Haftungsgrenze als Reibungskreis:** Längs- und Querkraft teilen sich die
  verfügbare Haftung. Wird sie überschritten, rutscht das Auto: Die Bewegungsrichtung
  folgt der Blickrichtung verzögert. Wer zu schnell einlenkt oder in der Kurve
  bremst, fliegt raus.
- Lenkung ist ratenbegrenzt. Die Masse enthält den Sprit (ab Stufe 2).
- Ausgaben des Fahrer-Netzes: Lenkung −1…1 und Gas/Bremse −1…1, stufenlos.

Zahlenwerte (Leistung, Masse, Haftung, Zeitschritt) legt der Erbauer fest und stimmt
sie so ab, dass eine Runde auf einer mittleren Strecke grob 20–30 simulierte
Sekunden dauert und Bremsen vor engen Kurven nötig ist.

> Stand nach Stufe 1: Der Richtwert wird verfehlt. Gemessen sind 45–75 Sekunden pro
> Runde, weil die Autos vorsichtig fahren; kürzere Strecken ändern daran nichts.
> Einzelheiten in `docs/stufe-1-nachweis.md`. Stufe 2 rechnet mit gemessenen
> Rundenzeiten.

### 6.4 Was das Fahrer-Netz sieht

Nur Größen, die ein Auto selbst messen könnte:

- 9 Abstandsstrahlen zur Wand, über etwa ±90° verteilt, vorn dichter, mit begrenzter
  Reichweite, normiert auf 0…1.
- Tempo längs, Tempo quer (Rutschen), aktueller Lenkwinkel.
- Ab Stufe 2 zusätzlich: aktuelle Haftung (aus Reifenzustand), Gewichtsanteil Sprit,
  Tempovorgabe des Strategie-Netzes.

Stufe 1: 12 Eingaben → 16 → 16 → 2. Feedforward, `tanh`, kein Gedächtnis.

### 6.5 Wandkontakt

- **Stufe 1:** Wandkontakt beendet den Lauf dieses Autos. Die bis dahin gefahrene
  Strecke zählt.
- **Ab Stufe 2:** Wandkontakt bremst stark und erzeugt **Schaden** abhängig von der
  Aufprallgeschwindigkeit. Schaden kostet Leistung und Haftung. Bei 100 % ist das
  Auto ausgefallen. Reparatur gibt es nur in der Box und kostet Zeit.

## 7. Lernen (Evolution)

- **Genom:** alle Gewichte eines Autos als ein flacher Zahlenvektor (ab Stufe 2:
  Fahrer-Netz und Strategie-Netz zusammen).
- **Population:** etwa 60 pro Team. Start mit Zufallsgewichten.
- **Bewertung:** Jedes Genom fährt pro Generation auf **3 frisch generierten
  Strecken**; alle Genome derselben Generation bekommen dieselben Strecken. Fitness
  ist der **Mittelwert der gefahrenen Distanz in fester Zeit**. Das belohnt Tempo
  und bestraft Crashs, ohne weitere Bonus-Terme.
- **Nächste Generation:** die wenigen Besten unverändert übernehmen, der Rest durch
  Auswahl (Turnier), Mischen zweier Eltern und kleine Zufallsänderungen der
  Gewichte. Mutationsstärke und -rate sind als Regler sichtbar.
- **Lehrplan:** Die Schwierigkeit der Trainingsstrecken beginnt niedrig und steigt,
  sobald der Beste die Mehrheit der Trainingsstrecken ohne Crash schafft. Sie sinkt
  nicht wieder.

### 7.1 Verallgemeinerung messen

- Ein **fester Testsatz von 20 Strecken** über alle Schwierigkeiten, erzeugt aus
  Seeds, die das Training nie verwendet.
- Alle paar Generationen fährt der aktuelle Beste den Testsatz. Angezeigt werden
  zwei Kurven über die Generationen: Leistung auf Trainingsstrecken und Leistung
  auf Teststrecken, plus „x von 20 Teststrecken ohne Crash geschafft“.
- Knopf „Neue Zufallsstrecke“ und der Zeichenmodus sind die anschauliche Probe
  daneben.
- Testsatz, Zufallsstrecke und Zeichenmodus laufen immer unter dem Regelsatz des
  gerade gewählten Modus. Im Modus „Ausdauer“ heißt „geschafft“: eine volle Runde
  ohne Ausfall. Dieselbe Bedingung steuert dort den Lehrplan. (Meine Entscheidung.)

## 8. Stufe 2: Ausdauer

### 8.1 Verschleiß und Verbrauch

- **Reifen:** Verschleiß wächst mit der Belastung (Querkraft, Rutschen, hartes
  Bremsen). Die Haftung fällt erst langsam, gegen Ende steil. Abgefahrene Reifen
  haben eine niedrige Resthaftung, das Auto fällt nicht aus.
- **Sprit:** Verbrauch hängt von der abgerufenen Leistung ab. Voller Tank macht das
  Auto schwer und langsam. Leerer Tank heißt ausgerollt und ausgefallen.
- Die Raten sind so gerafft, dass ein Tank etwa 5–8 Runden reicht und ein
  Trainingsrennen mindestens einen Stopp braucht.

> Stand nach Stufe 2: Ein Tank reicht etwa 3 Runden, nicht 5–8, und jedes Rennen braucht
> einen Stopp. Gestoppt wird gelernt, eine gute Stintlänge bisher nicht.
> Einzelheiten in `docs/stufe-2-nachweis.md`.

### 8.2 Box

- Die Box liegt an Start/Ziel. Hat das Strategie-Netz „Box“ angefordert, wird das
  Auto beim Überfahren der Einfahrt **automatisch** durch die Boxengasse geführt
  (wie mit Tempobegrenzer) und an der Ausfahrt wieder freigegeben. Das Fahrer-Netz
  muss die Boxengasse nicht fahren lernen.
- Standzeit = Durchfahrtsverlust + Tanken (proportional zur Menge) + Reifenwechsel
  (fester Betrag, nur wenn gewählt) + Reparatur (proportional zum Schaden).
  Tanken und Reifenwechsel laufen nacheinander, nicht gleichzeitig.

### 8.3 Strategie-Netz („Boxenfunk“)

Ein zweites, kleines Netz im selben Genom, etwa 7 → 8 → 4.

- **Eingaben:** Tankfüllung, Reifenverschleiß, Schaden, verbleibende Rennzeit,
  geschätzte Runden bis Tank leer, letzte Rundenzeit im Verhältnis zur besten,
  ein konstanter Eingang.
- **Ausgaben:** Box ja/nein, Tankmenge, Reifen wechseln ja/nein, Tempovorgabe.
- **Wann es entscheidet:** Boxenentscheidung einmal pro Runde kurz vor der Einfahrt.
  Die Tempovorgabe gilt bis zur nächsten Entscheidung.
- **Wirkung der Tempovorgabe:** Sie begrenzt die abrufbare Motorleistung (weniger
  Leistung, überproportional weniger Verbrauch) und wird dem Fahrer-Netz als
  Eingabe mitgegeben.

### 8.4 Bewertung

Distanz in fester Rennzeit, wie in Stufe 1, nur länger. Die Rennlänge im Training
schwankt zufällig in einem Bereich (Größenordnung 4–8 simulierte Minuten), damit die
Strategie nicht auf eine einzige Länge festgelegt ist. Ausfall beendet das Rennen
für das Auto; die Distanz bis dahin zählt.

Das Lernen in Stufe 2 darf auf den Fahrer-Gewichten aufbauen, die der Nutzer in
Stufe 1 **in seinem eigenen Browser** trainiert hat (auch nach einem Neuladen aus
dem lokalen Zwischenspeicher), oder von null starten. Die drei zusätzlichen
Eingaben beginnen dabei mit Gewicht null. Mitgelieferte Gewichte bleiben verboten.

## 9. Stufe 3: Teams und Rennen

- **Team** = Autotyp + Netzgrößen + eigene Population + Farbe und Name.
- Teams trainieren getrennt, aber jede Generation auf denselben Strecken, damit sie
  vergleichbar bleiben. Sie laufen dafür **im Gleichschritt** (jede Generation alle
  Teams) und teilen sich **eine gemeinsame Schwierigkeit**. Sie steigt, sobald
  mindestens die Hälfte der Teams die Bedingung aus Abschnitt 7 erfüllt. (Meine
  Entscheidung.)
- **Vier voreingestellte Teams** (Zahlenwerte stimmt der Erbauer ab):

| Team | Auto | Netz |
|---|---|---|
| Prototyp | viel Leistung, durstig, hoher Reifenverschleiß | Standard |
| GT | weniger Leistung, sparsam, robust gegen Schaden | Standard |
| Leichtbau | kleiner Tank, leicht, viel Haftung | Standard |
| Zwilling | wie GT | deutlich größeres Fahrer-Netz |

- Die Autos sollen so abgestimmt sein, dass kein Team von vornherein chancenlos
  ist (grob: nach dem Training liegen die Renndistanzen in derselben Größenordnung).
  Gelingt das nicht, wird das offen berichtet, nicht kaschiert.
- **Rennen:** Jedes Team stellt sein bestes Genom. Gefahren wird auf einer Strecke,
  die kein Team gesehen hat (zufällig oder gezeichnet), als Geisterrennen mit
  wählbarer Dauer. Standard liegt im trainierten Bereich; längere Rennen sind
  möglich, aber als Experiment gekennzeichnet.
- **Anzeige im Rennen:** Live-Rangliste (Platz, Runden, Abstand, Stint, Sprit,
  Reifen, Schaden, Stopps) und ein **Strategie-Diagramm**: pro Team ein Balken über
  die Rennzeit, unterteilt in Stints, mit Markierung der Stopps.

## 10. Oberfläche

Drei Ansichten, umschaltbar:

```
TRAINING
┌───────────────────────────────────┬──────────────────────┐
│ Strecke (Draufsicht)              │ Netz des Führenden   │
│  alle Autos der Generation,       │  Knoten nach         │
│  der Beste hervorgehoben          │  Aktivierung gefärbt │
│  mit Sensorstrahlen               │                      │
├───────────────────────────────────┼──────────────────────┤
│ Lernkurve: Training vs. Test      │ Generation 37        │
│ ▁▂▃▅▆▇  ▁▁▂▄▅▆                    │ Schwierigkeit ▓▓▓░░  │
│                                   │ Test: 17/20 Strecken │
├───────────────────────────────────┴──────────────────────┤
│ [▶ Start] [1x] [4x] [max]  [Zurücksetzen]   Mutation ▭▭ │
└──────────────────────────────────────────────────────────┘

RENNEN (Stufe 3)                      STRECKE ZEICHNEN
┌─────────────────┬─────────────┐     ┌────────────────────────┐
│ Strecke, 4 Autos│ Rangliste   │     │ Zeichenfläche          │
├─────────────────┴─────────────┤     │ Breite ▭▭  [Löschen]   │
│ Strategie-Diagramm (Stints)   │     │ [Bestes Auto fahren]   │
└───────────────────────────────┘     └────────────────────────┘
```

- Bei „max“ läuft die Simulation ohne Einzelbild-Darstellung; die Strecke zeigt dann
  pro Generation nur das Ergebnis. Die Seite bleibt dabei bedienbar.
- Ab Stufe 2 zeigt die Trainingsansicht Reifen, Sprit und Schaden des verfolgten
  Autos; ab Stufe 3 gibt es eine Teamauswahl.
- Trainingsstand wird, soweit der Browser es zulässt, lokal zwischengespeichert,
  damit ein Neuladen nicht alles verliert. Die Seite muss auch ohne funktionieren.

## 11. Dem Erbauer überlassen

- Alle Zahlenwerte der Physik, des Verschleißes, der Boxenzeiten und der Teams.
- Zeitschritt, Datenstrukturen, Art der Strahl- und Wandberechnung (z. B.
  Abstandsfeld auf einem Raster oder Liniensegmente mit Raster-Index).
- Dateiaufteilung, Art der Bündelung für die Veröffentlichung, Testwerkzeug.
- Ob das Training in Hintergrund-Threads (Web Worker) läuft oder im Hauptthread in
  Zeitscheiben. **Früh prüfen**, ob Worker in der veröffentlichten Seite überhaupt
  funktionieren; Zeitscheiben im Hauptthread sind die sichere Grundlage.
- Details der Evolution (Turniergröße, Elitenzahl, Mutationsverteilung), solange
  Abschnitt 7 gilt.
- Gestaltung der Oberfläche innerhalb des Aufbaus aus Abschnitt 10.

**Wartezeit als Obergrenze** (mein Vorschlag, vom Auftraggeber noch nicht
bestätigt), bei offenem Tab auf einem normalen Laptop:

| Stufe | Bis man es sieht |
|---|---|
| 1: sauberes Fahren | 1–2 Minuten |
| 2: erste sinnvolle Boxenstopps | bis 10 Minuten |
| 3: vier Teams rennfertig | 20–30 Minuten |

**Rechenbudget als Richtwert:** Eine Generation in Stufe 1 soll bei „max“ deutlich
unter einer Sekunde dauern, in Stufe 2 pro Team wenige Sekunden. Wird das nicht
erreicht, zuerst Rennlänge und Population verkleinern, nicht die Physik
vereinfachen.

## 12. Abnahme

Alle Nachweise laufen ohne Browser in Node, mit festem Seed, und zusätzlich einmal
sichtbar auf der veröffentlichten Seite.

**Stufe 1**

- Gleicher Seed ergibt identisches Ergebnis (Strecke, Fahrt, Generation).
- 1000 generierte Strecken über alle Schwierigkeiten erfüllen die Gültigkeitsregeln.
- Lernnachweis: Der Beste schafft nach höchstens 150 Generationen mindestens
  **16 von 20 Teststrecken** eine volle Runde ohne Wandkontakt. Weil die Seite mit
  beliebigem Seed startet, muss das für einen typischen Lauf gelten: geprüft wird
  über **10 verschiedene Seeds, mindestens 8 müssen bestehen**. (Meine
  Entscheidung.)
- Eine gezeichnete Strecke wird angenommen oder mit Begründung abgelehnt.

**Stufe 2**

- Der Beste beendet ein Trainingsrennen ohne leeren Tank und ohne Ausfall und macht
  dabei mindestens einen Boxenstopp.
- Gegenprobe: Mit ausgeschaltetem Strategie-Netz (nie Box) fällt dasselbe Auto aus.
  Das zeigt, dass die Box gebraucht und nicht geschenkt wird.

**Stufe 3**

- Alle vier Teams beenden ein Rennen auf einer ungesehenen Strecke.
- Rangliste und Strategie-Diagramm stimmen mit den Simulationsdaten überein.
- Ob die Teams wirklich **unterschiedliche** Strategien finden, ist das Experiment
  und keine Abnahmebedingung. Das Ergebnis wird berichtet, wie es ausfällt.

## 13. Bekannte Risiken

- **Geschwindigkeit:** JavaScript in einem Thread kann für Stufe 3 (vier
  Populationen, lange Rennen) zu langsam sein. Gegenmittel in Abschnitt 11.
- **Strategie wird nicht gelernt:** Das Signal „Box lohnt sich“ ist spät und selten.
  Möglicherweise braucht es mehr Generationen, kürzere Stints oder einen Start von
  Stufe-1-Gewichten. Fest programmierte Boxenregeln sind keine zulässige Abhilfe.
- **Verallgemeinerung nur innerhalb der Bauart:** Strecken, die der Generator nie
  erzeugt (Kreuzungen, extrem enge Haarnadeln), können scheitern. Die Seite soll das
  nicht verstecken.
- **Teams unausgeglichen:** Abstimmung der Autotypen kann mehrere Anläufe brauchen.
