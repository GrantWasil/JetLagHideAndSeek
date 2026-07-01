# Denver Hide & Seek (fork tuning)

This fork tunes the Jet Lag: Hide & Seek map generator for **one specific game**: a Medium-size game in the **western Denver metro**, played on **RTD** transit. The vocabulary below is the game's ubiquitous language *as this fork uses it*. It intentionally deviates from the upstream tool, which models the game more loosely to support development generally.

## Language

**Play Boundary**:
The polygon defining the playable map for the game. Supplied as a custom border (Google My Maps KML). Any feature outside it is treated as if it does not exist — for every matching and measuring question.
_Avoid_: map area, region, zone, bounding box.

**Void Question**:
A question whose feature type has no qualifying instance inside the Play Boundary, so per the rules it can only return a null answer (which still counts as answered). For this game these include commercial airport (DEN is out of bounds), coastline, and high-speed rail.
_Avoid_: dead question, disabled question.

**Commercial Airport**:
An airport you can book a flight to/from on Google Flights. Not merely "an airport with an IATA code." For this game the only bookable one (DEN) sits outside the Play Boundary; the three airfields inside it — Buckley Space Force Base, Centennial (APA), Rocky Mountain Metro (BJC) — all carry IATA codes but are *not* commercial, so a correct game answer here is null.
_Avoid_: aerodrome, airfield, IATA airport.

**1st Administrative Division**:
For this game, a Colorado **county** (Adams, Arapahoe, Boulder, Broomfield, Denver, Douglas, Jefferson) — *not* a state. The hierarchy is shifted down one level because a state-level division is useless at metro scale.
_Avoid_: state, region, prefecture.

**2nd Administrative Division**:
For this game, a **municipality** — an incorporated city/town (e.g. Golden, Littleton, Englewood), plus explicit "Unincorporated <County>" catch-all zones for the land between municipalities.
_Avoid_: district, county, borough.

**Transit**:
RTD bus and rail (light rail + commuter rail). The "same transit line" question is asked only while riding, and buses count — not just rail stations.
_Avoid_: train-only, subway, metro.

**Major City**:
(Upstream tool term; usage under review.) Upstream defines it as a `place=city` with population ≥ 1,000,000. No place inside the Play Boundary meets that bar (Denver proper ≈ 715k), so as defined it is a Void Question for this game.
