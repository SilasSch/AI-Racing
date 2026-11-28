# Stufe 2: Nachweis und Messung

Stand: 2026-11-27. Die Ausgaben stammen vom Code dieses Commits und sind wörtlich wiedergegeben.

## Nachweis

Abnahme laut Design (Abschnitt 12, Stufe 2): Der Beste beendet ein Rennen ohne leeren Tank und ohne
Ausfall und macht dabei mindestens einen Boxenstopp. Gegenprobe: Ohne Box fällt dasselbe Auto aus.
Ein leerer Tank beendet ein Rennen sofort, „Rennen beendet“ heißt also auch „nie leer gefahren“.
Befehl: `npm run proof:ausdauer`

```
Nachweis Ausdauer: bis zu 80 Generationen, aufbauend auf 60 Generationen "Fahren lernen"
Start wie auf der Seite: alle Autos mit dem besten Fahrer, 40 Generationen lang lernt nur der Boxenfunk.
Prüfrennen: Kontrollstrecke 50, 480 s. Bestanden heißt: Rennen beendet (also nie mit leerem Tank), mindestens ein Stopp, und ohne Box wäre der Tank leer.

Seed | bestanden in Gen. | Stopps | Stints (s)        | Distanz  | Gen. 5: Distanz, Ende | Rechenzeit
-----|-------------------|--------|-------------------|----------|-----------------------|-----------
   1 | 60                | 3      | 99 / 100 / 100 / 125 | 6402 m   | 5675 m, zeit          | 385 s
   2 | 5                 | 3      | 159 / 78 / 78 / 96 | 8352 m   | 8352 m, zeit          | 486 s
   3 | 15                | 3      | 132 / 132 / 132 / 11 | 9851 m   | 4759 m, sprit         | 507 s
   4 | 5                 | 3      | 137 / 68 / 68 / 141 | 9737 m   | 9737 m, zeit          | 514 s
   5 | 5                 | 3      | 192 / 95 / 95 / 37 | 7090 m   | 7090 m, zeit          | 489 s
   6 | 5                 | 3      | 181 / 91 / 91 / 68 | 7502 m   | 7502 m, zeit          | 417 s

Ist die gelernte Strategie gut? Mittlere Distanz des letzten besten Autos auf 6 Kontrollstrecken, 480 s,
gegen feste Vergleichsstrategien mit demselben Fahrer und demselben Tempo:

Seed | gelernt  | jede Runde Box | so spät wie möglich | nie Box  | Stopps je Rennen: Gen. 40 / am Ende
-----|----------|----------------|---------------------|----------|--------------------------------
   1 | 7977 m   | 7796 m         | 8645 m              | 4781 m   | 1.3 / 3.7
   2 | 10215 m  | 8885 m         | 10239 m             | 4932 m   | 2.0 / 3.0
   3 | 9113 m   | 8794 m         | 10307 m             | 4787 m   | 2.0 / 3.7
   4 | 10670 m  | 9199 m         | 10543 m             | 4838 m   | 1.0 / 2.7
   5 | 9593 m   | 8647 m         | 9643 m              | 4902 m   | 2.0 / 2.0
   6 | 9439 m   | 9267 m         | 10395 m             | 3895 m   | 3.0 / 5.0

Gelernte Strategie mindestens so gut wie "so spät wie möglich": bei 1 von 6 Startwerten.
6 von 6 Startwerten bestanden (gefordert: 4).
```

## Was das zeigt und was nicht

- **Die Abnahme ist erfüllt.** Alle sechs Startwerte bestehen. Ohne Stopp („nie Box“) kommt derselbe
  Fahrer nur 41 bis 60 % so weit, weil er mit leerem Tank ausfällt.
- **Die Stintlänge wird jetzt gelernt, aber nicht gut genug, um eine Handregel zu schlagen.**
  Am Ende der ersten Phase (Generation 40) macht das beste Auto 1 bis 3 Stopps je Rennen statt
  4 bis 6. Gegen „jede Runde an die Box“ liegt die gelernte Strategie bei allen sechs Startwerten
  vorn, im Mittel um 8 %. Gegen „so spät wie möglich tanken“ liegt sie bei drei Startwerten
  gleichauf (innerhalb von 1,5 %) und bei drei um 8 bis 12 % zurück, im Mittel 5 % zurück.
- **In Phase 2 steigen die Stopps wieder etwas** (auf 2 bis 5). Sobald der Fahrer mitlernt, fährt er
  schneller und streift öfter die Wand, und jeder Stopp repariert den Schaden.
- Die Vergleichsstrategien gibt es nur im Nachweis-Skript. Sie übernehmen die Boxenentscheidung
  und lassen das Tempo des gelernten Netzes unverändert. In der Seite und im Kern entscheidet
  ausschließlich das Strategie-Netz.

## Was das Einfrieren des Fahrers gebracht hat

Zuerst starteten alle 60 Autos mit verschiedenen Fahrern aus „Fahren lernen“, und alles mutierte
gleichzeitig. Dabei lernte der Boxenfunk, jede Runde zu stoppen. Jetzt bekommen alle Autos den
Fahrer mit dem besten Testergebnis, und 40 Generationen lang verändert sich nur der Boxenfunk.
Beide Läufe mit denselben sechs Startwerten, 80 Generationen:

| Messung | vorher | jetzt |
|---|---|---|
| Stopps je Rennen in der Prüfung | 4 bis 6 | 3 |
| Stintlänge in der Prüfung | rund 62 s | 68 bis 192 s |
| Gelernt gegen „jede Runde an die Box“ | 2 % vorn | 8 % vorn |
| Gelernt gegen „so spät wie möglich“ | 5 % zurück | 5 % zurück |
| Mittlere Distanz des besten Autos | 9520 m | 9501 m |

Ehrlich gelesen: Das Verhalten ist jetzt eine Strategie und kein Dauerstoppen mehr, und man sieht
ihr beim Lernen zu. Schneller ist das beste Auto am Ende nicht geworden. Was der Boxenfunk gewinnt,
fehlt beim Fahrer, der 40 Generationen lang nicht mitlernen durfte.

Ein Vorversuch mit vier Startwerten hatte mehr versprochen (gegen „so spät wie möglich“ 0,99 statt
0,91). Mit sechs Startwerten bestätigt sich das nicht.

## Zwei Fehler, die unterwegs gefunden wurden

**1. Leerer Tank war kein Ausfall** (gefunden von der unabhängigen Prüfung). Autos rollten mit leerem
Tank in die Box und wurden dort betankt. Der erste Nachweis zählte solche Rennen als bestanden:
In 4 der 6 Prüfrennen war der Tank zwischendurch leer. Das Design verlangt „leerer Tank heißt
ausgefallen“. Jetzt endet das Rennen in dem Schritt, in dem der Tank leer wird.

**2. Durchfahren im Sparmodus** (im ersten eigenen Lauf gefunden). Sparen kostete fast kein Tempo,
also lernten die Autos, ganz ohne Stopp zu fahren. Geändert: Leerlaufverbrauch von 0,3 kg je
Sekunde, und die Tempovorgabe 0 begrenzt die Leistung auf 6 % statt 70 %. Mit 110 kg Tank und dem
kürzesten Rennen von 400 Sekunden reicht kein Tank für ein Rennen, auch nicht im Stand (367 s).
Ein Test hält das fest.

Im selben ersten Lauf war der Vergleich mit den festen Strategien unfair: Sie fuhren mit vollem
Tempo, das die entwickelten Fahrer nie gesehen hatten, und verunglückten nach wenigen Metern.

## Abweichungen vom Design, die offen bleiben

| Design | Stand | Folge |
|---|---|---|
| Ein Tank reicht 5 bis 8 Runden (8.1) | etwa 3 Runden | Weniger Spielraum für die Stintlänge. Mehr würde längere Rennen brauchen und das Training entsprechend verlangsamen. |
| Strategie wird gelernt (Ziel in Abschnitt 2) | Stopps und Stintlänge ja, aber im Mittel 5 % hinter einer einfachen Handregel | siehe oben |
| Runde 20 bis 30 s (6.3) | 50 bis 90 s | aus Stufe 1 bekannt |

## Rechenzeit

Befehl: `npm run bench`

```
car-steps/s: 293,791
ms/Generation: 366 (Generationen 26-35, Schwierigkeit 0.6)
ms/Generation Ausdauer: 3370 (10 Generationen ab trainierten Fahrern)
```

Ziel war eine Ausdauer-Generation unter 5 Sekunden. Erreicht. 80 Generationen dauern etwa fünf bis
sieben Minuten. Das erste bestandene Prüfrennen kam bei fünf Startwerten nach Generation 5 bis 15,
bei einem erst nach Generation 60.

## Endgültige Zahlenwerte

| Was | Wert |
|---|---|
| Rennlänge | 400 bis 560 s, je Generation zufällig, 3 Strecken |
| Tank | 110 kg; bei vollem Tempo leer nach 185 bis 270 s, im Sparmodus nach 310 bis 340 s |
| Verbrauch | 0,3 kg/s Leerlauf plus 0,000008 kg je Joule Motorarbeit; bei Tempovorgabe 0 je Joule 10 % weniger |
| Leerer Tank | Ausfall, sofort |
| Tempovorgabe | begrenzt die Motorleistung zwischen 6 % und 100 % |
| Reifen | Haftung 100 % → 94 % bis 75 % Verschleiß, dann steil auf 60 %; Verschleiß steigt mit Last und Rutschen |
| Schaden | 2 % je Wandkontakt plus 1,2 % je m/s Aufprall; kostet bis zu 30 % Haftung und 40 % Leistung; bei 100 % Ausfall |
| Stopp | 14 s Durchfahrt, 0,06 s je kg Sprit, 6 s Reifen, 20 s Reparatur bei vollem Schaden, nacheinander |
| Strategie-Netz | 7 → 8 → 4, entscheidet am Start und 80 m vor jeder Zieldurchfahrt |
| Start mit bestem Fahrer | alle 60 Autos mit demselben Fahrer; 40 Generationen lang lernt nur das Strategie-Netz |
| Fahrer-Netz | 15 → 16 → 16 → 2 (drei neue Eingaben: Haftung, Sprit, Tempovorgabe) |

Nicht verändert wurden die drei Bedingungen der Abnahme und die Liste erlaubter Eingaben, und es
gibt keine programmierte Boxenregel im Kern oder in der Seite.

## Bekannte Grenzen

- Die Fahrer sind langsam (etwa 60 bis 85 km/h im Rennschnitt einschließlich Standzeiten).
- Wandkontakt ist Alltag: Schaden wird bei jedem Stopp repariert, und gestoppt wird fast jede Runde.
- Die letzte Rundenzeit enthält die Standzeit in der Box. Der Eingang „letzte Runde gegen beste“
  sagt dem Strategie-Netz deshalb vor allem, ob es gerade gestoppt hat.
- Beim Stopp behält das Auto bis zu 2 m Überschuss hinter der Linie.
- Ob Hintergrund-Tab, Telefon und die veröffentlichte Kopie sich wie die lokale Seite verhalten,
  ist nicht am echten Gerät geprüft.
