# Stufe 2: Nachweis und Messung

Stand: 2026-11-27. Die Ausgaben stammen vom Code dieses Commits und sind wörtlich wiedergegeben.

## Nachweis

Abnahme laut Design (Abschnitt 12, Stufe 2): Der Beste beendet ein Rennen ohne leeren Tank und ohne
Ausfall und macht dabei mindestens einen Boxenstopp. Gegenprobe: Ohne Box fällt dasselbe Auto aus.
Ein leerer Tank beendet ein Rennen sofort, „Rennen beendet“ heißt also auch „nie leer gefahren“.
Befehl: `npm run proof:ausdauer`

```
Nachweis Ausdauer: bis zu 80 Generationen, aufbauend auf 60 Generationen "Fahren lernen"
Prüfrennen: Kontrollstrecke 50, 480 s. Bestanden heißt: Rennen beendet (also nie mit leerem Tank), mindestens ein Stopp, und ohne Box wäre der Tank leer.

Seed | bestanden in Gen. | Stopps | Stints (s)        | Distanz  | Gen. 5: Distanz, Ende | Rechenzeit
-----|-------------------|--------|-------------------|----------|-----------------------|-----------
   1 | 35                | 5      | 60 / 62 / 64 / 59 / 60 / 49 | 9282 m   | 7852 m, zeit          | 387 s
   2 | 10                | 6      | 64 / 63 / 64 / 63 / 63 / 63 | 9578 m   | 8564 m, zeit          | 454 s
   3 | 15                | 5      | 64 / 63 / 61 / 61 / 61 / 61 | 9580 m   | 8746 m, zeit          | 434 s
   4 | 10                | 5      | 62 / 61 / 61 / 61 / 61 / 45 | 9098 m   | 8952 m, zeit          | 449 s
   5 | 5                 | 5      | 67 / 66 / 64 / 64 / 65 / 45 | 9048 m   | 9048 m, zeit          | 397 s
   6 | 5                 | 4      | 85 / 141 / 70 / 76 / 41 | 8850 m   | 8850 m, zeit          | 513 s

Ist die gelernte Strategie gut? Mittlere Distanz des letzten besten Autos auf 6 Kontrollstrecken, 480 s,
gegen feste Vergleichsstrategien mit demselben Fahrer und demselben Tempo:

Seed | gelernt  | jede Runde Box | so spät wie möglich | nie Box  | Stopps je Rennen (Training)
-----|----------|----------------|---------------------|----------|----------------------------
   1 | 9997 m   | 9859 m         | 9867 m              | 3682 m   | 5.0
   2 | 9542 m   | 9027 m         | 10626 m             | 4662 m   | 3.3
   3 | 9801 m   | 9447 m         | 9585 m              | 3596 m   | 4.0
   4 | 9707 m   | 9989 m         | 11550 m             | 4263 m   | 6.0
   5 | 8421 m   | 8355 m         | 8094 m              | 3053 m   | 5.7
   6 | 9651 m   | 9359 m         | 10798 m             | 4122 m   | 5.0

Gelernte Strategie mindestens so gut wie "so spät wie möglich": bei 3 von 6 Startwerten.
6 von 6 Startwerten bestanden (gefordert: 4).
```

## Was das zeigt und was nicht

- **Die Abnahme ist erfüllt.** Alle sechs Startwerte bestehen. Ohne Stopp („nie Box“) kommt derselbe
  Fahrer nur 36 bis 49 % so weit, weil er mit leerem Tank ausfällt.
- **Eine gute Strategie wird nicht gelernt.** Ein Tank reicht etwa drei Runden, die Netze stoppen
  trotzdem fast jede Runde (Stints von rund 62 Sekunden, 4 bis 6 Stopps in 8 Minuten).
  Die Handregel „so spät wie möglich tanken“ kommt mit demselben Fahrer bei drei Startwerten
  10 bis 16 % weiter. Bei den anderen drei liegt die gelernte Strategie 1 bis 4 % vorn.
  Gegen „jede Runde an die Box“ liegt sie bei 5 von 6 knapp vorn, also praktisch gleichauf.
- **Warum?** Jede Runde zu stoppen ist sicher und für ein Zufallsnetz leicht zu treffen: eine Ausgabe
  muss nur dauerhaft positiv sein. Seltener zu stoppen verlangt, dass die Entscheidung vom Tankstand
  abhängt, und ein Fehler dabei kostet das ganze restliche Rennen. In 80 Generationen findet die
  Evolution diesen Schritt bei der Hälfte der Startwerte nicht. Das Design nennt genau dieses Risiko
  (Abschnitt 13).
- Die Vergleichsstrategien gibt es nur im Nachweis-Skript. Sie übernehmen die Boxenentscheidung
  und lassen das Tempo des gelernten Netzes unverändert. In der Seite und im Kern entscheidet
  ausschließlich das Strategie-Netz.

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
| Strategie wird gelernt (Ziel in Abschnitt 2) | Stopps ja, gute Stintlänge nein | siehe oben |
| Runde 20 bis 30 s (6.3) | 50 bis 90 s | aus Stufe 1 bekannt |

## Rechenzeit

Befehl: `npm run bench`

```
car-steps/s: 293,791
ms/Generation: 366 (Generationen 26-35, Schwierigkeit 0.6)
ms/Generation Ausdauer: 3370 (10 Generationen ab trainierten Fahrern)
```

Ziel war eine Ausdauer-Generation unter 5 Sekunden. Erreicht. 80 Generationen dauern etwa fünf bis
sieben Minuten. Das erste bestandene Prüfrennen kam je nach Startwert nach Generation 5 bis 35,
also nach einer halben bis gut zwei Minuten.

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
