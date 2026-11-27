# Stufe 2: Nachweis und Messung

Stand: 2026-11-27. Die Ausgaben stammen vom Code dieses Commits und sind wörtlich wiedergegeben.

## Nachweis

Abnahme laut Design (Abschnitt 12, Stufe 2): Der Beste beendet ein Rennen ohne leeren Tank und ohne
Ausfall und macht dabei mindestens einen Boxenstopp. Gegenprobe: Ohne Box fällt dasselbe Auto aus.
Befehl: `npm run proof:ausdauer`

```
Nachweis Ausdauer: bis zu 80 Generationen, aufbauend auf 60 Generationen "Fahren lernen"
Prüfrennen: Kontrollstrecke 50, 320 s. Bestanden heißt: Rennen beendet, mindestens ein Stopp, und ohne Box wäre der Tank leer.

Seed | bestanden in Gen. | Stopps | Stints (s)        | Distanz  | Gen. 5: Distanz, Ende | Rechenzeit
-----|-------------------|--------|-------------------|----------|-----------------------|-----------
   1 | 10                | 2      | 76 / 83 / 106     | 5191 m   | 4373 m, sprit         | 351 s
   2 | 5                 | 3      | 73 / 70 / 69 / 28 | 5457 m   | 5457 m, zeit          | 375 s
   3 | 5                 | 3      | 63 / 64 / 71 / 58 | 5970 m   | 5970 m, zeit          | 390 s
   4 | 5                 | 3      | 67 / 63 / 65 / 53 | 6056 m   | 6056 m, zeit          | 408 s
   5 | 10                | 2      | 166 / 65 / 32     | 5553 m   | 4717 m, sprit         | 350 s
   6 | 5                 | 2      | 74 / 72 / 142     | 5567 m   | 5567 m, zeit          | 393 s

Ist die gelernte Strategie gut? Mittlere Distanz des letzten besten Autos auf 6 Kontrollstrecken, 320 s,
gegen feste Vergleichsstrategien mit demselben Fahrer und demselben Tempo:

Seed | gelernt  | jede Runde Box | so spät wie möglich | nie Box  | Stopps je Rennen (Training)
-----|----------|----------------|---------------------|----------|----------------------------
   1 | 6020 m   | 5743 m         | 6003 m              | 2944 m   | 3.3
   2 | 6285 m   | 6133 m         | 6409 m              | 2871 m   | 4.3
   3 | 5608 m   | 5891 m         | 6129 m              | 2567 m   | 2.7
   4 | 6282 m   | 6092 m         | 6337 m              | 2838 m   | 3.7
   5 | 5968 m   | 5670 m         | 5986 m              | 3023 m   | 3.0
   6 | 6005 m   | 5730 m         | 5953 m              | 2432 m   | 3.0

Gelernte Strategie mindestens so gut wie "so spät wie möglich": bei 2 von 6 Startwerten.
6 von 6 Startwerten bestanden (gefordert: 4).
```

## Was das zeigt und was nicht

- **Die Box wird gebraucht und genutzt.** Alle sechs Startwerte bestehen, die meisten schon im ersten
  Prüfrennen nach 5 Generationen. Ohne Stopp („nie Box“) kommt derselbe Fahrer nur halb so weit.
- **Die gelernte Strategie ist brauchbar, aber nicht besser als eine einfache Handregel.**
  Gegen „jede Runde an die Box“ gewinnt sie bei 5 von 6 Startwerten. Gegen „so spät wie möglich tanken“
  liegt sie zwischen 0,9 % vorn und 8,5 % zurück, im Mittel etwa 2 % zurück. Die Netze stoppen in der
  Praxis fast jede Runde (Stints von 65 bis 75 Sekunden bei Runden von 60 bis 75 Sekunden) und lassen
  damit etwas Distanz liegen.
- **Warum nicht mehr?** Entschieden wird nur einmal pro Runde, ein Tank reicht 1 bis 2 Runden, ein
  Rennen hat 4 bis 6 Runden. Der Spielraum zwischen „zu oft“ und „zu selten“ ist klein, und zu selten
  endet mit leerem Tank und halber Distanz. Vorsicht zahlt sich für die Evolution aus.
- Die Vergleichsstrategien gibt es nur im Nachweis-Skript. Sie übernehmen die Boxenentscheidung
  und lassen das Tempo des gelernten Netzes unverändert. In der Seite und im Kern entscheidet
  ausschließlich das Strategie-Netz.

## Ein Schlupfloch, das der erste Lauf gezeigt hat

Mit den ersten Raten bestanden formal 5 von 6 Startwerten, aber die Autos hatten gelernt, im
Sparmodus ganz ohne Stopp durchzufahren: Sparen kostete fast kein Tempo, weil die Fahrer ohnehin
nur einen Bruchteil der Leistung abrufen. Das widerspricht dem Design („ein Trainingsrennen braucht
mindestens einen Stopp“). Geändert wurde:

- Leerlaufverbrauch von 0,36 kg je Sekunde (neuer Wert). Damit reicht kein Tank ein ganzes Rennen.
- Die Tempovorgabe 0 begrenzt die Leistung auf 6 % statt 70 %. Sparen kostet jetzt 25 bis 45 % Tempo.

Im selben Lauf war der Vergleich mit den festen Strategien unfair: Sie fuhren mit vollem Tempo, das
die entwickelten Fahrer nie gesehen hatten, und verunglückten nach wenigen Metern. Das ließ die
gelernte Strategie viel besser aussehen, als sie ist. Der Vergleich oben ist der korrigierte.

## Rechenzeit

Befehl: `npm run bench`

```
car-steps/s: 294,141
ms/Generation: 367 (Generationen 26-35, Schwierigkeit 0.6)
ms/Generation Ausdauer: 2602 (10 Generationen ab trainierten Fahrern)
```

Ziel war eine Ausdauer-Generation unter 5 Sekunden. Erreicht. 80 Generationen dauern damit etwa
vier bis sechs Minuten, das erste bestandene Prüfrennen kommt nach weniger als einer Minute.
Die Obergrenze aus dem Design (bis 10 Minuten bis zu sinnvollen Boxenstopps) wird eingehalten.

## Endgültige Zahlenwerte

| Was | Wert |
|---|---|
| Rennlänge | 240 bis 400 s, je Generation zufällig, 3 Strecken |
| Tank | 110 kg; bei vollem Tempo leer nach 70 bis 170 s, im Sparmodus nach 210 bis 260 s |
| Verbrauch | 0,36 kg/s Leerlauf plus 0,00003 kg je Joule Motorarbeit; bei Tempovorgabe 0 je Joule 10 % weniger |
| Tempovorgabe | begrenzt die Motorleistung zwischen 6 % und 100 % |
| Reifen | Haftung 100 % → 94 % bis 75 % Verschleiß, dann steil auf 60 %; Verschleiß steigt mit Last und Rutschen |
| Schaden | 2 % je Wandkontakt plus 1,2 % je m/s Aufprall; kostet bis zu 30 % Haftung und 40 % Leistung; bei 100 % Ausfall |
| Stopp | 14 s Durchfahrt, 0,06 s je kg Sprit, 6 s Reifen, 20 s Reparatur bei vollem Schaden, nacheinander |
| Strategie-Netz | 7 → 8 → 4, entscheidet am Start und 80 m vor jeder Zieldurchfahrt |
| Fahrer-Netz | 15 → 16 → 16 → 2 (drei neue Eingaben: Haftung, Sprit, Tempovorgabe) |

## Was gegenüber dem Plan geändert wurde

1. Verbrauchs- und Verschleißraten, Rennlänge und die Wirkung der Tempovorgabe wurden an die gemessene
   Fahrweise angepasst (die Fahrer nutzen etwa 25 von 300 kW, eine Runde dauert 50 bis 90 s).
2. Leerlaufverbrauch kam neu dazu (siehe Schlupfloch).
3. Die Vergleichsstrategien lassen das gelernte Tempo unverändert (siehe oben).

Nicht verändert wurden die drei Bedingungen der Abnahme, die Liste erlaubter Eingaben, und es gibt
weiterhin keine programmierte Boxenregel im Kern oder in der Seite.

## Bekannte Grenzen

- Die Fahrer sind langsam (etwa 60 bis 85 km/h im Rennschnitt einschließlich Standzeiten).
  Reifenverschleiß spielt deshalb nur eine kleine Rolle: Bei vollem Tempo ist der Tank deutlich
  vor den Reifen am Ende.
- „Führendes Auto“ ist das Auto, das noch fährt und am weitesten gekommen ist. Das kann eines sein,
  das gerade mit leerem Tank ausrollt.
- Ob Hintergrund-Tab, Telefon und die veröffentlichte Kopie sich wie die lokale Seite verhalten,
  ist nicht am echten Gerät geprüft.
