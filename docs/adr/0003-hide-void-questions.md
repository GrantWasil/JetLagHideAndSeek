# Hide questions that are void inside the Play Boundary

Four questions have zero valid target inside the boundary — **commercial airport, major city (≥1M), high-speed rail, coastline** — so by the out-of-bounds rule they can only ever return null. We **remove them from the question picker** for this game rather than showing a null result.

**Why:** they eliminate nothing, and the current code misbehaves on an empty in-bounds set — it silently no-ops (undefined boundary), and for airports it returns a *wrong* answer by counting non-commercial IATA airfields (Buckley Space Force Base, Centennial/APA, Rocky Mountain Metro/BJC) as "commercial." DEN, the only bookable airport, is out of bounds.

**Consequence:** a reader will notice these standard questions are absent; that is intentional for this landlocked, DEN-excluding boundary. If the boundary changes (e.g. to include DEN or a coastline — unlikely here), revisit.
