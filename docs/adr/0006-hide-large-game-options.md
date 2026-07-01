# Hide large-game-only options (we're playing a Medium game)

This fork is tuned for a Medium Denver-metro RTD game. Several tool options only make sense in a **Large** game (country/region scale). We hide those from the picker so the options on offer match how the game is actually being played. As with the earlier parity work (docs/adr/0005), the underlying types stay in the schema so older saved/shared games still parse — hiding is done in the picker UI via `HIDDEN_*` sets.

## Hidden — large-game-only

- **Tentacles "15 Miles (Typically)"** (`theme_park`, `zoo`, `aquarium` at a 15-mile radius) — this is the Large Game tentacle. Only the **"1 Mile (Typically)"** group (Museums, Hospitals, Movie Theaters, Libraries) is offered for the Medium game. Filtered via `HIDDEN_TENTACLE_TYPES` in `src/components/cards/tentacles.tsx`; the emptied "15 Miles" group is dropped from the dropdown. New tentacle questions now default to a 1-mile Museum question instead of the 15-mile Theme Park default (`AddQuestionDialog.tsx`).

- **"Large Game variation" of the category questions** — the plain home-game types (`zoo`, `theme_park`, `peak`, `museum`, `hospital`, `cinema`, `library`, `golf_course`, `consulate`, `park`, plus `aquarium` which was already hidden) for both **Matching** and **Measuring**. The code calls these "the Large Game variation" (`matching.ts`/`measuring.ts`): they're the hiding-zone-based fallback used when the full-map version returns too many results to enumerate. For a Medium game the category questions are answered with the **"(Small+Medium Games)"** `-full` versions instead, which stay visible. Added to `HIDDEN_MATCHING_TYPES` / `HIDDEN_MEASURING_TYPES`.

## Kept on purpose

- **Station / train-line questions** (`same-length-station`, `same-train-line` matching; `rail-measure` measuring) live in the same "Hiding Zone Mode" group as the hidden category variants, but the RTD game relies on them (docs/adr/0004), so they stay.
- The **"(Small+Medium Games)"** `-full` category questions — these are the Medium-game way to ask a category question, so they remain the visible option.

## Consequence

The picker now offers only the Medium-game form of each category question (the `-full` matching/measuring version and the 1-mile tentacle). A future reader switching this fork to a Large game should reverse these hides — a one-line change per type in the relevant `HIDDEN_*` set — and restore the 15-mile tentacle default in `AddQuestionDialog.tsx`.
