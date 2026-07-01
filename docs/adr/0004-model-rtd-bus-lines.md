# Model RTD bus lines, and drive station questions from the transit selection

The game's "same transit line" question counts buses, and this game is played on RTD (bus + light rail + commuter rail). Upstream models transit lines as rail-only, and the answer path is hardcoded to `[railway=station]` nodes (`matching.ts:326`), ignoring the user's transit-type selection. We:

1. Wire the station-based matching questions (same transit line, same-first-letter, same-length) to the user-configurable transit selection (`displayHidingZonesOptions`), and switch the fetch from `node` to `nwr`.
2. Add `route=bus` support so "same transit line" is valid on a bus ride, matching route relations by **`ref` + `network=RTD`** (in addition to the existing name/network matching).

**Why bus is feasible:** OSM has 147 `route=bus` relations tagged `network=RTD` in-bounds, with clean route refs and operator names — good enough data to answer "same bus line."

**Constraint (do not ignore):** there are ~4,473 in-bounds bus stops, above the tool's 1,000-element fetch guard (`matching.ts:101`, `measuring.ts:212`). So the "nearest stop" lookup must be a **bounded `around:` query per point**, not the existing fetch-all-stations-in-zone approach used for the 73 rail stations. Naively loading all bus stops will trip the guard and break the question.
