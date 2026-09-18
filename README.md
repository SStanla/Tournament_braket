<div align="center">
  <img src="./logo_app_tournament.svg" alt="Tournament Bracket Creator logo" width="120" />

  # Tournament Bracket Creator

  Create single-elimination tournaments on any topic and battle your options head-to-head until a champion emerges.

  ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
  ![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)
  ![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)
</div>

---

## Overview

Tournament Bracket Creator is a free, no-account web app that lets anyone build **single-elimination tournaments** on any custom topic, for example "Best pasta sauce", "Greatest footballers of all time", or "Best movie".

Pick a theme, fill the bracket with the competing options (with optional AI help), then decide each matchup one at a time until a champion is crowned. The full bracket stays hidden during play and is revealed only at the end.

## Features

- **Free and account-free.** Every feature is available without sign-up, login, or payment.
- **Any topic.** Tournaments can be about people, objects, foods, or concepts.
- **Two play modes**, chosen once at creation time:
  - **Classic mode** — pick the winner of each matchup manually.
  - **Vote-based mode** — split a fixed number of voters' votes between the two options; more votes wins. Later rounds use dynamic "strongest-vs-weakest" re-seeding, and vote ties trigger a random tie-break.
- **AI-assisted filling.** Missing options can be auto-suggested on-topic, with a cascading strategy: AI generation first, curated local fallback lists next, manual entry as a last resort.
- **Suggestion review.** Accept, reject (auto-regenerates that slot), or replace suggestions, plus "Accept all" / "Reject all".
- **Progressive reveal.** Only the current matchup is shown during play; the complete bracket appears at the end.
- **Third-place playoff** for brackets of size 4 or more.
- **Final standings and read-only bracket tree** once the tournament is complete.
- **Bracket sizes** as any power of two from 2 up to 2048.
- **Session persistence.** Data survives a page reload and is discarded when the tab is closed.

> For the full behavioral specification, see [`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md).

## Tech stack

- **Frontend:** React 18 + TypeScript, built with Vite.
- **Styling:** CSS Modules.
- **Testing:** Vitest + Testing Library (jsdom environment).
- **AI suggestions:** Netlify serverless function proxying Google Gemini, keeping the API key server-side.
- **Hosting:** Netlify (static site plus serverless functions).

## Project structure

```
.
├── src/
│   ├── api/            # Suggestion + Gemini client logic
│   ├── app/            # App-level wiring
│   ├── components/     # Screens: Create, Fill, Play, Results, SuggestionReview, matchups
│   ├── domain/         # Tournament model, validation, re-seeding, standings, RNG (unit-tested)
│   ├── integration/    # Integration tests
│   ├── services/       # Suggestion service
│   ├── styles/         # Shared styles
│   └── test/           # Test setup
├── netlify/
│   └── functions/
│       └── suggestions.mts   # /api/suggestions serverless proxy
├── netlify.toml        # Build + redirects configuration
├── vite.config.ts
└── package.json
```

## Getting started

### Prerequisites

- Node.js 18 or newer
- npm

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

Vite serves the app locally (default: `http://localhost:5173`).

> Note: the AI suggestion endpoint (`/api/suggestions`) is served by a Netlify function. To exercise it locally, run the app through the Netlify CLI (`netlify dev`). Without it, the app still works via the local fallback lists and manual entry.

### Build for production

```bash
npm run build
```

Outputs the static site to `dist/`.

### Preview the production build

```bash
npm run preview
```

## Testing

```bash
npm test          # run the full suite once
npm run test:watch  # watch mode
```

## Configuration

AI-based suggestions require a Google Gemini API key, read **server-side only** and never exposed to the browser.

1. Copy the example environment file and add your key:

   ```bash
   cp .env.example .env
   ```

2. Set `GEMINI_API_KEY` in `.env` (get a key from [Google AI Studio](https://aistudio.google.com/app/apikey)).

For deployment, set `GEMINI_API_KEY` in your Netlify site settings under **Site configuration → Environment variables**.

Without this configuration the app keeps working using the local fallback lists and manual entry.

## Deployment

The project deploys to Netlify with the settings in [`netlify.toml`](./netlify.toml):

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions`
- SPA fallback and asset redirects are preconfigured.

Remember to define `GEMINI_API_KEY` in the Netlify environment variables to enable AI suggestions in production.

## License

No license file is currently included. Add one if you intend to open-source this project.
