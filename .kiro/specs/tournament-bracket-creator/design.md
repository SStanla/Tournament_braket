# Design Document

## Overview

The Single-Elimination Tournament Bracket Creator is a free, no-account web application. A user creates a tournament (category, bracket size, optional player count), fills it with options (manually and/or via AI-assisted suggestions), generates a randomized bracket, plays it one matchup at a time, and reviews final standings plus a read-only bracket tree at the end.

The application is architected as a **client-side single-page application (SPA)** with a **single thin server-side endpoint** used only to proxy AI-based suggestion requests so that the provider credential is never exposed to the browser. All tournament state, gameplay logic, re-seeding, and rendering live in the client. Session persistence uses the browser `sessionStorage`, which survives reload and is discarded when the tab/window closes, matching the retention requirement exactly.

This design maps directly to the 25 requirements. Key algorithmic behaviors from Appendix A of the functional spec (mode determination, vote-sum invariant, tie-break, strongest-vs-weakest re-seeding, downstream clearing on correction, third-place-before-final ordering) are isolated in a pure, framework-independent domain layer so they can be unit-tested in isolation.

### Technology Choices

- **Language:** TypeScript (type safety for the domain model and the many invariants).
- **UI framework:** React with functional components and hooks.
- **Build tool / dev server:** Vite.
- **Styling:** CSS Modules with a small set of design tokens (blue/white palette, spacing, focus states) defined as CSS custom properties. No heavy UI library, to keep the interface clean and minimal and to control focus/hover precedence precisely.
- **State management:** A single tournament reducer (React `useReducer`) wrapping the pure domain layer, exposed through a React context. This keeps all mutations funneled through pure, testable transition functions.
- **Persistence:** `sessionStorage` via a thin persistence adapter, with graceful degradation if unavailable.
- **AI suggestions endpoint:** A serverless function (deployable as a single HTTP handler, e.g. a Vite/Node-compatible function) that holds the provider API key server-side and returns suggestion strings. The client calls this endpoint; if it is missing, unconfigured, errors, or exceeds a ~10s timeout, the client falls back to local curated lists, then to manual entry.
- **Testing:** Vitest for the domain layer and utilities; React Testing Library for component behavior.

Rationale: the requirements forbid accounts and long-term storage and require session-only retention, which points to a client-centric app. The only server need is credential protection for AI calls (Req 9.10), satisfied by a minimal proxy. Keeping domain logic pure isolates the correctness-critical rules from UI concerns.

## Architecture

### High-Level Structure

```
+-------------------------------------------------------------+
|                        Browser (SPA)                        |
|                                                             |
|  UI Layer (React components + CSS Modules)                  |
|    - CreateScreen, FillScreen, SuggestionReview,            |
|      PlayScreen (Classic/Vote views), ResultsScreen         |
|                          |                                  |
|  Application Layer (React context + reducer)                |
|    - tournamentReducer dispatches domain transitions        |
|    - persistence adapter (sessionStorage)                   |
|    - suggestionService (AI proxy client + fallbacks)        |
|                          |                                  |
|  Domain Layer (pure TypeScript, no React)                   |
|    - model types, validation, bracket generation,          |
|      matchup resolution, re-seeding, correction cascade,    |
|      standings, stage labels                                |
+---------------------------|---------------------------------+
                            | HTTPS (only for AI suggestions)
                            v
+-------------------------------------------------------------+
|         Serverless AI Suggestion Endpoint (server)          |
|   - holds provider credential (never sent to client)        |
|   - calls AI provider, returns list of suggestion strings   |
+-------------------------------------------------------------+
                            |
                            v
                   External AI Provider
```

### Layered Responsibilities

- **Domain layer** (pure): owns all rules and invariants. No I/O, no React. Deterministic given inputs (a seeded RNG is injected so shuffles, tie-breaks, and tie-order resolution are testable and reproducible).
- **Application layer**: orchestrates screens, holds current tournament state, persists to `sessionStorage`, and calls the suggestion service. Translates user intents into domain transitions.
- **UI layer**: renders state and captures input. Contains no rule logic beyond presentation (e.g. disabling controls). Enforces visual requirements (palette, focus precedence, vs separator spacing, readable long names).
- **Suggestion endpoint**: the only server component; exists solely to keep the AI key private.

### Screen Flow (State Machine)

The application is a phase machine held in tournament state:

```
CREATE --create()--> FILLING --generate()--> PLAYING --complete()--> RESULTS
   ^                                                                    |
   |                             newTournament() (available any time)   |
   +--------------------------------------------------------------------+
```

- `CREATE`: creation form (Req 2–5).
- `FILLING`: add/remove options, request/review suggestions (Req 6–11).
- `PLAYING`: one matchup at a time, classic or vote-based (Req 12–21).
- `RESULTS`: standings then read-only bracket (Req 22).
- "New tournament" resets to `CREATE` from any phase (Req 2.4–2.5).

## Components and Interfaces

### Domain Model (types)

```ts
type BracketSize = 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048;

type Phase = 'CREATE' | 'FILLING' | 'PLAYING' | 'RESULTS';

interface Option {
  id: string;         // stable id
  name: string;       // stored trimmed, 1..100 chars
}

// Suggestion lifecycle used during review (Req 10, 11)
type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'replaced';

interface Suggestion {
  id: string;
  name: string;
  status: SuggestionStatus;
}

interface Matchup {
  id: string;
  roundIndex: number;      // 0 = first round
  slotIndex: number;       // position within the round
  optionA?: Option;        // may be undefined until populated
  optionB?: Option;
  winner?: Option;         // undefined until decided
  // vote-based only:
  votesA?: number;         // votesA + votesB === playerCount when decided
  votesB?: number;
  tieBreakUsed?: boolean;  // true when a tie was resolved by draw
  isThirdPlace?: boolean;
}

interface Round {
  index: number;
  optionCount: number;     // options contested in this round
  stageLabel: string;      // "Final" | "Semifinal" | "Quarterfinal" | "Round of N"
  matchups: Matchup[];
}

interface Tournament {
  phase: Phase;
  category: string;                 // 1..100 trimmed
  size: BracketSize;
  playerCount?: number;             // present => vote-based mode
  mode: 'classic' | 'voteBased';    // derived from playerCount at creation
  options: Option[];
  suggestions: Suggestion[];
  rounds: Round[];
  thirdPlaceMatch?: Matchup;        // present iff size >= 4
  champion?: Option;
  standings?: Standing[];           // computed at completion
  currentRoundIndex: number;
  currentMatchupIndex: number;      // within current round view
  rngSeed: number;                  // for reproducible shuffles/tie-breaks
}

interface Standing {
  place: 1 | 2 | 3 | 4;
  option: Option;
  medal?: 'gold' | 'silver' | 'bronze';
}
```

Design notes:
- `mode` is derived exactly once from `playerCount` at creation and never changes (Req 5.4, 5.5, 25.7). No other flag drives mode (Appendix A rule 1).
- A single injected seeded RNG (`rngSeed`) drives shuffle (Req 12.1), tie-break draw (Req 16.9), and deterministic tie-ordering in re-seeding (Req 17.4). This makes correctness-critical randomness reproducible in tests while remaining random to users.

### Domain Functions (pure)

Validation:
- `validateCategory(raw): { ok: true, value } | { ok: false, message }` — trims, checks 1..100 (Req 3).
- `validatePlayerCount(raw): { ok: true, value? } | { ok: false, message }` — empty => classic; else must be integer >= 1 (Req 5).
- `normalizeName(raw): string` — trims edge whitespace.
- `namesEqual(a, b): boolean` — case-insensitive, whitespace-trimmed comparison (Req 6.5, 9.9, Appendix A rule 9).
- `validateOptionName(raw, existingOptions, existingSuggestions?): result` — 1..100 and no duplicate (Req 6, 10.7).

Bracket lifecycle:
- `createTournament(input): Tournament` — sets phase FILLING, empty options/suggestions (Req 2.2, 2.3).
- `addOption`, `removeOption` — enforce capacity and duplicate rules (Req 6, 7).
- `canGenerate(t): boolean` — options length === size (Req 8).
- `generateBracket(t, rng): Tournament` — shuffle options, seed round 0 matchups, build all rounds with stage labels, create empty third-place match if size >= 4, set phase PLAYING (Req 12).
- `stageLabelFor(optionCount): string` — 2 -> "Final", 4 -> "Semifinal", 8 -> "Quarterfinal", else `Round of {optionCount}` (Req 12.6).

Gameplay:
- `setProvisionalWinner(t, matchupId, optionId)` — classic provisional highlight, records nothing (Req 14.1).
- `setProvisionalVotes(t, matchupId, votesA)` — vote-based provisional split; derives votesB = playerCount - votesA (Req 16.1–16.3).
- `confirmMatchup(t, matchupId)` — commits provisional choice (Req 14.2). For vote-based, a non-tie commits the leader; a tie commits nothing and flags that a tie-break is required (Req 16.6–16.8).
- `resolveTieBreak(t, matchupId, rng)` — 50/50 draw picks the winner (Req 16.9).
- `advanceIfRoundComplete(t)` — only advances when every matchup in the round is decided (Req 18.5). Applies re-seeding for the next round in vote-based mode (Req 17).
- `reseedNextRound(winnersWithVotes, rng)` — rank winners by votes received in the match they just won (desc), pair strongest-vs-weakest; ties in votes resolved deterministically via seeded ordering (Req 17.3, 17.4).
- `correctOutcome(t, matchupId, newChoice)` — re-commits a decided matchup and clears all downstream dependents; in vote-based mode recomputes re-seeding of affected later rounds; changing a semifinal resets the third-place match and clears 3rd/4th (Req 20, Appendix A rule 8).
- `isComplete(t): boolean` — size 2: final decided; size >= 4: final and third-place decided (Req 21).
- `computeStandings(t): Standing[]` — gold/silver always; bronze/4th when size >= 4 (Req 22.2–22.4).

Third place:
- `populateThirdPlace(t)` — when both semifinals decided, fill third-place match with the two semifinal losers (Req 19.1).
- Final-stage presentation order is a UI concern driven by domain flags: third-place match is offered before the title final (Req 19.2, Appendix A rule 7).

### Application Layer

- `tournamentReducer(state, action)`: the only place domain transitions are invoked. Actions map 1:1 to user intents (CREATE, ADD_OPTION, REMOVE_OPTION, REQUEST_SUGGESTIONS, ACCEPT_SUGGESTION, REJECT_SUGGESTION, REPLACE_SUGGESTION, ACCEPT_ALL, REJECT_ALL, GENERATE, SET_PROVISIONAL, CONFIRM, PREVIOUS, RESOLVE_TIE, CORRECT, NEW_TOURNAMENT).
- `usePersistence()`: after each state change, serialize to `sessionStorage`; on load, hydrate if present. If `sessionStorage` throws or is unavailable, continue in-memory and surface a non-blocking "data might not be saved" notice (Req 23.4).
- `suggestionService`:
  - `requestSuggestions(category, existingNames, count): Promise<string[]>`
    1. Call AI proxy endpoint with a ~10s timeout (Req 9.3, 9.4).
    2. On failure/timeout/short result, fill remainder from local curated lists via fuzzy category match (Req 9.5–9.7).
    3. Deduplicate against existing names and among themselves (Req 9.9).
    4. If still short, return what exists; UI states remaining slots are manual (Req 9.8).
  - `regenerateOne(category, existingNames, existingSuggestionNames): Promise<string | null>` — used on reject (Req 10.3, 10.4). Returns null if no unique replacement (slot left empty for manual fill).
  - `fuzzyMatchCategory(category): string[] | null` — exact/containment/keyword, case-insensitive (Req 9.6).

### AI Suggestion Endpoint

- Single HTTPS handler. Input: `{ category, existing, count }`. Output: `{ suggestions: string[] }`.
- Reads the provider key from a server-side environment variable; never returns it (Req 9.10).
- If the key is not configured, responds with an explicit "not configured" status so the client falls back cleanly to local lists (Req 9.11).
- Enforces its own upstream timeout; the client also applies a ~10s ceiling as the source of truth for the "failed" determination.

### UI Components

- `CreateScreen`: category text input, bracket-size selector offering only valid powers of two (Req 4), optional player-count input. Inline validation messages; preserves other fields on player-count error (Req 5.3).
- `FillScreen`: count indicator "X / size" (Req 6.1), add-option input (disabled when full, Req 6.7), option list with remove buttons (Req 7), "Suggest options" action, "Generate bracket" action shown only when full (Req 8).
- `SuggestionReview`: list of pending suggestions with Accept / Reject / Replace per item, plus "Accept all" and "Reject all" (Req 10). Replace opens an inline text field validated like an option name (Req 10.5–10.7). Shows a "manual fill needed" note when applicable (Req 9.8), and an "all handled" state (Req 10.13).
- `PlayScreen`: shows the current round's stage label (Req 13.3), "Matchup X of N" (Req 13.4), Previous/Next navigation (Req 13.5), and exactly one matchup with a spaced "vs" separator and fully readable names (Req 13.6, 13.7). Renders either:
  - `ClassicMatchup`: two selectable buttons; provisional highlight; commit on Next (Req 15).
  - `VoteMatchup`: single horizontal slider with playerCount+1 positions, centered start, green leader highlight (number and outline), auto-record on release for non-tie, tie-break draw control only on tie (Req 16).
  - When the round's last matchup is decided, it stays visible with the winner highlighted until Next (Req 14.4).
  - In the final stage for size >= 4, presents the third-place match first, then the final (Req 19.2).
- `ResultsScreen`: final standings first (gold/silver, plus bronze/4th for size >= 4), then a read-only bracket tree with all rounds, stage labels, connecting lines, third-place match highlighted for size >= 4, and clearly marked champion/3rd/4th (Req 22).
- Global: "New tournament" control available on every screen (Req 2.4); logo `logo_app_tournament.svg` in the header (Req 24.7).

### Styling and Accessibility

- Design tokens as CSS custom properties: `--color-primary` (blue), `--color-surface` (white), accent, focus-ring, spacing scale.
- Buttons expose distinct `:default`, `:hover`, and `:focus-visible` states; when hover and focus coincide, focus styling wins via specificity/ordering (Req 24.4).
- Interactive feedback is immediate (no transition delay on state change) (Req 24.5).
- Color pairs are chosen to meet WCAG AA contrast targets (Req 24.6). Note: full conformance requires manual assistive-technology testing beyond this design.
- The "vs" separator uses horizontal margin on both sides so names never touch (Req 13.6). Long names wrap or are made fully viewable (e.g. tooltip/expand) rather than truncated destructively (Req 13.7, 22.5).
- All user-facing strings, including stage labels, are English (Req 24.8).

## Data Models

### Persistence Shape

The entire `Tournament` object is serialized to `sessionStorage` under a single key. Because `Option` names and structural indices are all serializable, hydration restores exact state after reload. On hydrate, the reducer re-validates the phase and derives any transient view flags.

- Survives reload: `sessionStorage` persists across reloads within the same tab (Req 23.1).
- Discarded on close: `sessionStorage` is cleared when the tab/window closes (Req 23.2).
- No long-term or cross-device storage is used (Req 23.3, 25.2).

### Bracket Structure Invariants

- `rounds.length === log2(size)` (Req 12.2).
- `rounds[0].matchups.length === size / 2`; each next round halves it (Req 12.3).
- `thirdPlaceMatch` exists iff `size >= 4` (Req 12.4, 12.5, 19.5).
- For any decided vote-based matchup: `votesA + votesB === playerCount` (Req 16.3, 25.6; Appendix A rule 2).
- A winner exists for a vote-based matchup only if the split is non-tied or a tie-break was used (Req 16.6–16.9; Appendix A rule 3).

### Re-seeding Model (vote-based)

Input to `reseedNextRound`: the list of `{ option, votesReceived }` for winners of the just-completed round.

1. Sort descending by `votesReceived`.
2. For equal votes, break ties deterministically using a stable, seed-derived key so the ordering is reproducible and yields exactly one complete pairing (Req 17.4).
3. Pair index `i` with index `n-1-i` (strongest vs weakest) (Req 17.3).
4. Applied only for rounds after the first, only in vote-based mode (Req 17.1, 17.5). First round keeps generation-time random pairings (Req 17.1). Classic mode never re-seeds (Req 17.6, 15.5; Appendix A rule 4).

### Correction Cascade Model

`correctOutcome` walks the dependency graph:

1. Re-commit the edited matchup's winner.
2. Clear the winner (and votes) of every downstream matchup that consumed the old winner; clear the champion if the final is affected (Req 20.1, 20.2).
3. In vote-based mode, recompute re-seeding for each affected later round from the new winners/votes (Req 20.3).
4. If a semifinal changed, reset the third-place match to the current semifinal losers and clear any assigned 3rd/4th (Req 20.4; Appendix A rule 8).

## Error Handling

- **Input validation errors** (category, player count, option name, replacement name): surfaced inline next to the relevant field with a specific message; no state is committed on failure, and unrelated entered data is preserved (Req 3, 5.3, 6, 10.7).
- **Capacity errors**: adding beyond size is prevented by disabling input; "Accept all" skips individual items that would exceed capacity or duplicate, without aborting the batch (Req 6.6, 6.7, 10.10).
- **AI suggestion failures/timeouts**: caught by the suggestion service; the cascade falls back to local lists, then manual entry, always producing a usable (possibly partial) result and a clear message (Req 9.4, 9.5, 9.8; Req 10.4 for reject regeneration returning null).
- **AI endpoint unconfigured**: treated as a normal fallback path, not a hard error; the app remains fully usable via local lists and manual entry (Req 9.11).
- **Persistence unavailable**: caught by the persistence adapter; the app continues in-memory and shows a non-blocking notice that data might not be saved, without discarding current state (Req 23.4).
- **Tie without resolution**: advancing is blocked until the tie-break draw is used (Req 16.8).
- **Deciding a matchup with a missing option**: prevented; a matchup is decidable only when both options are present (Req 18.1).

## Testing Strategy

Testing focuses on the correctness-critical domain layer, with component tests for the interaction rules that are easy to regress.

### Domain unit tests (Vitest)
- Validation: category boundaries (0, 1, 100, 101 chars, whitespace-only), player count (empty, 0, negative, decimal, non-numeric, 1, large), duplicate detection across case/whitespace (Req 3, 5, 6.5, 9.9).
- Bracket generation: round count = log2(size), first-round matchup count, third-place presence for size >= 4 and absence for size 2, stage labels for 2/4/8/16 (Req 12).
- Vote invariant: votesA + votesB === playerCount for every decided vote matchup; leader selection; tie only on even player count; odd player count never ties (Req 16, Appendix A rules 2, 3).
- Tie-break: seeded 50/50 draw picks a winner deterministically under a fixed seed (Req 16.9).
- Re-seeding: strongest-vs-weakest pairing; equal-vote deterministic ordering yields exactly one complete pairing; first round and classic mode unaffected (Req 17, Appendix A rule 4).
- Correction cascade: changing an early winner clears downstream and champion; vote-based re-seed recomputed; semifinal change resets third place and clears 3rd/4th (Req 20, Appendix A rule 8).
- Completion and standings: size 2 vs size >= 4 completion conditions; medal assignment; standings computed before bracket data is presented (Req 21, 22).

### Suggestion service tests
- Cascade order: AI first, then local lists, then manual note (mock AI success, failure, timeout, short result) (Req 9).
- Fuzzy category matching: exact, containment, keyword, case-insensitive (Req 9.6).
- Reject regeneration returns unique replacement or null when exhausted (Req 10.3, 10.4).
- Replace performs no regeneration (Req 10.6, 11.2, 25.5).

### Component/interaction tests (React Testing Library)
- Bracket-size selector offers only valid values (Req 4).
- Provisional-then-confirm: nothing recorded before Next; last matchup of a round stays visible until Next (Req 14).
- One matchup at a time; no future rounds rendered; "Matchup X of N"; Previous/Next navigation (Req 13).
- Vote slider: positions = playerCount+1, centered start, leader highlight, tie-break appears only on tie and blocks advance (Req 16).
- Final stage: third-place match presented before the final for size >= 4 (Req 19.2).
- Results screen renders standings before the read-only bracket; bracket has no edit affordances (Req 22.1, 22.9).
- Focus precedence over hover on buttons (Req 24.4).

### Persistence tests
- State survives a simulated reload (rehydrate from sessionStorage) (Req 23.1).
- Graceful degradation when sessionStorage throws (Req 23.4).

## Correctness Properties

These invariants must hold at all times and are enforced by the domain layer and verified by tests. They restate the critical rules of the functional spec (Appendix A) as checkable properties.

### Property 1: Mode immutability
mode is derived from playerCount at creation (empty => classic, integer >= 1 => voteBased) and never changes thereafter. No other flag influences mode.

**Validates: Requirements 5.4, 5.5, 25.7**

### Property 2: Vote-sum invariant
For every decided vote-based matchup, votesA + votesB === playerCount, exactly and always. Splits with a different sum are never accepted.

**Validates: Requirements 16.3, 16.11, 25.6**

### Property 3: Tie parity
A vote tie can occur only when playerCount is even. On a tie, no winner is recorded until the 50/50 tie-break draw is used, and advancing is blocked until then. With odd playerCount, a tie-break never appears.

**Validates: Requirements 16.7, 16.8, 16.9, 16.10**

### Property 4: Re-seeding scope
Strongest-vs-weakest re-seeding applies only in vote-based mode and only to rounds after the first. The first round always uses generation-time random pairings. Classic mode never re-seeds. Equal votes are ordered deterministically so exactly one complete pairing results.

**Validates: Requirements 17.1, 17.3, 17.5**

### Property 5: Progressive reveal
During play, exactly one matchup of the current round is shown; matchups of future rounds are never shown in advance.

**Validates: Requirements 13.1, 13.2**

### Property 6: Confirm-before-record
No choice is recorded before the "Next" confirmation. The last matchup of a round stays visible with its outcome highlighted until confirmed.

**Validates: Requirements 14**

### Property 7: Final-stage ordering
For size >= 4, the third-place match is presented before the title final, and the tournament is complete only when both are decided.

**Validates: Requirements 19.2, 21.2**

### Property 8: Correction cascade
Changing an outcome clears every downstream outcome that depended on it (including the champion when the final is affected); in vote-based mode it recomputes re-seeding of affected later rounds; changing a semifinal resets the third-place match and clears 3rd/4th.

**Validates: Requirements 20**

### Property 9: Duplicate detection
Option and suggestion name comparisons ignore letter case and edge whitespace.

**Validates: Requirements 6.5, 9.9**

### Property 10: Name length bounds
Category and option names are 1-100 characters after trimming.

**Validates: Requirements 3, 6.2, 10.7**

### Property 11: Suggestions reviewed first
No suggestion is ever added to the tournament automatically; each is presented for review before entering.

**Validates: Requirements 10.1**

### Property 12: Reject vs replace
Reject triggers automatic AI-based regeneration for that slot; replace triggers no regeneration and uses the typed name or leaves the slot for manual filling.

**Validates: Requirements 10.3, 10.6, 11, 25.5**

### Property 13: Results ordering and immutability
Final standings are always presented before the full bracket, and the full bracket is read-only.

**Validates: Requirements 22.1, 22.9**

### Property 14: English-only text
All user-facing text, including stage labels, is in English.

**Validates: Requirements 24.8**

### Property 15: Bracket completeness
A bracket is generated only when options exactly equal the chosen size; no incomplete bracket is ever generated.

**Validates: Requirements 8.1, 25.4**

## Design Decisions and Rationale

1. **Client-centric SPA with a single AI proxy endpoint.** The requirements forbid accounts and long-term/cross-device storage and mandate session-only retention, so a server-persisted backend is unnecessary and out of scope. The only server responsibility is protecting the AI provider key (Req 9.10), which a minimal proxy satisfies. This keeps the system simple and fully functional even with no key configured (Req 9.11).

2. **Pure domain layer with injected seeded RNG.** All correctness-critical rules (Appendix A) live in framework-free functions, making them exhaustively unit-testable. Injecting a seed makes shuffles, tie-breaks, and equal-vote ordering reproducible in tests while appearing random to users (Req 12.1, 16.9, 17.4).

3. **Single reducer as the only mutation path.** Funneling every change through domain transitions prevents UI code from bypassing invariants (e.g. committing a tie, or advancing an incomplete round), directly protecting Appendix A rules 2, 3, 5, 6, and 8.

4. **`sessionStorage` for persistence.** It matches the retention semantics precisely: survives reload, cleared on tab close, no cross-device sync (Req 23, 25.2). The adapter degrades gracefully when unavailable (Req 23.4).

5. **No third-party UI kit.** A minimal token-based CSS approach gives exact control over the blue/white palette, immediate interactive feedback, and focus-over-hover precedence (Req 24), and keeps the interface clean and minimal.

6. **Mode derived once, never stored as a separate switch.** `mode` is computed from `playerCount` at creation and treated as immutable, enforcing Appendix A rule 1 and Req 5.4/5.5/25.7 structurally rather than by convention.






