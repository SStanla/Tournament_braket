# Requirements Document

## Introduction

This document defines the requirements for a free web application that lets anyone create **single-elimination tournaments** on any custom topic (for example "Best pasta sauce", "Greatest footballers of all time", "Best movie"). A user picks a theme, fills the tournament with competing options, and pits them head-to-head until a champion emerges.

The application is free and requires no account, login, or payment. It supports any topic, can automatically suggest options to help fill the bracket, offers two play modes chosen at creation time, and reveals matchups progressively (only the current matchup during play, the full bracket only at the end).

This requirements document is derived solely from the functional specification and introduces no technical choices. It honors the explicit exclusions (spec section 15) and the critical behavior rules (spec Appendix A). All user-facing text, including stage labels, is in English.

## Glossary

- **Tournament**: a single-elimination competition created on a chosen topic.
- **Category**: the tournament's topic/theme.
- **Option**: a single entry competing in the tournament.
- **Bracket size**: the total number of slots; must be a power of two between 2 and 2048 (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048).
- **Matchup**: a head-to-head contest between two options.
- **Round**: a group of matchups; winners advance to the next round.
- **Stage label**: the human-readable name of a round based on its option count.
- **Third-place match** (playoff): a contest between the two semifinal losers; present only when bracket size is 4 or more.
- **Champion**: the winner of the final.
- **Player count** (voters): an optional whole number entered at creation; when present, activates vote-based mode.
- **Votes**: in vote-based mode, how many voters chose each of a matchup's two options; the two always sum to the player count.
- **Final standings**: the ordered list of placements at the end of the tournament.

---

## Requirements

### Requirement 1: Free access, no account

**User Story:** As a user, I want to use every feature for free without signing up, so that I can create and play tournaments without barriers.

#### Acceptance Criteria

1. THE application SHALL make all features (creation, filling, suggestions, play) available for free.
2. THE application SHALL NOT require any account, sign-up, login, or payment.
3. THE application SHALL NOT provide accounts, profiles, or authentication.
4. THE application SHALL allow an unlimited number of tournaments to be created within the same browser session.

### Requirement 2: Create a tournament

**User Story:** As a user, I want to create a tournament by choosing a topic, a size, and optionally a player count, so that I can set up the competition I want.

#### Acceptance Criteria

1. WHEN the user creates a tournament THE application SHALL collect three inputs: a category (required), a bracket size (required), and a player count (optional).
2. WHEN a tournament is successfully created THE application SHALL show a confirmation and move the user to the filling phase.
3. WHEN a tournament is successfully created THE application SHALL start it empty, with no options and no matchups generated yet.
4. THE application SHALL make a "New tournament" command available at any time.
5. WHEN the user invokes "New tournament" THE application SHALL clear everything and return to the creation screen.

### Requirement 3: Category input validation

**User Story:** As a user, I want clear rules for the category name, so that I know what is accepted.

#### Acceptance Criteria

1. THE application SHALL accept a category as free text of 1 to 100 characters, counted after removing leading and trailing whitespace.
2. IF the category is empty or whitespace-only THEN THE application SHALL block creation and display a message stating the category is required.
3. IF the category exceeds 100 characters (after trimming) THEN THE application SHALL block creation and display a message stating the maximum length.

### Requirement 4: Bracket size input validation

**User Story:** As a user, I want to choose only valid bracket sizes, so that I cannot create an invalid tournament.

#### Acceptance Criteria

1. THE application SHALL offer bracket sizes only among the powers of two between 2 and 2048 (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048).
2. THE application SHALL NOT allow the user to pick a value that is not a power of two within the 2–2048 range.

### Requirement 5: Player count input and mode determination

**User Story:** As a user, I want an optional player count that determines the play mode, so that I can decide once whether the tournament is decided by manual choice or by voting.

#### Acceptance Criteria

1. WHEN the player count field is left empty THE application SHALL set the tournament to classic mode.
2. WHEN the player count is a whole number greater than or equal to 1 THE application SHALL set the tournament to vote-based mode and retain the value for the voting and re-seeding phases.
3. IF the player count is 0, negative, decimal, or non-numeric THEN THE application SHALL block creation and display a message asking for a positive whole number, without losing the other entered data.
4. THE application SHALL determine the play mode solely by the presence of a valid player count, with no other flag or setting.
5. THE application SHALL NOT allow the play mode to be changed after the tournament is created.

### Requirement 6: Adding options

**User Story:** As a user, I want to add options to the tournament, so that I can fill the bracket with the entries I want to compete.

#### Acceptance Criteria

1. WHILE in the filling phase THE application SHALL display the current option count against the chosen size (for example "3 / 8").
2. THE application SHALL accept an option name that, after removing leading and trailing whitespace, has 1 to 100 characters.
3. IF an option name is empty or whitespace-only THEN THE application SHALL reject it with a dedicated message.
4. WHEN an option name is accepted THE application SHALL store it trimmed of leading and trailing whitespace.
5. IF an option name duplicates an existing option, where comparison ignores letter case and edge whitespace THEN THE application SHALL reject it with a dedicated message.
6. THE application SHALL NOT allow more options than the chosen size to be added.
7. WHEN the number of options equals the chosen size THE application SHALL disable the option input and signal that the bracket is full.

### Requirement 7: Removing options

**User Story:** As a user, I want to remove options, so that I can correct mistakes or make room for different entries.

#### Acceptance Criteria

1. THE application SHALL allow any option to be removed.
2. WHEN an option is removed THE application SHALL free its slot, make it available again, and update the count.
3. THE application SHALL allow removal even when the bracket is full, to make room.

### Requirement 8: Enabling bracket generation

**User Story:** As a user, I want to generate the bracket only when it is exactly full, so that no incomplete tournament can start.

#### Acceptance Criteria

1. THE application SHALL present the "generate the bracket" command only when the number of options exactly equals the chosen size.
2. THE application SHALL NOT allow generation of an incomplete bracket.

### Requirement 9: Automatic option suggestions (cascading strategy)

**User Story:** As a user, I want the application to suggest missing options on-topic, so that I can fill the bracket without inventing every entry myself.

#### Acceptance Criteria

1. WHILE slots remain to be filled THE application SHALL allow the user to request suggestions for the missing options.
2. WHEN suggestions are requested THE application SHALL use the tournament's category and the already-entered options as context and aim to produce exactly the number of missing options.
3. WHEN producing suggestions THE application SHALL first query an AI-based generation service that is on-topic with the category and does not repeat already-present options.
4. THE application SHALL treat the AI-based generation call as failed if it does not complete within a maximum time on the order of about 10 seconds.
5. IF the AI-based generation fails, times out, or returns fewer options than needed THEN THE application SHALL draw from curated predefined lists for a set of common categories.
6. WHEN matching a category to a predefined list THE application SHALL use fuzzy, case-insensitive recognition that accounts for exact matches, containments, and keywords.
7. WHEN drawing from predefined lists THE application SHALL exclude already-present options.
8. IF neither the AI-based generation nor the predefined lists can fill all slots THEN THE application SHALL present the suggestions it managed to produce and clearly state that the remaining slots must be filled by hand.
9. THE application SHALL ensure produced suggestions are unique among themselves and against already-present options, with comparison ignoring letter case and whitespace.
10. THE application SHALL handle the AI generation service credential server-side and never expose it to the user.
11. IF the AI-based generation service is not configured THEN THE application SHALL continue to work based on the predefined lists and manual entry.

### Requirement 10: Reviewing suggestions

**User Story:** As a user, I want to review each suggestion before it enters the tournament, so that I stay in control of which options compete.

#### Acceptance Criteria

1. THE application SHALL NOT add any suggestion to the tournament automatically; every suggestion SHALL be presented for review first.
2. WHEN the user accepts a suggestion THE application SHALL turn it into a tournament option occupying a slot.
3. WHEN the user rejects a suggestion THE application SHALL discard it and automatically request a new AI-based suggestion for that same slot that is unique with respect to all current options and all current suggestions.
4. IF the AI-based generation service cannot produce a unique replacement upon rejection (due to failure, timeout, or exhausted options) THEN THE application SHALL leave the slot empty and allow the user to fill it manually.
5. WHEN the user replaces a suggestion with a typed alternative name AND the name is valid THE application SHALL, in a single action, rename the suggestion and immediately accept it as an option.
6. THE application SHALL NOT trigger any automatic regeneration when a suggestion is replaced.
7. IF a replacement name is invalid (empty, longer than 100 characters after trimming, or a duplicate of an option or another suggestion) THEN THE application SHALL reject the replacement with an explanatory message and change nothing.
8. THE application SHALL provide an "Accept all" command that accepts all suggestions currently pending at that moment and adds them as options.
9. WHEN "Accept all" is used THE application SHALL leave untouched any suggestions already rejected or already replaced.
10. IF a single suggestion cannot be added during "Accept all" because the bracket is full or it is a duplicate THEN THE application SHALL skip that suggestion without blocking the others.
11. THE application SHALL provide a "Reject all" command that rejects all suggestions currently pending at that moment.
12. WHEN "Reject all" is used THE application SHALL trigger a new automatic AI-based suggestion to provide a new set of options that can again be accepted or rejected.
13. WHEN all suggestions have been handled THE application SHALL indicate so to the user.

### Requirement 11: Reject vs replace regeneration distinction

**User Story:** As a user, I want rejecting and replacing to behave differently, so that regeneration happens only when I intend it.

#### Acceptance Criteria

1. WHEN a suggestion is rejected THE application SHALL perform an automatic AI-based regeneration for that slot.
2. WHEN a suggestion is replaced THE application SHALL NOT perform any regeneration and SHALL use the typed name, or leave the slot for manual filling.

### Requirement 12: Generating the bracket

**User Story:** As a user, I want the bracket generated fairly from my full set of options, so that play can begin from a correct structure.

#### Acceptance Criteria

1. WHEN the options exactly equal the chosen size AND the user generates the bracket THE application SHALL randomly shuffle the options and distribute them across the first-round matchups so that every slot is filled and no option appears twice.
2. THE application SHALL set the number of rounds equal to the base-2 logarithm of the size.
3. THE application SHALL give the first round half as many matchups as options, and each subsequent round half as many matchups as the previous, down to a single-matchup final.
4. IF the size is 4 or more THEN THE application SHALL prepare a third-place match, initially empty.
5. IF the size is 2 THEN THE application SHALL NOT create a third-place match.
6. THE application SHALL derive stage labels from a round's option count: 2 options → "Final", 4 → "Semifinal", 8 → "Quarterfinal", otherwise "Round of N" (for example "Round of 16").

### Requirement 13: Progressive reveal during play

**User Story:** As a user, I want to see only the current matchup during play, so that outcomes are revealed progressively and future rounds stay hidden.

#### Acceptance Criteria

1. WHILE playing, in both modes, THE application SHALL show exactly one matchup at a time from the current round.
2. THE application SHALL NOT show matchups of future rounds in advance.
3. THE application SHALL display the current round's stage label at the top.
4. THE application SHALL display a position indicator of the form "Matchup X of N", where N is the number of matchups in the current round.
5. THE application SHALL provide Previous and Next navigation controls that let the user move between the current round's matchups, including going back to review or correct an already-decided matchup of the same round.
6. THE application SHALL present the two options as two clearly distinct elements separated by a "versus" (vs) separator with visible spacing on both sides, so the two names never appear adjacent.
7. THE application SHALL keep long names fully readable, on screen or through a way to view the full name.

### Requirement 14: Provisional choice and confirmation

**User Story:** As a user, I want nothing recorded until I confirm with "Next", so that I can adjust a choice before committing it.

#### Acceptance Criteria

1. WHEN the user chooses a winner (classic) or sets a vote split (vote-based) THE application SHALL treat it as a provisional choice and record nothing until the user confirms.
2. WHEN the user confirms with "Next" THE application SHALL record the visible matchup's choice and move to the next matchup.
3. WHEN the user selects "Previous" THE application SHALL go back so the user can review or change a matchup.
4. WHEN the user decides the last matchup of a round THE application SHALL keep that matchup visible with the winner highlighted until the user confirms with "Next", and only then move to the next round.

### Requirement 15: Classic mode — choosing the winner

**User Story:** As a user in classic mode, I want to pick the winner of each matchup manually, so that I control who advances.

#### Acceptance Criteria

1. THE application SHALL present the two options as two selectable buttons.
2. WHEN the user clicks an option THE application SHALL highlight it as the provisional winner.
3. WHEN the user confirms with "Next" THE application SHALL record the highlighted option as the winner and advance.
4. THE application SHALL NOT show any vote-related control in classic mode.
5. THE application SHALL keep pairings fixed as generated: winners always advance into the predetermined slot of the next round, with no re-seeding.

### Requirement 16: Vote-based mode — entering votes

**User Story:** As a user in vote-based mode, I want to split voters' votes between the two options with a slider, so that the option with more votes wins.

#### Acceptance Criteria

1. THE application SHALL present a single horizontal slider with a number of discrete positions equal to the player count plus one, ranging from "0 votes to the left option and all to the right" to the opposite.
2. THE application SHALL orient the slider so that moving it toward an option gives more votes to that option and correspondingly fewer to the other, keeping the sum equal to the player count.
3. THE application SHALL ensure the two options' votes in a matchup always sum to exactly the player count.
4. WHEN a matchup is first shown THE application SHALL start the slider centered: on the exact tie split if the player count is even, or on the position nearest the center if it is odd.
5. THE application SHALL display each option's current votes based on the slider position and highlight the leading option in green, applying the highlight to both the number of votes and the outline in which the number is presented.
6. WHEN the user releases the slider on a non-tied split THE application SHALL record the result automatically and set the option with more votes as the winner.
7. IF the split is a tie (possible only with an even player count) THEN THE application SHALL record no winner and present a random tie-break draw control.
8. WHILE a tie exists and the tie-break has not been used THE application SHALL prevent the user from advancing past that matchup.
9. THE application SHALL present the tie-break control only on a tie, and using it SHALL pick one of the two options as winner with equal 50/50 probability.
10. WHEN the player count is odd THE application SHALL never present a tie-break, because a vote tie cannot occur.
11. THE application SHALL NOT accept a split whose sum differs from the player count.

### Requirement 17: Vote-based dynamic re-seeding

**User Story:** As a user in vote-based mode, I want later rounds re-seeded strongest-vs-weakest by votes, so that pairings reflect how convincingly each option won.

#### Acceptance Criteria

1. THE application SHALL use the random pairings produced at generation time for the first round.
2. WHILE in vote-based mode, for every round after the first, THE application SHALL NOT use the bracket's fixed pairings and SHALL instead re-seed.
3. WHEN re-seeding a round THE application SHALL rank the winners of the just-completed round by the votes they received in the matchup they just won, from most-voted to least-voted, then pair them strongest-vs-weakest (top-ranked versus bottom-ranked, second versus second-to-last, and so on).
4. IF two winners received the same number of votes THEN THE application SHALL resolve the ordering deterministically so that exactly one complete pairing results.
5. THE application SHALL apply strongest-vs-weakest re-seeding only in vote-based mode and only from the rounds after the first.
6. WHILE in classic mode THE application SHALL apply no re-seeding and keep later matchups fixed by the initial bracket.

### Requirement 18: Advancement and deciding order

**User Story:** As a user, I want to decide the current round's matchups in any order, so that I can play flexibly, while the round advances only when complete.

#### Acceptance Criteria

1. THE application SHALL allow a matchup to be decided only when both of its options are present.
2. WHEN a matchup's winner is decided THE application SHALL advance the winner to the corresponding slot of the next round.
3. WHEN the final's winner is decided THE application SHALL set that option as the champion.
4. WHILE the current round has undecided matchups THE application SHALL allow the user to decide them in any order and navigate freely between them.
5. THE application SHALL NOT advance to the next round until all of the current round's matchups are decided.

### Requirement 19: Third-place match (size 4 or more)

**User Story:** As a user, I want a third-place playoff in tournaments of size 4 or more, so that third and fourth place are decided.

#### Acceptance Criteria

1. WHEN both semifinals have a winner THE application SHALL automatically populate the third-place match with the two semifinal losers and make it playable, identically in classic and vote-based mode.
2. WHEN in the final stage THE application SHALL present the third-place match first, with a dedicated label, and only after it is decided present the final for the title.
3. WHEN the third-place match is decided THE application SHALL set its winner as third and the other as fourth.
4. WHILE in vote-based mode THE application SHALL decide the third-place match by votes exactly like any other matchup, applying the same vote-sum rule and the same tie-break on a tie.
5. IF the size is 2 THEN THE application SHALL NOT provide a third or fourth place.

### Requirement 20: Correcting an already-decided outcome

**User Story:** As a user, I want corrections to cascade correctly, so that changing an earlier result keeps the tournament consistent.

#### Acceptance Criteria

1. WHEN the user changes the winner of an already-decided matchup THE application SHALL clear every downstream outcome that depended on the old winner and require it to be decided again.
2. IF the changed outcome involves the final THEN THE application SHALL clear the champion as well.
3. WHILE in vote-based mode, WHEN the user changes the outcome of an earlier round THE application SHALL recompute the re-seeding of every affected subsequent round based on the new winners and their votes.
4. WHEN a semifinal outcome is changed THE application SHALL reset the third-place match to the current losers, clear any already-assigned third and fourth place, and require the playoff to be played again.

### Requirement 21: Completing the tournament

**User Story:** As a user, I want the tournament to complete only when all deciding matchups are done, so that final results are valid.

#### Acceptance Criteria

1. IF the size is 2 THEN THE application SHALL consider the tournament complete as soon as the final is decided.
2. IF the size is 4 or more THEN THE application SHALL consider the tournament complete only when both the final and the third-place match are decided.

### Requirement 22: End of tournament — standings then full bracket

**User Story:** As a user, I want to see the final standings and then the complete bracket, so that I can review the full outcome.

#### Acceptance Criteria

1. WHEN the tournament is complete THE application SHALL show the final standings first and the full bracket after.
2. THE application SHALL present final standings from first place down: 1st = champion with a gold medal, 2nd = defeated finalist with a silver medal.
3. IF the size is 4 or more THEN THE application SHALL also show 3rd place with a bronze medal and 4th place as a text indicator with no medal.
4. IF the size is 2 THEN THE application SHALL show only 1st and 2nd place.
5. THE application SHALL keep long names in the standings fully readable.
6. THE application SHALL show the full bracket as a tree with all rounds from the first to the final, the name in each occupied slot, each round's stage label, and lines connecting each matchup to the next round's slot.
7. IF the size is 4 or more THEN THE application SHALL include the third-place match in the full bracket, highlighted as a distinct matchup with a dedicated label.
8. THE application SHALL make the champion, and for size 4 or more the third and fourth place, clearly visible in the full bracket.
9. THE application SHALL present the full bracket as a read-only view; corrections SHALL be made during round-by-round play, not from the final tree.

### Requirement 23: Data retention within the browser session

**User Story:** As a user, I want my tournament to persist for the browser session, so that a reload does not lose my progress.

#### Acceptance Criteria

1. THE application SHALL retain tournament data for the duration of the browser session, surviving a page reload.
2. THE application SHALL discard tournament data when the tab or window is closed.
3. THE application SHALL NOT retain data beyond the browser session, provide long-term storage, or perform cross-device sync.
4. IF data retention is not possible THEN THE application SHALL keep working within the current session and signal that data might not be saved, without losing what is already present.

### Requirement 24: Look and interaction

**User Story:** As a user, I want a clean, consistent, accessible interface, so that the application is pleasant and usable.

#### Acceptance Criteria

1. THE application SHALL present a clean, minimal interface with a consistent blue-and-white palette applied to backgrounds, primary interactive elements, and accents across all screens.
2. THE application SHALL use consistent spacing and alignment and visually group related sections.
3. THE application SHALL give buttons distinct visual states for default, pointer hover, and keyboard focus.
4. WHEN hover and focus coincide THE application SHALL let focus take precedence.
5. THE application SHALL make the visual change that signals interactivity immediate.
6. THE application SHALL provide adequate text-to-background contrast for readability, targeting contrast ratios that meet AA levels.
7. THE application SHALL use the logo file named "logo_app_tournament.svg".
8. THE application SHALL present all user-facing text, including stage labels, in English.

### Requirement 25: Explicit exclusions

**User Story:** As a stakeholder, I want out-of-scope behaviors explicitly excluded, so that reconstruction stays faithful to the specification.

#### Acceptance Criteria

1. THE application SHALL NOT provide accounts, profiles, or authentication.
2. THE application SHALL NOT retain data beyond the browser session, provide long-term storage, or perform cross-device sync.
3. THE application SHALL NOT support tournaments of a size other than a power of two, nor sizes outside the 2–2048 range.
4. THE application SHALL NOT allow generation of an incomplete bracket; it generates only when the slots are exactly full.
5. THE application SHALL NOT perform automatic regeneration when a suggestion is replaced; regeneration happens only on reject.
6. THE application SHALL NOT accept, in vote-based mode, splits whose sum differs from the player count.
7. THE application SHALL NOT allow the play mode (classic or vote-based) to be changed after the tournament is created.
8. THE application SHALL NOT support tournament formats other than single-elimination (no groups, no double elimination, and similar).
