# Functional Specification — Single-Elimination Tournament Bracket Creator

> **Purpose of this document**
> This file describes, in plain language and **without technical detail**, how the
> application must behave from the user's point of view. It is meant to be handed to a
> fresh session, in a clean project, to (re)define and build the application from scratch.
>
> It contains no implementation choices (languages, libraries, file or function names,
> code structure). It describes **what** the application does and **how it behaves**, not
> **how it is built**. Technical decisions are left to the development session.

---

## 1. What the application is

A free web application that lets anyone create **single-elimination tournaments** on any
custom topic. The user picks a theme (for example "Best pasta sauce", "Greatest footballers
of all time", "Best movie"), fills the tournament with the competing options, and pits them
head-to-head until a champion emerges.

Core traits:

- **Free, no account.** All features are available for free, with no sign-up, login, or
  payment.
- **Any topic.** A tournament can be about anything: people, objects, foods, concepts. For
  that reason we speak generally of "options" or "participants", not necessarily people.
- **Automatic help filling the bracket.** If the user does not have enough options, the
  application can suggest more on-topic ones.
- **Two play modes** chosen at creation time (see section 3).
- **Progressive reveal.** During play only the current matchup is shown; the full bracket
  appears only at the end.

---

## 2. Glossary

Terms used consistently throughout this document.

- **Tournament**: a single-elimination competition created on a chosen topic.
- **Category**: the tournament's topic/theme (e.g. "Best pasta sauce").
- **Option**: a single entry of the "mathcup" competing in the tournament.
- **Bracket size**: the total number of available slots, which must be a power of two
  (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048).
- **Matchup**: a head-to-head contest between two options (**Option**).
- **Round**: a group of matchups; winners advance to the next round.
- **Stage label**: the human-readable name of a round based on how many options it contains
  (e.g. "Round of 16", "Quarterfinal", "Semifinal", "Final").
- **Third-place match** (playoff): a contest between the two semifinal losers to decide
  third and fourth place. Present only when the bracket size is 4 or more.
- **Champion**: the winner of the final.
- **Player count** (voters): an optional whole number entered at creation defining the participants of the torunament; if present, it activates vote-based mode (see section 3).
- **Votes**: in vote-based mode, how many voters chose each of a matchup's two options. The
  two options' votes always sum to the player count.
- **Final standings**: the ordered list of placements at the end of the tournament.

---

## 3. The two play modes

The mode is decided **once**, at creation time, based on an optional "player count" field.
It is not a separate setting: it is determined solely by whether that value is present.

### 3.1 Classic mode (no player count)

- The "player count" field is left empty.
- Each matchup is decided by **manually choosing the winner** between the two options.
- Pairings follow the bracket fixed at generation time: winners always advance into the
  predetermined slot of the next round.
- No vote-related control appears.

### 3.2 Vote-based mode (player count provided)

- The user enters a whole number of players/voters greater than or equal to 1.
- Each matchup is decided by **splitting the voters' votes between the two options**; the
  option with more votes wins.
- The two options' votes in a matchup must sum to **exactly** the player count.
- **Dynamic re-seeding**: every round after the first does NOT use the bracket's fixed
  pairings. The winners of the just-completed round are ranked by the votes they received in
  the matchup they just won, from most-voted to least-voted, then paired
  "strongest-vs-weakest": the top-ranked winner faces the bottom-ranked, the second faces
  the second-to-last, and so on. If two winners received the same number of votes, the
  ordering is still resolved deterministically so that exactly one complete pairing results.
- The first round instead uses the random pairings produced at generation time.

> Note: classic mode applies **no** re-seeding: later matchups stay as fixed by the initial
> bracket.

---

## 4. Full user flow

1. **Create the tournament** — the user chooses a category, a bracket size, and
   (optionally) a player count.
2. **Fill it** — the user adds options manually and/or requests automatic suggestions until
   all slots are filled.
3. **Generate the bracket** — once the slots are exactly full, the user starts the
   tournament.
4. **Play round by round** — one matchup is decided at a time; at the end of each round the
   next one begins.
5. **Finish** — once the champion (and, for sizes 4+, the third place) is decided, the final
   standings and the complete bracket are shown.

A "New tournament" command is available at any time; it clears everything and returns to the
creation screen.

---

## 5. Creating a tournament

The creation form collects three inputs:

**Category (required)**
- Free text, 1 to 100 characters, counted after removing leading and trailing whitespace.
- An empty or whitespace-only category is not allowed: creation is blocked with a message
  stating the category is required.
- A category longer than 100 characters is not allowed, with a message stating the maximum
  length.

**Bracket size (required)**
- Selectable only among powers of two between 2 and 2048.
- The user must not be able to pick an invalid value: only valid values are offered.

**Player count (optional)**
- Left empty → classic mode.
- A whole number greater than or equal to 1 → vote-based mode (the value is kept for the
  voting phase and re-seeding).
- Invalid values (0, negative, decimal, non-numeric) are not allowed: creation is blocked
  with a message asking for a positive whole number, without losing the other entered data.

On successful creation the user gets a confirmation and moves to the filling phase; the
tournament starts empty (no options, no matchups generated yet).

---

## 6. Adding and removing options

During filling the user sees the current count against the chosen size (for example
"3 / 8").

**Adding an option**
- A name is valid if, after removing leading and trailing whitespace, it has 1 to 100
  characters.
- Empty or whitespace-only names are rejected with a dedicated message.
- The name is stored trimmed of edge whitespace.
- **No duplicates**: comparison ignores letter case and edge whitespace, so "Mario" and
  " mario " are treated as the same name. A duplicate is rejected with a dedicated message.
- No more options than the chosen size can be added. When the slots are full the input is
  disabled and signals the bracket is full.

**Removing an option**
- Any option can be removed; the freed slot becomes available again and the count updates.
  Removal is possible even when the bracket is full, to make room.

The command to **generate the bracket** appears only when the number of options exactly
equals the chosen size.

---

## 7. Automatic option suggestions

When slots remain to be filled, the user can ask the application to suggest the missing
options. The request uses the tournament's category and the already-entered options as
context, and aims to produce exactly the number of missing options.

**How suggestions are produced (cascading strategy)**

1. **Intelligent generation (primary).** The application queries an AI-based generation
   service, on-topic with the category and without repeating already-present options. The
   call must complete within a maximum time (on the order of ~10 seconds); beyond that it is
   considered failed.
2. **Local fallback lists.** If intelligent generation fails, times out, or returns fewer
   options than needed, the application draws from curated predefined lists for a set of
   common categories. Category recognition is "fuzzy" and case-insensitive (it recognizes
   exact matches, containments, and keywords), so similar categories map to the right list.
   Already-present options are excluded here too.
3. **Manual entry (last resort).** If not even the local lists can fill all slots, the
   application presents the suggestions it managed to produce and clearly states that the
   remaining slots must be filled by hand.

Produced suggestions are always **unique** among themselves and against already-present
options (comparison ignores letter case and whitespace).

> Configuration note (non-technical): the intelligent generation service requires a
> key/credential from the chosen provider, handled server-side and never exposed to the
> user. Without that configuration the application must keep working based on the local
> lists and manual entry.

---

## 8. Reviewing suggestions

Produced suggestions are **not** added to the tournament automatically: they are first
presented to the user for review. For each pending suggestion the user can:

- **Accept it** — the suggestion becomes a tournament option, occupying a slot.
- **Reject it** — the suggestion is discarded and **automatically regenerated**: rejecting a
  suggestion triggers a new AI-based suggestion (via the intelligent generation service) for
  that same slot, unique with respect to all current options and all current suggestions. If
  the service cannot produce a unique replacement (failure, timeout, or exhausted options),
  the slot is left empty and the user may fill it manually. (This automatic regeneration
  happens **only** on reject, not on replace.)
- **Replace it** — the user types an alternative name; if the name is valid, in a single
  action the suggestion is renamed and immediately accepted as an option. Replacing does
  **not** trigger any automatic regeneration — it is a manual override. If the replacement
  name is invalid (empty, too long, or a duplicate of an option or another suggestion), the
  replacement is rejected with an explanatory message and nothing changes.

There is also an **"Accept all"** command that, in one gesture, accepts all suggestions
currently pending at that moment, adding them as options. Suggestions already rejected or
already replaced are left untouched. If a single suggestion cannot be added (because the
bracket is full or it is a duplicate), it is simply skipped without blocking the others.

There is also a **"Reject all"** command that, in one gesture, reject all suggestions currently pending at that moment, rejecting them as options. Suggestion rejected must trigger a new automatic AI-suggestion to provide a new set of options, that again can be accepted or rejected.

When all suggestions have been handled, the application says so.

> Reject vs replace, at a glance:
> - **Reject** → automatic AI-based regeneration for that slot.
> - **Replace** → no automatic regeneration; the typed name is used, or the user fills the
>   slot manually.

---

## 9. Generating the bracket

When the options exactly equal the chosen size, the user generates the bracket.

- The options are **randomly shuffled** and distributed across the first-round matchups, so
  that every slot is filled and no option appears twice.
- The number of rounds equals the base-2 logarithm of the size (for example 8 options →
  3 rounds). The first round has half as many matchups as options; each subsequent round has
  half of the previous, down to the final (a single matchup).
- If the size is **4 or more**, a **third-place match** is also prepared, initially empty. If
  the size is **2**, there is no third-place match.

Stage labels derive from the round's option count: 2 options → "Final", 4 → "Semifinal",
8 → "Quarterfinal", otherwise "Round of N" (for example "Round of 16").

---

## 10. Play: one matchup at a time

Throughout play, and in **both** modes, the application shows **one matchup at a time** from
the current round. Matchups of future rounds are never shown in advance.

- The current round's stage label appears at the top.
- A position indicator of the form **"Matchup X of N"** is shown, where N is the number of
  matchups in the current round.
- **Previous / Next** navigation controls let the user move between the current round's
  matchups, so they can go back to review or correct an already-decided matchup of the same
  round.
- The two options are always shown as two clearly distinct elements, separated by a "versus"
  (vs) separator with visible spacing on both sides: the two names never appear adjacent.
- Long names always remain fully readable (on screen or through a way to view the full
  name).

**User-driven progression (in both modes).** Choosing the winner (classic) or setting the
vote split (vote-based) only sets a **provisional** choice: nothing is recorded until the
user confirms with "Next". "Next" records the visible matchup's choice and moves to the next
matchup; "Previous" goes back to review or change.

When the user decides the **last** matchup of a round, the application keeps that matchup
visible with the winner highlighted until the user confirms with "Next"; only then does it
move to the next round. This prevents the screen from "jumping" away before the user sees the
just-decided outcome.

### 10.1 Classic mode — choosing the winner

- The two options are presented as two selectable buttons.
- Clicking an option highlights it as the provisional winner.
- "Next" records the winner and advances. No vote-related control is visible.

### 10.2 Vote-based mode — entering votes

- Below the two options there is **a single horizontal slider** with a number of discrete
  positions equal to the player count plus one (from the split "0 votes to the left option
  and all to the right" to the opposite).
- The slider is intuitively oriented: moving it **toward** an option gives **more** votes to
  that option (and correspondingly fewer to the other), so the sum always stays equal to the
  player count.
- The slider starts **centered**: on the exact tie split if the player count is even, or on
  the position nearest the center if it is odd.
- Each option's current votes are shown based on the slider position; the leading option is
  highlighted in green, both number of votes and the outline in which number is presented.
- Releasing the slider on a **non-tied** split records the result automatically, and the
  option with more votes wins.
- If the split is a **tie** (possible only with an even player count), no winner is recorded:
  a **random tie-break draw** control appears instead. Until the draw is used, the user
  cannot advance past that matchup.
- The tie-break control appears **only** on a tie; using it picks one of the two options as
  winner with equal probability (50/50).

> Note: with an **odd** player count a vote tie can never occur, so the tie-break will never
> appear.

---

## 11. Advancement, third place, and corrections

**Advancing the winner.** A matchup can be decided only when both options are present. Once
the winner is decided, it advances to the corresponding slot of the next round. The winner
of the final becomes the champion.

**Deciding in any order.** Within the current round, as long as there are undecided
matchups, the user may decide them in any order and navigate freely between them. The round
does not advance until all its matchups are decided.

**Third-place match (size 4 or more).**
- When both semifinals have a winner, the two semifinal losers automatically populate the
  third-place match, which becomes playable. This applies identically in classic and
  vote-based mode.
- In the final stage, the application presents the third-place match **first** (with a
  dedicated label) and only **after** it is decided presents the final for the title.
- The winner of the third-place match is **third**; the other is **fourth**. In vote-based
  mode the third-place match is decided by votes exactly like any other matchup (same
  vote-sum rule and same tie-break on a tie).
- With size **2** there is no third/fourth place.

**Correcting an already-decided outcome.**
- If the user changes the winner of an already-decided matchup, every downstream outcome
  that depended on the old winner is cleared and must be decided again (if the final is
  involved, the champion is cleared too).
- In vote-based mode, changing the outcome of an earlier round also recomputes the
  re-seeding of every affected subsequent round, based on the new winners and their votes.
- If a **semifinal** outcome is changed, the third-place match is reset to the current losers
  and any already-assigned third/fourth place is cleared, requiring the playoff to be played
  again.

**Completing the tournament.**
- With size 2, the tournament is complete as soon as the final is decided.
- With size 4 or more, the tournament is complete only when **both** the final **and** the
  third-place match are decided.

---

## 12. End of tournament: standings and full bracket

Once the tournament is complete, the application shows, in this order:

1. **Final standings**, from first place down:
   - 1st = champion (gold medal), 2nd = defeated finalist (silver).
   - For size 4 or more: 3rd place (bronze) and 4th place (text indicator, no medal).
   - For size 2: only 1st and 2nd place.
   - Long names remain fully readable.
2. **Full bracket**, shown as a tree with all rounds from the first to the final, the name in
   each occupied slot, each round's stage label, and lines connecting each matchup to the
   next round's slot. For size 4 or more, the bracket also includes the third-place match,
   highlighted as a distinct matchup with a dedicated label. The champion and (for size 4+)
   third and fourth place are clearly visible.

The full bracket is a **read-only** view of the outcome: corrections are made during
round-by-round play, not from the final tree.

---

## 13. Free access and data retention

- All features (creation, filling, suggestions, play) are free and require no account or
  payment.
- There is no limit on the number of tournaments creatable within the same browser session.
- Tournament data is retained for the duration of the **browser session**: it survives a
  page reload but is discarded when the tab/window is closed.
- If data retention were not possible, the application must keep working within the current
  session and signal that data might not be saved, without losing what is already present.

---

## 14. Look and interaction

- Clean, minimal interface with a consistent **blue-and-white** palette applied to
  backgrounds, primary interactive elements, and accents across all screens.
- Consistent spacing and alignment; related sections are visually grouped.
- Buttons have distinct visual states for default, pointer hover, and keyboard focus; when
  hover and focus coincide, focus takes precedence. The visual change that signals
  interactivity is immediate.
- Adequate text-to-background contrast for readability (accessibility target: contrast
  ratios meeting AA levels).
- The logo filename is: "logo_app_tournament.svg"

> Accessibility note: full conformance requires manual testing with assistive technologies
> and expert review; this document sets the targets, it does not certify conformance.

---

## 15. What the application does NOT do (explicit exclusions)

To avoid misunderstandings during reconstruction:

- No accounts, profiles, or authentication.
- No data retention beyond the browser session; no long-term storage and no cross-device
  sync.
- No tournaments of a size other than a power of two, and no sizes outside the 2–2048 range.
- No "incomplete" brackets: the tournament generates only when the slots are exactly full.
- No automatic regeneration when a suggestion is **replaced** (regeneration happens only on
  **reject**).
- In vote-based mode it does not accept splits whose sum differs from the player count.
- The mode (classic/vote-based) cannot be changed after the tournament is created.
- No tournament formats other than single-elimination (no groups, double elimination, etc.).

---

## Appendix A — Critical behavior rules (checklist)

These are the rules where inconsistencies have historically crept in. They must be honored
without exception.

1. The mode depends **only** on the player count: empty = classic, whole number ≥ 1 =
   vote-based. No other flag.
2. A matchup's vote sum = the player count, **always and exactly**.
3. A vote tie is possible **only** with an even player count; in that case a random tie-break
   is required before proceeding.
4. "Strongest-vs-weakest" re-seeding applies **only** in vote-based mode and **only** from
   the rounds after the first; in classic mode pairings stay fixed.
5. During play the user sees **one matchup at a time** and **never** future rounds.
6. Nothing is recorded before the "Next" confirmation; the last matchup of a round stays
   visible with its outcome until confirmed.
7. In the final stage (size 4+): the third-place match **first**, then the title final. The
   tournament is complete only when both are decided.
8. Changing an outcome clears everything downstream that depended on it (and, in vote-based
   mode, recomputes the re-seeding of subsequent rounds). Changing a semifinal clears the
   third-place match.
9. Duplicate options are judged ignoring letter case and edge whitespace.
10. Category and option names: 1–100 characters after trimming.
11. Suggestions are always presented for review before entering the tournament; they are
    never added automatically.
12. **Reject** a suggestion → automatic AI-based regeneration for that slot; **replace** a
    suggestion → no regeneration, the typed name is used or the slot is filled manually.
13. Final standings always come before the full bracket; the final tree is read-only.
14. All user-facing text is in **English**, including stage labels.
```
