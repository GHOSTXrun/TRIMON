# TRIMON: Simulated Perpetuals Arena

## Current rules
Each agent starts with 1,000 simulated USDT in a 30-day season. The perpetuals ledger is separate from the preserved legacy spot ledger.

- Reference prices use public spot minute candles from Binance, Gate, OKX, or Coinbase. The active source appears in the ticker and new trade records. These are not perpetual fill or mark prices.
- Fire uses 3× trend following with about 50% margin; Grass uses 1× trend confirmation with about 40%; Water uses 2× mean reversion with about 40%. Leverage is fixed and each agent holds one direction at a time. Same-direction positions are not repeatedly resized.
- Signals use 20 completed minute candles and execute at the next open. Each entry and exit includes a 0.05% fee plus 0.02% simulated slippage.
- Simulated funding is fixed at 0.01% every 8 hours: longs pay and shorts receive. This is not an actual exchange funding rate.
- Candle highs and lows are checked against a 20% drawdown stop relative to the recorded equity peak. Opening gaps exit at the opening price. Costs and gaps can increase losses beyond 20%. This is not an exchange liquidation model.
- The journal, CSV exports, and candle markers show simulated trades. Strategies are deterministic rules, not LLM outputs.
- Players can choose a team for free and earn 10 points per daily cheer. Team Member and Core Supporter badges unlock at 30 and 70 points. Selections and points are stored only in the current browser, are not global votes, and cannot be redeemed for cash. Clearing browser data removes them.
- No deposits, token issuance, or profit sharing.

## Local operation
Requires Node.js 24 or later for built-in SQLite. Run `node --use-env-proxy server.cjs` from the project directory and open http://127.0.0.1:4173.

The local ledger is stored in `.runtime/trimon.sqlite`. The service polls every 15 seconds even after the browser closes. Stopping the process, shutting down, or sleeping the computer stops polling. Restarting restores the ledger and processes missing historical candles in sequence. Feed failures pause processing; prices are never fabricated.

Hosted operation uses a Cloudflare Worker and a Sites-managed D1 database. Processing is currently triggered by visits. A scheduled handler exists, but independent minute scheduling must be verified before claiming unattended 24/7 operation. Historical processing after inactivity is marked as backfilled.

Local and hosted databases are independent. Choose one official environment before launching a season.

## Pre-launch checks
1. Select the official environment and configure independent minute scheduling and process management.
2. Observe at least seven days of feed latency, missing candles, API errors, concurrent requests, backups, strategy costs, and rankings.
3. Test restarts and outages. Confirm there are no duplicate fills or skipped unknown prices, and that backfilled trades are marked.
4. Alert on feed delays above three minutes, database write failures, and scheduler outages. Pause processing while preserving the last recorded results.
5. Verify backup recovery. Do not erase losing records to restart an official season.
6. Complete artwork licensing or original replacements and TRIMON name checks before expanding public access.
7. Publish season dates, strategy versions, capital assumptions, data sources, costs, and drawdown methodology.

## Future model experiments
Evaluate LLM strategies in a separate season without changing an active season. Keep model credentials on the server. Validate model outputs as constrained trading intents and apply risk controls before simulated execution. Save input data, model and prompt versions, raw responses, accepted signals, and execution results. Set budgets, timeouts, fallbacks, and a stop switch.

## Technical handoff
- `src/engine.mjs`: strategy rules, costs, elimination, settlement, and sequential backfilling.
- `src/service.mjs`: read-only JSON and CSV endpoints.
- `src/english.mjs`: English presentation of current and historical ledger records; stored identifiers remain unchanged.
- `src/local-db.mjs`: local SQLite adapter. Never publish the database file.
- `db/schema.ts` and `drizzle/`: hosted schema and migrations.
- `server.cjs`: continuous service bound to local loopback only.
- `scripts/build.mjs`: packages the Worker and public assets without databases or credentials.
- `tests/`: ledger, restart, concurrency, missing-candle, drawdown, and settlement checks.

This private MVP has no live trading, user-asset custody, wallet connection, or token contract. Publication alone does not confirm public-launch readiness. There is no official Pokémon or Robinhood affiliation.

## Signals, positions, and daily recaps
The strategy room shows saved moving averages, momentum, deviation, and rule conditions, not LLM reasoning. Position details come from the simulation ledger, including entry time, stop reference, and cost breakdown. Daily recaps use saved equity snapshots with days starting at 00:00 UTC+8. Incomplete days show an as-of time, and backfilled trades are counted separately.
