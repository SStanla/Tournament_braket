# Implementation Plan

## Overview

This plan builds the tournament bracket creator incrementally: tooling first, then a pure, well-tested domain layer (validation, bracket generation, matchup resolution, re-seeding, correction cascade, standings), then the application layer (reducer, persistence, suggestion service and endpoint), and finally the UI screens and polish. Domain logic is implemented and tested before UI so the correctness-critical rules are locked in early. Each task references the requirements it satisfies.

## Tasks
- [x] 1. Scaffold the project and tooling
  - Initialize a Vite + React + TypeScript project in the workspace root, keeping the existing logo_app_tournament.svg.
  - Configure Vitest and React Testing Library.
  - Set up CSS design tokens (blue/white palette, spacing, focus-ring) as CSS custom properties.
  - _Requirements: 24.1, 24.7_

- [x] 2. Define the domain model types
  - Create TypeScript types for Option, Suggestion, Matchup, Round, Tournament, Standing, Phase, and BracketSize.
  - Include the derived mode field, rngSeed, and vote fields on Matchup.
  - _Requirements: 5.4, 12.2, 16.3_

- [x] 3. Implement validation utilities with tests
- [x] 3.1 Implement name/number validation functions
  - Implement normalizeName, namesEqual (case- and whitespace-insensitive), validateCategory (1-100 trimmed), validatePlayerCount (empty => classic; integer >= 1 else error), and validateOptionName (length + duplicate).
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 6.2, 6.3, 6.5, 10.7_
- [x] 3.2 Write unit tests for validation
  - Cover category boundaries (0, 1, 100, 101, whitespace-only), player count (empty, 0, negative, decimal, non-numeric, 1, large), and duplicate detection across case/whitespace.
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 6.5_

- [x] 4. Implement a seeded RNG utility
  - Provide a deterministic, seedable RNG used for shuffles, tie-breaks, and equal-vote ordering.
  - _Requirements: 12.1, 16.9, 17.4_

- [x] 5. Implement tournament creation and mode derivation
  - Implement createTournament that sets phase FILLING, empty options/suggestions, and derives mode from playerCount (immutable).
  - Write tests asserting mode is classic when playerCount is absent and voteBased when >= 1, and that no other flag changes mode.
  - _Requirements: 2.2, 2.3, 5.1, 5.2, 5.4, 5.5, 25.7_

- [x] 6. Implement option add/remove with capacity rules
  - Implement addOption (trim, reject empty/too-long/duplicate, block over capacity) and removeOption (frees slot, allowed even when full).
  - Implement canGenerate (options length === size).
  - Write tests for capacity limits, duplicate rejection, removal when full, and canGenerate.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 8.1, 8.2_

- [x] 7. Implement bracket generation
  - Implement stageLabelFor and generateBracket: shuffle options with the seeded RNG, build all rounds (log2(size) rounds, halving matchup counts), assign stage labels, create an empty third-place match when size >= 4, and set phase PLAYING.
  - Write tests for round count, first-round matchup count, stage labels (2/4/8/16), and third-place presence/absence by size.
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 25.4_

- [x] 8. Implement classic matchup resolution
  - Implement setProvisionalWinner and confirmMatchup for classic mode (records only on confirm), and winner advancement into the next round's fixed slot with no re-seeding.
  - Write tests that nothing is recorded before confirm and that pairings stay fixed.
  - _Requirements: 14.1, 14.2, 15.1, 15.2, 15.3, 15.4, 15.5, 18.1, 18.2_

- [x] 9. Implement vote-based matchup resolution
- [x] 9.1 Implement vote split and commit logic
  - Implement setProvisionalVotes (votesB = playerCount - votesA), confirmMatchup for non-tie (leader wins, sum invariant enforced), and rejection of any split whose sum differs from playerCount.
  - _Requirements: 16.1, 16.2, 16.3, 16.6, 16.11_
- [x] 9.2 Implement tie detection and tie-break
  - Detect ties (only possible with even playerCount), block advance until resolved, and implement resolveTieBreak as a seeded 50/50 draw; ensure odd playerCount never ties.
  - _Requirements: 16.7, 16.8, 16.9, 16.10_
- [x] 9.3 Write tests for vote resolution and tie-break
  - Assert sum invariant on every decided matchup, leader selection, tie only on even counts, deterministic tie-break under fixed seed, and no tie on odd counts.
  - _Requirements: 16.3, 16.6, 16.7, 16.9, 16.10, 16.11_

- [x] 10. Implement round advancement and re-seeding
  - Implement advanceIfRoundComplete (advances only when all matchups decided) and reseedNextRound (rank winners by votes received, strongest-vs-weakest pairing, deterministic equal-vote ordering).
  - Ensure first round keeps random pairings and classic mode never re-seeds.
  - Write tests for re-seeding pairing, equal-vote determinism yielding one complete pairing, and no-advance until round complete.
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 18.4, 18.5_

- [x] 11. Implement third-place match handling
  - Implement populateThirdPlace (fill with semifinal losers when both semifinals decided) and third/fourth assignment on decision; ensure size 2 has none.
  - Write tests for population timing, winner => 3rd / loser => 4th, and absence at size 2.
  - _Requirements: 19.1, 19.3, 19.4, 19.5_

- [x] 12. Implement correction cascade
  - Implement correctOutcome: re-commit the edited matchup, clear all downstream dependents (and champion if final affected), recompute re-seeding of affected later rounds in vote-based mode, and reset the third-place match plus clear 3rd/4th when a semifinal changes.
  - Write tests for downstream clearing, champion clearing, vote-based re-seed recomputation, and semifinal-triggered third-place reset.
  - _Requirements: 20.1, 20.2, 20.3, 20.4_

- [x] 13. Implement completion and standings
  - Implement isComplete (size 2: final decided; size >= 4: final and third-place decided) and computeStandings (gold/silver always; bronze/4th when size >= 4).
  - Write tests for both completion conditions and medal assignment.
  - _Requirements: 21.1, 21.2, 22.2, 22.3, 22.4_

- [x] 14. Build the reducer and persistence layer
- [x] 14.1 Implement the tournament reducer
  - Wire all user-intent actions to the pure domain transitions; expose via React context. Include NEW_TOURNAMENT reset to CREATE.
  - _Requirements: 2.4, 2.5_
- [x] 14.2 Implement sessionStorage persistence with graceful degradation
  - Serialize state after each change; hydrate on load; on unavailability, continue in-memory and surface a non-blocking "data might not be saved" notice.
  - Write tests for rehydration after simulated reload and degradation when storage throws.
  - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [x] 15. Implement the AI suggestion endpoint (server-side proxy)
  - Create a single HTTPS handler that reads the provider key from a server-side env var (never returned), calls the provider, and returns suggestion strings; respond with an explicit "not configured" status when no key is set.
  - _Requirements: 9.3, 9.10, 9.11_

- [x] 16. Implement the suggestion service (client) with cascade and tests
- [x] 16.1 Implement requestSuggestions cascade
  - Call the AI proxy with a ~10s timeout; on failure/timeout/short result, fall back to curated local lists via fuzzy category match (exact/containment/keyword, case-insensitive), excluding existing names; deduplicate; if still short, return partial and flag manual fill.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.11_
- [x] 16.2 Implement regenerateOne for reject
  - Return a unique replacement for a single slot, or null when no unique replacement is available.
  - _Requirements: 10.3, 10.4, 11.1_
- [x] 16.3 Write suggestion service tests
  - Cover cascade order (AI success/failure/timeout/short), fuzzy matching variants, reject regeneration (unique vs null), and that replace triggers no regeneration.
  - _Requirements: 9.4, 9.5, 9.6, 10.3, 10.4, 10.6, 11.2, 25.5_

- [x] 17. Implement suggestion review state transitions
  - Implement accept, reject (triggers regeneration), replace (validate, rename+accept, no regeneration), Accept all (skip full/duplicate items without blocking), Reject all (triggers a fresh AI suggestion set), and an "all handled" state.
  - Write tests for reject-vs-replace regeneration distinction, Accept all skipping, and Reject all regeneration.
  - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 11.1, 11.2, 25.5_

- [x] 18. Build the CreateScreen UI
  - Category input, bracket-size selector offering only valid powers of two, optional player-count input with inline validation that preserves other fields on error, and a confirmation transition to filling.
  - Write component tests for size-selector valid values and player-count error preserving data.
  - _Requirements: 2.1, 2.2, 3.2, 3.3, 4.1, 4.2, 5.3_

- [x] 19. Build the FillScreen UI
  - "X / size" count indicator, add-option input (disabled when full with full signal), option list with remove, "Suggest options" action, and "Generate bracket" shown only when full.
  - _Requirements: 6.1, 6.7, 7.1, 8.1, 9.1_

- [x] 20. Build the SuggestionReview UI
  - Per-item Accept/Reject/Replace, inline replace field validated like an option name, Accept all and Reject all controls, manual-fill note when applicable, and all-handled indication.
  - _Requirements: 9.8, 10.1, 10.2, 10.5, 10.7, 10.8, 10.11, 10.13_

- [x] 21. Build the PlayScreen shell and navigation
  - Show current stage label, "Matchup X of N", Previous/Next controls, one matchup at a time (never future rounds), spaced "vs" separator, and fully readable long names; keep the last decided matchup visible until Next.
  - Write tests for one-matchup-at-a-time, "Matchup X of N", and confirm-before-record on the last matchup.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3, 14.4_

- [x] 22. Build the ClassicMatchup and VoteMatchup views
- [x] 22.1 Build ClassicMatchup view
  - Two selectable buttons with provisional highlight, no vote controls, commit on Next.
  - _Requirements: 15.1, 15.2, 15.3, 15.4_
- [x] 22.2 Build VoteMatchup view
  - Single horizontal slider with playerCount+1 positions, centered start, green leader highlight on number and outline, auto-record on release for non-tie, and tie-break draw control shown only on tie (blocking advance until used).
  - Write tests for slider positions, centered start, leader highlight, and tie-break appearing only on tie.
  - _Requirements: 16.1, 16.2, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

- [x] 23. Wire the final-stage presentation order
  - For size >= 4, present the third-place match first (dedicated label), then the title final; ensure completion requires both.
  - Write a test asserting third-place is presented before the final.
  - _Requirements: 19.2, 21.2_

- [x] 24. Build the ResultsScreen UI
  - Render final standings first (gold/silver, plus bronze/4th for size >= 4) then a read-only bracket tree with all rounds, stage labels, connecting lines, highlighted third-place match for size >= 4, and clearly marked champion/3rd/4th; keep long names readable.
  - Write tests for standings-before-bracket ordering and absence of edit affordances in the bracket.
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9_

- [x] 25. Add global chrome and styling polish
  - Header with logo and always-available "New tournament" control, blue/white palette across screens, grouped sections with consistent spacing, button states for default/hover/focus with focus taking precedence, immediate interactive feedback, AA-targeted contrast, and English-only user-facing text.
  - _Requirements: 2.4, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8_

- [x] 26. Final integration and full-flow verification
  - Run the full build and test suite; play through end-to-end flows for a size-2 classic tournament and a size-8 vote-based tournament (including a tie-break, re-seeding, a mid-tournament correction, and third-place ordering) to confirm the correctness properties hold.
  - _Requirements: 18.5, 20.1, 20.3, 20.4, 21.1, 21.2_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "dependsOn": [] },
    { "wave": 2, "tasks": ["3", "4"], "dependsOn": ["2"] },
    { "wave": 3, "tasks": ["5"], "dependsOn": ["3"] },
    { "wave": 4, "tasks": ["6"], "dependsOn": ["5"] },
    { "wave": 5, "tasks": ["7"], "dependsOn": ["4", "6"] },
    { "wave": 6, "tasks": ["8", "9", "11"], "dependsOn": ["7"] },
    { "wave": 7, "tasks": ["10"], "dependsOn": ["9"] },
    { "wave": 8, "tasks": ["12"], "dependsOn": ["8", "10", "11"] },
    { "wave": 9, "tasks": ["13"], "dependsOn": ["12"] },
    { "wave": 10, "tasks": ["15"], "dependsOn": ["1"] },
    { "wave": 11, "tasks": ["16"], "dependsOn": ["15"] },
    { "wave": 12, "tasks": ["17"], "dependsOn": ["16"] },
    { "wave": 13, "tasks": ["14"], "dependsOn": ["13"] },
    { "wave": 14, "tasks": ["18"], "dependsOn": ["14"] },
    { "wave": 15, "tasks": ["19", "20"], "dependsOn": ["14", "17"] },
    { "wave": 16, "tasks": ["21"], "dependsOn": ["14"] },
    { "wave": 17, "tasks": ["22", "23"], "dependsOn": ["21", "11"] },
    { "wave": 18, "tasks": ["24", "25"], "dependsOn": ["14", "13"] },
    { "wave": 19, "tasks": ["26"], "dependsOn": ["18", "19", "20", "22", "23", "24", "25"] }
  ]
}
```

Guidance:
- Tasks 2-13 form the pure domain layer and should be completed (with tests) before UI work.
- Tasks 15-17 (suggestions) can proceed in parallel with the domain layer once scaffolding exists.
- UI tasks 18-25 depend on the reducer (14) and, for review UI, the suggestion service (16-17).
## Notes

- Follow the design document's layering: keep all rules in the pure domain layer and funnel every mutation through the reducer, so the correctness properties are enforced structurally.
- Use the seeded RNG for all randomness (shuffle, tie-break, equal-vote ordering) to keep tests deterministic.
- Do not add features beyond the requirements; honor the explicit exclusions (Req 25) and the correctness properties in design.md.
- Run the build and relevant tests after each task; the final task performs an end-to-end verification of the critical flows.

