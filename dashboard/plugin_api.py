"""Token Usage Dashboard Plugin — backend API routes.

Mounted at /api/plugins/token-usage/ by the dashboard plugin system.
Provides:
  - /models?days=N          — per-model token usage (enriched)
  - /balance                — provider account balance checks
"""

import os
import time
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query

router = APIRouter()


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
    """Return per-model token usage enriched with actual vs estimated cost."""
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

        total_input = sum(r["input_tokens"] or 0 for r in rows)
        total_output = sum(r["output_tokens"] or 0 for r in rows)
        total_est_cost = sum(r["estimated_cost"] or 0 for r in rows)
        total_act_cost = sum(r["actual_cost"] or 0 for r in rows)

        models = []
        for row in rows:
            input_tok = row["input_tokens"] or 0
            output_tok = row["output_tokens"] or 0
            est = row["estimated_cost"] or 0
            act = row["actual_cost"] or 0

            # Capability metadata
            caps = {}
            try:
                from agent.models_dev import get_model_capabilities

                mc = get_model_capabilities(
                    provider=row.get("billing_provider") or "",
                    model=row["model"],
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
                    "model": row["model"],
                    "provider": row.get("billing_provider") or "",
                    "input_tokens": input_tok,
                    "output_tokens": output_tok,
                    "cache_read_tokens": row["cache_read_tokens"] or 0,
                    "reasoning_tokens": row["reasoning_tokens"] or 0,
                    "estimated_cost": round(est, 6),
                    "actual_cost": round(act, 6),
                    "has_actual_cost": act > 0,
                    "sessions": row["sessions"],
                    "api_calls": row["api_calls"] or 0,
                    "tool_calls": row["tool_calls"] or 0,
                    "last_used_at": row["last_used_at"],
                    "avg_tokens_per_session": round(
                        row["avg_tokens_per_session"] or 0, 1
                    ),
                    "capabilities": caps,
                    "input_pct": round(input_tok / total_input * 100, 1)
                    if total_input
                    else 0,
                    "output_pct": round(output_tok / total_output * 100, 1)
                    if total_output
                    else 0,
                    "cost_pct": round(est / total_est_cost * 100, 1)
                    if total_est_cost
                    else 0,
                }
            )

        return {
            "models": models,
            "totals": {
                "total_input": total_input,
                "total_output": total_output,
                "total_tokens": total_input + total_output,
                "total_cache_read": sum(
                    r["cache_read_tokens"] or 0 for r in rows
                ),
                "total_reasoning": sum(
                    r["reasoning_tokens"] or 0 for r in rows
                ),
                "total_estimated_cost": round(total_est_cost, 6),
                "total_actual_cost": round(total_act_cost, 6),
                "has_actual_cost": total_act_cost > 0,
                "total_sessions": sum(r["sessions"] for r in rows),
                "total_api_calls": sum(r["api_calls"] or 0 for r in rows),
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
        "Cost in /models endpoint is Hermes-estimated from token counts "
        "unless actual_cost > 0 (from provider response headers).",
    }
