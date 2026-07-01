# Tune this fork for one specific Denver game, not for general accuracy

This fork exists to run **one** Medium-size Hide & Seek game in the western Denver metro on RTD transit. We deliberately optimize for that game's correctness rather than general, upstreamable accuracy: hardcoded allowlists, Denver-specific constants, and disabling questions that are void for this boundary are all acceptable. We are **not** trying to contribute these changes upstream.

**Why:** the upstream tool models features loosely (e.g. "commercial airport" = any aerodrome with an IATA code) to support development broadly. For a bounded, known play area, exact allowlists and boundary-specific behavior are simpler and more reliable than trying to make the general heuristics correct everywhere.

**Consequence:** a future reader will see Denver-specific values and disabled questions that would be wrong for other maps. That is intended — see the other ADRs for the specific deviations.
