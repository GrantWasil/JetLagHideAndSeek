# Own question availability in one module (not three card-local sets)

"Is this question type offered for this game?" was a single domain concept with **no home**: it lived as three hand-maintained `Set<string>`s (`HIDDEN_MATCHING_TYPES`, `HIDDEN_MEASURING_TYPES`, `HIDDEN_TENTACLE_TYPES`) inside three React card components, each re-implementing the same introspect→filter→project pipeline against the schema. The comments on each set classified reasons identically (void / not-a-real-question / large-game-only). Revealing or hiding a type meant finding the right card.

We introduce [`src/maps/question-availability.ts`](../../src/maps/question-availability.ts), a deep module that owns the concept behind three exports:

- **`HIDDEN_QUESTION_TYPES`** — one table `Record<QuestionCategory, Set<string>>`, the single source of truth for what's hidden, with the ADR reason-comments preserved inline.
- **`isQuestionTypeAvailable(category, type)`** — the pure predicate.
- **`availableOptions(schemaUnion, shapeField, category)`** — the shared introspect→filter→project pipeline returning `[value, label][]` pairs for a schema union's ungrouped options.

## Decision

- **The schema stays purely a validation model.** Hidden types REMAIN in the schema so older saved/shared games still parse (ADR 0006 honored). Availability is a picker concern, layered on top of the schema — not baked into it. This is why the concept is a module, not a schema annotation.
- **The pipeline returns ungrouped options; the cards keep grouping.** `availableOptions` handles the `NO_GROUP` slice and the availability filter. The grouped slice (`NO_GROUP` split, `Object.fromEntries`/`groups` rendering shape for `<Select>`) stays in the cards because it is genuinely view-shaped. The grouped path applies the same filter via `isQuestionTypeAvailable` directly.
- **`shapeField` is a parameter** (`"type"` for matching/measuring, `"locationType"` for tentacles). The field name differs between question schemas; making it a parameter keeps one pipeline instead of three.
- **`HIDDEN_QUESTION_TYPES` keys on the question id** (`"matching"`/`"measuring"`/`"tentacles"`), which is how the cards already identify their category.

## Consequence

The three `HIDDEN_*` sets and their duplicated pipelines are gone from the card components (matching.tsx, measuring.tsx, tentacles.tsx). Revealing or hiding a question type for this game is now a one-row edit to the table. Availability is directly unit-tested (14 tests, up from zero on this concept) — including a test that pins the 11 Large-Game category types appear hidden in *both* matching and measuring, guarding the drift ADR 0006 warns about. This is Candidate 03 from the architecture review.
