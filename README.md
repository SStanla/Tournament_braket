# Tournament Bracket Creator

A free web application for creating single-elimination tournament brackets on any custom category. Define a topic (e.g., "Best pasta al sugo", "Best football players of all time"), add participants, get AI-powered suggestions to fill remaining slots, and compete head-to-head until a champion emerges.

## Features

- **Custom categories** - Create tournaments on any topic you want
- **Flexible bracket sizes** - Power-of-2 sizes from 2 to 2048
- **AI auto-suggestions** - Intelligent participant suggestions powered by Google Gemini (free tier), with local fallback lists for common categories. Accept suggestions one by one or all at once with a single "Accept all" action
- **Two tournament modes** - Chosen at creation via an optional player count:
  - **Classic mode** (no player count): pick each matchup winner manually; pairings follow a fixed bracket
  - **Vote-based mode** (player count entered): decide each matchup with a single horizontal slider shown below the two options. The slider starts centered; dragging and releasing it sets the vote split (the two totals always sum to the player count) and automatically records the result - there is no separate confirm step. An even-count tie shows a random tie-break draw button
- **Dynamic re-seeding** - In vote-based mode, every round after the first re-pairs the winners strongest-vs-weakest (most-voted faces least-voted), based on the votes received
- **Round-by-round reveal** - During play only the current round is shown, labelled by stage (Round of 16, Quarterfinal, Semifinal, Final); matchups are shown one at a time with a "Matchup X of N" indicator and Prev/Next navigation to move between the current round's matchups (so you can go back and correct a mis-click). The complete bracket is revealed only once a champion is decided
- **Third- and fourth-place playoff** - For brackets of size 4+, the two semifinal losers compete for third place
- **Interactive bracket visualization** - SVG bracket with click-to-advance (classic) or vote entry (vote-based); long participant names wrap and stay fully readable on mobile
- **Clean blue-and-white theme** - Minimal, accessible UI (WCAG AA contrast) with consistent hover/focus states
- **Session persistence** - Tournament data persists in your browser session (no account required)
- **Fully client-side** - No backend needed for the core flow; the only network call is the optional AI suggestion proxy

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** for build and dev server
- **Vitest** + **fast-check** for unit and property-based testing
- **Netlify Functions** as serverless proxy for Google Gemini API

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install and Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Run Tests

```bash
npm test
```

## Deployment (Netlify)

The app is configured for deployment on Netlify with a serverless function that proxies Google Gemini API calls (keeping your API key secret).

### Steps

1. Push this repo to GitHub
2. Connect the repo on https://app.netlify.com
3. Add the environment variable in Site settings -> Environment variables:
   ```
   GEMINI_API_KEY = your-gemini-api-key
   ```
4. Deploy - Netlify will build and publish automatically

The build configuration is in netlify.toml. The proxy function lives in netlify/functions/suggest.mjs.

### Get a Free Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account (no credit card required)
3. Click "Create API key"
4. Copy the key

Gemini free tier includes 15 requests/minute and 1000 requests/day - more than enough for this app.

### Local Development with AI Suggestions

To test AI suggestions locally, create a .env.local file:

```env
VITE_AI_API_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=YOUR_KEY
VITE_AI_API_KEY=your-gemini-key
```

Without these variables, the app falls back to local curated category lists.

## How It Works

1. Create a tournament: pick a category, a power-of-2 bracket size, and optionally a number of players (leave empty for classic mode).
2. Fill the bracket: add participants manually and/or generate AI suggestions to fill the remaining slots.
3. Play round by round - matchups are shown one at a time, with a "Matchup X of N" indicator and Prev/Next navigation to move between the current round's matchups. Classic mode: click the winner of each matchup. Vote-based mode: drag the horizontal slider below the two options and release it to set the vote split; releasing automatically records the result (an even-count tie shows a random tie-break draw instead).
4. Advance: in vote-based mode the next round re-pairs winners strongest-vs-weakest; in classic mode it follows the fixed bracket.
5. Finish: once the final is decided, the full bracket is revealed with the champion, runner-up, and (for size 4+) third and fourth place.

## Project Structure

```
src/
  components/   React UI components (TournamentCreator, ParticipantManager, SuggestionPanel, CurrentRoundView, BracketVisualizer)
  services/     Business logic (bracket-manager, validation, auto-suggest, suggestion-review, persistence, local-category-lists)
  state/        React Context + reducer for state management
  types/        TypeScript interfaces and type definitions
  theme.css     Blue-and-white UI theme (design tokens)
  __tests__/    Property-based, unit, component, and integration tests

netlify/
  functions/    Serverless function (Google Gemini proxy: suggest.mjs)
```

## License

MIT
