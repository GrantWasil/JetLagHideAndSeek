# Defer extracting a QuestionEvaluator from ZoneSidebar (Candidate 04)

The architecture review (Candidate 04) proposed extracting a `QuestionEvaluator` out of [`src/components/ZoneSidebar.tsx`](../../src/components/ZoneSidebar.tsx) to collapse three copies of question evaluation (matching/measuring canonical, `initializeHidingZones`, `selectionProcess`). **We defer this.** Documented so a future reviewer doesn't re-suggest it without addressing the blockers below.

## Why defer

- **Untested, UI-coupled, no test harness.** ZoneSidebar is a 1309-line React component with **zero tests** and no component-test harness in the repo. The pattern that worked for Candidates 01–03 (extract a pure, side-effect-free maps helper, give it a `tests/*.test.ts`) does not apply: `selectionProcess` is impure and DOM-coupled — it calls `toast.warning`, `map.flyToBounds`, `document.querySelector`, `classList.add`, `scrollIntoView`, and a 5-second `setTimeout`. Extracting a `QuestionEvaluator` would need ~10–12 parameters or awkward mid-function slicing. Forcing it now is high-risk and the wrong shape for TDD.
- **The canonical path is already the single home for most evaluation.** Candidates 02 and the `home-game-types` work consolidated the category-place lookups, the transit-station materialization, and the Large-Game type list into tested modules. `initializeHidingZones` already *delegates* to those for the matching-transit branch. The remaining duplication is narrower than the original review estimated.

## The one real defect to address separately

`selectionProcess` (ZoneSidebar.tsx ~1080) has a **divergent expanding-radius loop**: a hardcoded cap of `500` miles with a 30-mile step, whereas the canonical path (`bboxCapMiles` from the Play Boundary module, ADR 0008) derives the cap from the boundary's bbox. A station-click preview can therefore give up the search for a feature type sooner than the finished map would, so the preview can silently disagree with the result.

This is a **localized bug**, not an architectural one. The fix is to replace the hardcoded `500` with `bboxCapMiles(polyGeoJSON.get())` — but doing it safely requires either a component-test harness (none exists) or extracting the loop first (which is the deferred Candidate 04 work). **Tracked as a discrete fix, not part of this architecture pass.**

## When to revisit

Revisit Candidate 04 when either (a) a React component test harness is introduced for ZoneSidebar, or (b) the divergent-radius bug is reported as user-visible and forces the issue. At that point, slice the extraction at "compute the per-station preview mapData" and leave the show/zoom/DOM-highlight side effects in the component.
