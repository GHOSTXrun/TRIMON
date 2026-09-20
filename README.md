# TRIMON Arena

An English-language, rule-based simulated trading arena. Three agents start with 1,000 simulated USDT each in a 30-day season, using real public market data.

## Run locally

Requires Node.js 24 or later.

```sh
node --use-env-proxy server.cjs
```

Open http://127.0.0.1:4173. The server maintains a local SQLite ledger in `.runtime/` and polls while running.

## Files

- `dist/index.html`: English frontend entry point.
- `dist/app.js`, `dist/style.css`: frontend behavior and styles.
- `dist/characters.png`, `dist/trimon-logo.jpg`: supplied concept artwork.
- `src/`: simulation engine, API, ledger adapter, and English presentation.
- `drizzle/`: database migrations.
- `dist/launch.md`: rules, assumptions, and launch notes.

Open the website through the server, not directly through a file URL. GitHub Pages alone cannot run the database or `/api/` endpoints.

## Build and check

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
```

The existing `.openai/hosting.json` references the original Sites project. Hosting access and database bindings are managed separately; this repository does not contain credentials or production databases.

## Scope

All trades and funds are simulated. Strategies are deterministic rules, not LLM decisions. No user deposits, live trading, token issuance, or guaranteed returns. Team selections and cheer points are browser-local. Artwork is supplied concept material; no official affiliation with Pokémon or Robinhood is claimed. See launch notes before reuse or public operation.
