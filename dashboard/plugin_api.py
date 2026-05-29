"""Token Usage Dashboard Plugin — backend API routes.

Mounted at /api/plugins/token-usage/ by the dashboard plugin system.
Provides:
  - /models?days=N          — per-model token usage (enriched, with realistic cost)
  - /balance                — provider account balance checks
"""

import os
import time
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query

router = APIRouter()


# ---------------------------------------------------------------------------
# Realistic pricing table (per 1M tokens, USD, as of mid-2026)
# Key: (provider, model_prefix) — first match wins when iterating
# ---------------------------------------------------------------------------

PRICING_TABLE: List[Dict[str, Any]] = [
    # DeepSeek
    {"provider": "deepseek", "prefix": "deepseek-reasoner",
     "input": 0.55, "output": 2.19, "cache": 0.14},
    {"provider": "deepseek", "prefix": "deepseek-v4",
     "input": 0.27, "output": 1.10, "cache": 0.07},
    {"provider": "deepseek", "prefix": "deepseek-chat",
     "input": 0.27, "output": 1.10, "cache": 0.07},
    {"provider": "deepseek", "prefix": "deepseek-v3",
     "input": 0.27, "output": 1.10, "cache": 0.07},
    {"provider": "deepseek", "prefix": "deepseek",
     "input": 0.27, "output": 1.10, "cache": 0.07},

    # OpenAI
    {"provider": "openai", "prefix": "gpt-4o-mini",
     "input": 0.15, "output": 0.60, "cache": 0.075},
    {"provider": "openai", "prefix": "gpt-4o",
     "input": 2.50, "output": 10.00, "cache": 1.25},
    {"provider": "openai", "prefix": "gpt-4",
     "input": 3.00, "output": 15.00, "cache": 1.50},
    {"provider": "openai", "prefix": "o3-mini",
     "input": 0.55, "output": 2.20, "cache": 0.275},
    {"provider": "openai", "prefix": "o1",
     "input": 5.00, "output": 40.00, "cache": 2.50},

    # Anthropic
    {"provider": "anthropic", "prefix": "claude-sonnet-4",
     "input": 3.00, "output": 15.00, "cache": 1.50},
    {"provider": "anthropic", "prefix": "claude-opus-4",
     "input": 15.00, "output": 75.00, "cache": 7.50},
    {"provider": "anthropic", "prefix": "claude-haiku-4",
     "input": 0.80, "output": 4.00, "cache": 0.40},
    {"provider": "anthropic", "prefix": "claude",
     "input": 3.00, "output": 15.00, "cache": 1.50},

    # Google
    {"provider": "google", "prefix": "gemini-2.5-pro",
     "input": 1.25, "output": 10.00, "cache": 0.625},
    {"provider": "google", "prefix": "gemini-2.0-flash",
     "input": 0.10, "output": 0.40, "cache": 0.025},
    {"provider": "google", "prefix": "gemini",
     "input": 0.10, "output": 0.40, "cache": 0.025},

    # OpenRouter (generic fallback)
    {"provider": "openrouter", "prefix": "",
     "input": 2.00, "output": 8.00, "cache": 1.00},

    # xAI / Grok
    {"provider": "xai", "prefix": "grok",
     "input": 2.00, "output": 8.00, "cache": 1.00},

    # Custom / local — free
    {"provider": "custom", "prefix": "",
     "input": 0.0, "output": 0.0, "cache": 0.0},
]


def _get_pricing(provider: str, model: str) -> Dict[str, float]:
    """Look up pricing for a model. Returns {input, output, cache} in USD per 1M tokens.
    Falls back to custom-free for unknown providers or local models."""
    provider_lower = (provider or "").lower()
    model_lower = (model or "").lower()

    # "custom" providers are local/free
    if provider_lower in ("custom", "local", "ollama", "llama-cpp", "vllm", ""):
        return {"input": 0.0, "output": 0.0, "cache": 0.0}

    for entry in PRICING_TABLE:
        if entry["provider"] == provider_lower:
            if not entry["prefix"] or model_lower.startswith(entry["prefix"]):
                return {
                    "input": entry["input"],
                    "output": entry["output"],
                    "cache": entry["cache"],
                }

    # Unknown provider — use generic estimated cost from DB only
    return {"input": 0.0, "output": 0.0, "cache": 0.0}


def _compute_plugin_cost(
    input_tok: int, output_tok: int, cache_tok: int, pricing: Dict[str, float]
) -> float:
    """Compute cost from token counts and pricing. Returns USD.
    
    By default, only input and output tokens are priced. Cache tokens
    are informational (many providers do automatic prompt caching that
    is already reflected in the input token count)."""
    cost = 0.0
    cost += (input_tok / 1_000_000) * pricing["input"]
    cost += (output_tok / 1_000_000) * pricing["output"]
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Provider balance checkers
# ---------------------------------------------------------------------------

# Each checker returns a dict:
#   {"provider": str, "available": bool, "balance": str,
#    "currency": str, "error": str|None}
# "available": True if we could reach the API and get a balance figure.
# "available": False if API key is missing.
# "error": non-None if API returned an error or connection failed.
# "balance": None if balance is unknown (pay-as-you-go / postpaid).


def _check_deepseek_balance(api_key: str) -> Dict[str, Any]:
    """DeepSeek: GET /user/balance"""
    import urllib.request
    import json as _json

    if not api_key:
        return {
            "provider": "deepseek",
            "available": False,
            "balance": None,
            "currency": "CNY",
            "error": "No DEEPSEEK_API_KEY configured",
        }

    try:
        req = urllib.request.Request(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read())
        available = data.get("is_available", False)
        infos = data.get("balance_infos", [])
        if infos:
            total = sum(float(b.get("total_balance", 0)) for b in infos)
            used = sum(float(b.get("topped_up_balance", 0)) - float(b.get("total_balance", 0)) for b in infos)
            currency = infos[0].get("currency", "CNY")
            return {
                "provider": "deepseek",
                "available": True,
                "balance": f"{total:.2f}",
                "topped_up": f"{used:.2f}",
                "currency": currency,
                "error": None,
            }
        return {
            "provider": "deepseek",
            "available": available,
            "balance": None,
            "currency": "CNY",
            "error": "No balance info in response",
        }
    except Exception as exc:
        return {
            "provider": "deepseek",
            "available": False,
            "balance": None,
            "currency": "CNY",
            "error": str(exc),
        }


def _check_openrouter_balance(api_key: str) -> Dict[str, Any]:
    """OpenRouter: GET /api/v1/credits"""
    import urllib.request
    import json as _json

    if not api_key:
        return {
            "provider": "openrouter",
            "available": False,
            "balance": None,
            "currency": "USD",
            "error": "No OPENROUTER_API_KEY configured",
        }

    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/credits",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read())
        total = float(data.get("data", {}).get("total_credits", 0))
        used = float(data.get("data", {}).get("total_usage", 0))
        remaining = total - used
        return {
            "provider": "openrouter",
            "available": True,
            "balance": f"{remaining:.2f}" if remaining >= 0 else "0.00",
            "total_credits": f"{total:.2f}",
            "total_usage": f"{used:.2f}",
            "currency": "USD",
            "error": None,
        }
    except Exception as exc:
        return {
            "provider": "openrouter",
            "available": False,
            "balance": None,
            "currency": "USD",
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/models")
async def get_model_usage(days: int = Query(default=30, ge=1, le=365)):
    """Return per-model token usage enriched with accurate cost estimation."""
    from hermes_state import SessionDB

    db = SessionDB()
    try:
        cutoff = time.time() - (days * 86400)

        cur = db._conn.execute(
            """
            SELECT model,
                   billing_provider,
                   SUM(input_tokens) as input_tokens,
                   SUM(output_tokens) as output_tokens,
                   SUM(cache_read_tokens) as cache_read_tokens,
                   SUM(reasoning_tokens) as reasoning_tokens,
                   COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost,
                   COALESCE(SUM(actual_cost_usd), 0) as actual_cost,
                   COUNT(*) as sessions,
                   SUM(COALESCE(api_call_count, 0)) as api_calls,
                   SUM(tool_call_count) as tool_calls,
                   MAX(started_at) as last_used_at,
                   AVG(input_tokens + output_tokens) as avg_tokens_per_session
            FROM sessions WHERE started_at > ? AND model IS NOT NULL AND model != ''
            GROUP BY model, billing_provider
            ORDER BY SUM(input_tokens) + SUM(output_tokens) DESC
            """,
            (cutoff,),
        )
        rows = [dict(r) for r in cur.fetchall()]

        # ---- build model list with enriched data ----
        models = []
        for row in rows:
            provider = row.get("billing_provider") or ""
            model_name = row["model"]

            # Skip ghost entries (zero tokens, no provider)
            input_tok = row["input_tokens"] or 0
            output_tok = row["output_tokens"] or 0
            cache_tok = row["cache_read_tokens"] or 0
            if input_tok == 0 and output_tok == 0 and provider == "":
                continue

            est = row["estimated_cost"] or 0
            act = row["actual_cost"] or 0

            # Compute realistic cost from pricing table
            pricing = _get_pricing(provider, model_name)
            plugin_cost = _compute_plugin_cost(input_tok, output_tok, cache_tok, pricing)
            has_plugin_cost = any(v > 0 for v in pricing.values())

            # Capability metadata
            caps = {}
            try:
                from agent.models_dev import get_model_capabilities

                mc = get_model_capabilities(
                    provider=provider,
                    model=model_name,
                )
                if mc is not None:
                    caps = {
                        "supports_tools": mc.supports_tools,
                        "supports_vision": mc.supports_vision,
                        "supports_reasoning": mc.supports_reasoning,
                        "context_window": mc.context_window,
                        "max_output_tokens": mc.max_output_tokens,
                        "model_family": mc.model_family,
                    }
            except Exception:
                pass

            models.append(
                {
                    "model": model_name,
                    "provider": provider,
                    "input_tokens": input_tok,
                    "output_tokens": output_tok,
                    "total_tokens": input_tok + output_tok,
                    "cache_read_tokens": cache_tok,
                    "reasoning_tokens": row["reasoning_tokens"] or 0,
                    # DB-stored cost (Hermes internal estimate)
                    "estimated_cost": round(est, 6),
                    "actual_cost": round(act, 6),
                    "has_actual_cost": act > 0,
                    # Plugin-computed cost from realistic pricing
                    "plugin_cost": plugin_cost,
                    "has_plugin_cost": has_plugin_cost,
                    # Pricing used for transparency
                    "pricing_input": pricing["input"],
                    "pricing_output": pricing["output"],
                    "sessions": row["sessions"],
                    "api_calls": row["api_calls"] or 0,
                    "tool_calls": row["tool_calls"] or 0,
                    "last_used_at": row["last_used_at"],
                    "avg_tokens_per_session": round(
                        row["avg_tokens_per_session"] or 0, 1
                    ),
                    "capabilities": caps,
                }
            )

        # ---- compute totals ----
        total_input = sum(r["input_tokens"] for r in models)
        total_output = sum(r["output_tokens"] for r in models)
        total_est_cost = sum(r["estimated_cost"] for r in models)
        total_act_cost = sum(r["actual_cost"] for r in models)
        total_plugin_cost = sum(r["plugin_cost"] for r in models)

        # ---- add percentage shares ----
        for m in models:
            m["input_pct"] = (
                round(m["input_tokens"] / total_input * 100, 1) if total_input else 0
            )
            m["output_pct"] = (
                round(m["output_tokens"] / total_output * 100, 1) if total_output else 0
            )
            m["total_pct"] = (
                round(
                    (m["total_tokens"]) / (total_input + total_output) * 100, 1
                )
                if (total_input + total_output) else 0
            )
            m["cost_pct"] = (
                round(m["plugin_cost"] / total_plugin_cost * 100, 1)
                if total_plugin_cost else 0
            )

        return {
            "models": models,
            "totals": {
                "total_input": total_input,
                "total_output": total_output,
                "total_tokens": total_input + total_output,
                "total_cache_read": sum(r["cache_read_tokens"] for r in models),
                "total_reasoning": sum(r["reasoning_tokens"] for r in models),
                # DB-stored costs
                "total_estimated_cost": round(total_est_cost, 6),
                "total_actual_cost": round(total_act_cost, 6),
                "has_actual_cost": total_act_cost > 0,
                # Plugin-computed costs
                "total_plugin_cost": round(total_plugin_cost, 6),
                "has_plugin_cost": total_plugin_cost > 0,
                "total_sessions": sum(r["sessions"] for r in models),
                "total_api_calls": sum(r["api_calls"] for r in models),
                "distinct_models": len(models),
            },
            "period_days": days,
        }
    finally:
        db.close()


@router.get("/balance")
async def get_balances():
    """Check account balances for configured providers.

    Reads API keys from environment variables (as configured in ~/.hermes/.env).
    Returns balance info for all supported providers that have keys configured.

    Supported providers:
      - deepseek   (DEEPSEEK_API_KEY)   → GET /user/balance
      - openrouter (OPENROUTER_API_KEY) → GET /api/v1/credits
    """
    checks = []

    # DeepSeek
    ds_key = os.getenv("DEEPSEEK_API_KEY", "")
    checks.append(_check_deepseek_balance(ds_key))

    # OpenRouter
    or_key = os.getenv("OPENROUTER_API_KEY", "")
    checks.append(_check_openrouter_balance(or_key))

    # Summary — count how many providers we were able to reach
    reachable = sum(1 for c in checks if c["available"])
    configured = sum(
        1
        for c in checks
        if c["error"] is None or "No" not in (c.get("error") or "")
    )

    return {
        "providers": checks,
        "reachable": reachable,
        "total_checked": len(checks),
        "note": "Balance shown is from provider APIs (actual). "
        "Cost in /models endpoint uses realistic pricing tables "
        "(unless actual_cost > 0 from provider response headers).",
    }
