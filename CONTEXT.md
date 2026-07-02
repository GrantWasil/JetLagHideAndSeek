# Denver Hide & Seek (fork tuning)

This fork tunes the Jet Lag: Hide & Seek map generator for **one specific game**: a Medium-size game in the **western Denver metro**, played on **RTD** transit. The vocabulary below is the game's ubiquitous language _as this fork uses it_. It intentionally deviates from the upstream tool, which models the game more loosely to support development generally.

Which question types the picker offers for this game is owned by the `src/maps/question-availability.ts` module (`HIDDEN_QUESTION_TYPES`, `isQuestionTypeAvailable`, `availableOptions`) — the single home for "is this question available?". The schema stays a pure validation model; availability is a picker concern layered on top. (See ADR 0010.)

## Language

**Play Boundary**:
The polygon defining the playable map for the game. Supplied as a custom border (Google My Maps KML). Any feature outside it is treated as if it does not exist — for every matching and measuring question.
_Avoid_: map area, region, zone, bounding box.

The boundary lives in app state as the `polyGeoJSON` atom (`src/lib/context.ts`); its geometry operations — clipping an Overpass query to it, testing whether a point is inside it, and capping a search radius to its bbox — are owned by the deep `src/maps/play-boundary.ts` module (`clipQuery`, `contains`, `bboxCapMiles`). The atom is the state; the module is the geometry. (See ADR 0008.)

The `polyGeoJSON` atom is **never null**. The cleared/reset state _is_ `DEFAULT_PLAY_BOUNDARY` — the Denver-metro polygon — not a sentinel null. (A searched-point fallback exists in upstream but is unused here.) This removes the ambiguity where `null` meant both "reset" and "use the searched Denver point," which caused "Clear Questions & Cache" to reset the boundary to Denver-the-point. Stale `null` persisted from before the fix is migrated to `DEFAULT_PLAY_BOUNDARY` on load. (See ADR 0013.)

**Void Question**:
A question whose feature type has no qualifying instance inside the Play Boundary, so per the rules it can only return a null answer (which still counts as answered). For this game these include commercial airport (DEN is out of bounds), coastline, and high-speed rail.
_Avoid_: dead question, disabled question.

**Commercial Airport**:
An airport you can book a flight to/from on Google Flights. Not merely "an airport with an IATA code." For this game the only bookable one (DEN) sits outside the Play Boundary; the three airfields inside it — Buckley Space Force Base, Centennial (APA), Rocky Mountain Metro (BJC) — all carry IATA codes but are _not_ commercial, so a correct game answer here is null.
_Avoid_: aerodrome, airfield, IATA airport.

**1st Administrative Division**:
For this game, a Colorado **county** (Adams, Arapahoe, Boulder, Broomfield, Denver, Douglas, Jefferson) — _not_ a state. The hierarchy is shifted down one level because a state-level division is useless at metro scale.
_Avoid_: state, region, prefecture.

**2nd Administrative Division**:
For this game, a **municipality** — an incorporated city/town (e.g. Golden, Littleton, Englewood), plus explicit "Unincorporated <County>" catch-all zones for the land between municipalities.
_Avoid_: district, county, borough.

**Transit**:
RTD bus and rail (light rail + commuter rail). The "same transit line" question is asked only while riding, and buses count — not just rail stations.
_Avoid_: train-only, subway, metro.

**Major City**:
A `place=city` with population ≥ 1,000,000 (upstream's definition). No place inside the Play Boundary meets that bar (Denver proper ≈ 715k), so for this game it is a **Void Question**, hidden from the matching/measuring pickers.
_Avoid_: big city, metropolis.

**Hider Location**:
The point on the map representing where the hider currently is. It exists in exactly one of two commitment states at any time (see Pending Hider Location and Confirmed Hider Location). Enabling hider mode creates it in the Pending state; disabling hider mode removes it entirely and resets the lifecycle.
_Avoid_: hider pin, hider marker, hider point.

**Pending Hider Location**:
A Hider Location the hider has not yet committed. It is movable — the hider may drag, search, or type coordinates freely — and a confirm affordance is shown beside it. It becomes a Confirmed Hider Location only through an explicit confirm action by the hider (never automatically).
_Avoid_: unlocked location, draft location.

**Confirmed Hider Location**:
A Hider Location the hider has committed. It is immovable on every surface (map drag, marker dialog, and options drawer) until the hider explicitly returns it to the Pending state. This state exists to prevent the hider from accidentally moving the pin on a touch screen. "Locked" and "unlock" describe the consequence and its inverse action, not a separate state.
_Avoid_: locked location, finalized location.
