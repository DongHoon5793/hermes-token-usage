# Hermes Token Usage Dashboard Plugin

A dashboard UI plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent) that adds a **Token Usage** tab showing per-model token consumption analytics.

## Features

- **Per-model token breakdown** — input, output, cache read, and reasoning tokens
- **Cost tracking** — estimated cost (token count × published pricing) and actual cost (provider-reported, when available)
- **Provider balance checks** — live balance from DeepSeek (`/user/balance`) and OpenRouter (`/api/v1/credits`)
- **Expandable model rows** — click any model row to see capabilities (tools/vision/reasoning support), tool calls, last used date, and percentage shares
- **Period selector** — 7d / 14d / 30d / 90d time windows
- **Zero build step** — pure JavaScript using the Hermes dashboard SDK, no bundler needed

## Screenshot

*(Add screenshot after installing)*

## Installation

```bash
# Install from GitHub
hermes plugins install DongHoon5793/hermes-token-usage

# Enable it
hermes plugins enable hermes-token-usage

# Restart the gateway
hermes gateway restart
```

Then open your Hermes dashboard → **Token Usage** tab.

## How It Works

- **Frontend**: `dashboard/dist/index.js` — a self-contained React component registered via the Hermes dashboard SDK (`window.__HERMES_PLUGINS__`)
- **Backend**: `dashboard/plugin_api.py` — FastAPI routes mounted at `/api/plugins/token-usage/` providing:
  - `GET /models?days=30` — per-model usage from the session database
  - `GET /balance` — live balance checks for DeepSeek and OpenRouter

All token/cost data comes from the Hermes session database (`~/.hermes/state.db`), which tracks every conversation's input/output tokens and estimated costs automatically.

## Cost Notes

- **Estimated cost** is calculated by Hermes based on token counts × published model pricing
- **Actual cost** is provider-reported (some providers include billing info in API response headers). Most providers do NOT report this, so actual cost will show "N/A" for them
- Balance shown in the Provider Balances card is fetched directly from provider APIs (actual account balance)

## Requirements

- Hermes Agent (any version with dashboard plugin support)
- Gateway running with dashboard enabled
- For balance checks: `DEEPSEEK_API_KEY` and/or `OPENROUTER_API_KEY` in `~/.hermes/.env`

## License

MIT
