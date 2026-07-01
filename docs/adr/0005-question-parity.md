# Match the picker to the official question set (hide embellishments; backlog the gaps)

We audited every question the tool offers against the official Hide & Seek question set (20 Matching, 20 Measuring, plus Radar / Thermometer / Tentacle). To keep the picker faithful to the game, we **hide tool questions that aren't in the rules** and **record the official questions the tool doesn't yet implement** as a backlog (deferred, not built for the first game).

## Hidden — not official questions (embellishments)

- **Zone Starts With Same Letter** (`letter-zone`) and **Station Starts With Same Letter** (`same-first-letter-station`) — no "first letter" question exists in the rules. (The real name-based ones are *Station Name's Length* and the admin-division *Zone* match, both kept.)
- **Major City** (`major-city` matching, `city` measuring) — not among the 20 (also void: no ≥1M city in-bounds).
- **McDonald's** and **7-Eleven** (`mcdonalds`, `seven11` measuring) — used ad hoc on the show, not in the card game's 20.

These are hidden the same way as the void questions (filtered from the picker via `HIDDEN_MATCHING_TYPES` / `HIDDEN_MEASURING_TYPES`); the underlying types are left in the schema so old saved games still parse.

Custom Zone / Custom Points / Custom Measuring / Custom Tentacles are tool *helpers*, not claimed game questions, so they stay.

## Backlog — official questions not yet implemented

Deferred for now; listed with relevance to the western-Denver-metro game:

| Official question | Category | Denver relevance | Notes |
|---|---|---|---|
| **Sea Level** (altitude, higher/lower) | Measuring | High (plains→foothills) | Needs an elevation data source the tool lacks |
| **Body of Water** (nearest named lake/reservoir) | Measuring | High (Chatfield, Cherry Creek, Sloan's Lake…) | Overpass-based |
| **Street or Path** (same street as me) | Matching | Medium | Overpass-based |
| **Metro Lines** (within 15 mi) | Tentacle (Large) | Medium (RTD light rail) | route relation data |
| **1st / 2nd Admin Division Border** (distance to county/state line) | Measuring | Low–medium | Distinct "border-distance" mechanic the tool lacks |
| International Border | Measuring | None (far out of bounds — void) | Skip for this boundary |
| Landmass (same landmass) | Matching | None (landlocked → always "same") | Skip for this boundary |

## Consequence

The picker now shows only game-accurate questions for this boundary. A future reader adding one of the backlog questions should also remove it from this list. Reversing a hide is a one-line change to the relevant `HIDDEN_*` set.
