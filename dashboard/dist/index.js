(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  var React = SDK.React;
  var hooks = SDK.hooks;
  var components = SDK.components;
  var fetchJSON = SDK.fetchJSON;
  var cn = SDK.utils.cn;

  var Card = components.Card;
  var CardHeader = components.CardHeader;
  var CardTitle = components.CardTitle;
  var CardContent = components.CardContent;
  var Badge = components.Badge;
  var Button = components.Button;

  // ----- helpers -----
  function fmt(n) {
    if (n == null || isNaN(n)) return "0";
    return Number(n).toLocaleString("en-US");
  }

  function fmtCost(n) {
    if (n == null || isNaN(n)) return "$0.00";
    return "$" + Number(n).toFixed(4);
  }

  function fmtCostShort(n) {
    if (n == null || isNaN(n)) return "$0.00";
    var v = Number(n);
    if (v < 0.01) return "$" + v.toFixed(4);
    return "$" + v.toFixed(2);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return "0%";
    return Number(n).toFixed(1) + "%";
  }

  function fmtDate(ts) {
    if (!ts) return "\u2014";
    var d = new Date(ts * 1000);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ----- balance row -----
  function BalanceRow(props) {
    var b = props.balance;
    var bgColor = b.available
      ? "rgba(34,197,94,0.08)"
      : b.error && b.error.indexOf("No ") === 0
        ? "rgba(255,255,255,0.03)"
        : "rgba(239,68,68,0.06)";
    var dotColor = b.available ? "#22c55e" : b.error && b.error.indexOf("No ") === 0 ? "#666" : "#ef4444";

    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          backgroundColor: bgColor,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          fontSize: 12,
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", {
          style: {
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: dotColor,
            display: "inline-block",
          },
        }),
        React.createElement("span", { style: { color: "#ccc", fontWeight: 500 } }, b.provider),
        b.available && b.balance != null
          ? React.createElement(Badge, { tone: "success", style: { fontSize: 10 } }, "connected")
          : b.error && b.error.indexOf("No ") === 0
            ? React.createElement(Badge, { tone: "outline", style: { fontSize: 10 } }, "not configured")
            : React.createElement(Badge, { tone: "destructive", style: { fontSize: 10 } }, "error")
      ),
      React.createElement(
        "div",
        { style: { textAlign: "right" } },
        b.available && b.balance != null
          ? React.createElement("span", { style: { color: "#e0e0e0", fontWeight: 600 } }, b.balance + " " + b.currency)
          : b.error
            ? React.createElement("span", { style: { color: "#888", fontSize: 11 } }, b.error)
            : React.createElement("span", { style: { color: "#888" } }, "\u2014")
      )
    );
  }

  // ----- summary card -----
  function SummaryCard(props) {
    var sub = props.sub
      ? React.createElement("span", { style: { fontSize: 11, color: "var(--text-tertiary, #888)", marginLeft: 6 } }, props.sub)
      : null;
    return React.createElement(
      Card,
      { className: "flex-1 min-w-[160px]", style: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0 } },
      React.createElement(
        CardHeader,
        { style: { padding: "12px 16px 6px" } },
        React.createElement("span", {
          style: {
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary, #888)",
            fontFamily: "var(--font-mondwest, monospace)",
          },
        }, props.label)
      ),
      React.createElement(
        CardContent,
        { style: { padding: "0 16px 12px" } },
        React.createElement("span", {
          style: { fontSize: 18, fontWeight: 600, color: "var(--foreground, #eee)" },
        }, props.value),
        sub
      )
    );
  }

  // ----- model row (expandable) -----
  function ModelRow(props) {
    var m = props.model;
    var expanded = hooks.useState(false);
    var isOpen = expanded[0];
    var setOpen = expanded[1];

    var rowStyle = {
      display: "flex",
      alignItems: "center",
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      cursor: "pointer",
      fontSize: 13,
    };

    var costDisplay = m.has_actual_cost
      ? fmtCostShort(m.actual_cost)
      : fmtCostShort(m.estimated_cost);
    var costLabel = m.has_actual_cost ? "" : "~";

    return React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        { style: rowStyle, onClick: function () { setOpen(!isOpen); } },
        React.createElement(
          "div",
          { style: { flex: 2, minWidth: 0, display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { fontWeight: 500, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.model),
          m.provider
            ? React.createElement(Badge, { tone: "outline", style: { fontSize: 10 } }, m.provider)
            : null,
          m.has_actual_cost
            ? React.createElement(Badge, { tone: "success", style: { fontSize: 9 } }, "actual")
            : null
        ),
        React.createElement("div", { style: { flex: 1, textAlign: "right", color: "#b0b0b0", paddingRight: 8 } }, fmt(m.input_tokens)),
        React.createElement("div", { style: { flex: 1, textAlign: "right", color: "#b0b0b0", paddingRight: 8 } }, fmt(m.output_tokens)),
        React.createElement("div", { style: { flex: 0.8, textAlign: "right", color: "#999", paddingRight: 8 } }, fmt(m.cache_read_tokens)),
        React.createElement("div", { style: { flex: 0.8, textAlign: "right", paddingRight: 8, color: m.has_actual_cost ? "#4ade80" : "#b0b0b0", fontWeight: m.has_actual_cost ? 600 : 400 } },
          costLabel + costDisplay
        ),
        React.createElement("div", { style: { flex: 0.5, textAlign: "right", color: "#999" } }, fmt(m.sessions)),
        React.createElement("div", { style: { width: 20, textAlign: "center", color: "#666" } }, isOpen ? "\u25BE" : "\u25B8")
      ),
      // bar indicator
      React.createElement("div", {
        style: {
          height: 2,
          width: (m.input_pct || 0) + "%",
          backgroundColor: m.has_actual_cost ? "var(--success, #22c55e)" : "var(--primary, #6366f1)",
          transition: "width 0.3s",
        },
      }),
      isOpen
        ? React.createElement(
            "div",
            { style: { padding: "12px 0 12px 16px", display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "#999" } },
            // cost breakdown (estimated vs actual)
            React.createElement(
              "div",
              { style: { display: "flex", gap: 24, flexWrap: "wrap" } },
              React.createElement("span", null,
                "Estimated: ", React.createElement("strong", { style: { color: "#b0b0b0" } }, fmtCost(m.estimated_cost))
              ),
              React.createElement("span", null,
                "Actual: ", React.createElement("strong", { style: { color: m.has_actual_cost ? "#4ade80" : "#666" } }, m.has_actual_cost ? fmtCost(m.actual_cost) : "N/A (provider doesn't report)")
              )
            ),
            // capability badges
            React.createElement(
              "div",
              { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
              React.createElement("span", { style: { color: "#666", fontSize: 11 } }, "Capabilities:"),
              m.capabilities && m.capabilities.supports_tools
                ? React.createElement(Badge, { tone: "success", style: { fontSize: 10 } }, "tools")
                : null,
              m.capabilities && m.capabilities.supports_vision
                ? React.createElement(Badge, { tone: "success", style: { fontSize: 10 } }, "vision")
                : null,
              m.capabilities && m.capabilities.supports_reasoning
                ? React.createElement(Badge, { tone: "success", style: { fontSize: 10 } }, "reasoning")
                : null,
              m.capabilities && m.capabilities.model_family
                ? React.createElement(Badge, { tone: "secondary", style: { fontSize: 10 } }, m.capabilities.model_family)
                : null,
              m.capabilities && m.capabilities.context_window
                ? React.createElement(Badge, { tone: "secondary", style: { fontSize: 10 } }, fmt(m.capabilities.context_window) + " ctx")
                : null
            ),
            // stats
            React.createElement("div", { style: { display: "flex", gap: 24, flexWrap: "wrap" } },
              React.createElement("span", null, "Reasoning: ", React.createElement("strong", { style: { color: "#ccc" } }, fmt(m.reasoning_tokens))),
              React.createElement("span", null, "Tool calls: ", React.createElement("strong", { style: { color: "#ccc" } }, fmt(m.tool_calls))),
              React.createElement("span", null, "Avg tokens/session: ", React.createElement("strong", { style: { color: "#ccc" } }, fmt(m.avg_tokens_per_session))),
              React.createElement("span", null, "Last used: ", React.createElement("strong", { style: { color: "#ccc" } }, fmtDate(m.last_used_at)))
            ),
            // percentage breakdown
            React.createElement("div", { style: { display: "flex", gap: 24, flexWrap: "wrap", color: "#888", fontSize: 11 } },
              React.createElement("span", null, "Input share: ", fmtPct(m.input_pct)),
              React.createElement("span", null, "Output share: ", fmtPct(m.output_pct)),
              React.createElement("span", null, "Cost share: ", fmtPct(m.cost_pct))
            )
          )
        : null
    );
  }

  // ----- header row -----
  function HeaderRow() {
    var style = {
      display: "flex",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "var(--text-tertiary, #777)",
      fontFamily: "var(--font-mondwest, monospace)",
    };
    return React.createElement(
      "div",
      { style: style },
      React.createElement("div", { style: { flex: 2, minWidth: 0 } }, "Model"),
      React.createElement("div", { style: { flex: 1, textAlign: "right", paddingRight: 8 } }, "Input"),
      React.createElement("div", { style: { flex: 1, textAlign: "right", paddingRight: 8 } }, "Output"),
      React.createElement("div", { style: { flex: 0.8, textAlign: "right", paddingRight: 8 } }, "Cache"),
      React.createElement("div", { style: { flex: 0.8, textAlign: "right", paddingRight: 8 } }, "Cost"),
      React.createElement("div", { style: { flex: 0.5, textAlign: "right" } }, "Sess"),
      React.createElement("div", { style: { width: 20 } })
    );
  }

  // ----- period selector -----
  function PeriodSelector(props) {
    var options = [
      { label: "7d", value: 7 },
      { label: "14d", value: 14 },
      { label: "30d", value: 30 },
      { label: "90d", value: 90 },
    ];

    return React.createElement(
      "div",
      { style: { display: "flex", gap: 4, marginBottom: 16 } },
      options.map(function (opt) {
        var active = props.days === opt.value;
        return React.createElement(Button, {
          key: opt.value,
          size: "sm",
          ghost: !active,
          onClick: function () { props.onChange(opt.value); },
          style: {
            borderRadius: 0,
            fontSize: 12,
            ...(active ? { backgroundColor: "var(--primary, #6366f1)", color: "#fff" } : {}),
          },
        }, opt.label);
      })
    );
  }

  // ----- main component -----
  function TokenUsagePage() {
    var dataState = hooks.useState(null);
    var data = dataState[0];
    var setData = dataState[1];

    var loadingState = hooks.useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var errorState = hooks.useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var daysState = hooks.useState(30);
    var days = daysState[0];
    var setDays = daysState[1];

    // Balance state
    var balanceState = hooks.useState(null);
    var balance = balanceState[0];
    var setBalance = balanceState[1];

    // Fetch model usage
    hooks.useEffect(function () {
      setLoading(true);
      setError(null);
      fetchJSON("/api/plugins/token-usage/models?days=" + days)
        .then(function (res) {
          setData(res);
          setLoading(false);
        })
        .catch(function (err) {
          setError(err.message || "Failed to load");
          setLoading(false);
        });
    }, [days]);

    // Fetch balances (once on mount)
    hooks.useEffect(function () {
      fetchJSON("/api/plugins/token-usage/balance")
        .then(function (res) {
          setBalance(res);
        })
        .catch(function () {
          // silently ignore balance fetch errors
        });
    }, []);

    if (loading) {
      return React.createElement(
        "div",
        { style: { padding: 40, textAlign: "center", color: "#888", fontSize: 14 } },
        "Loading token usage data..."
      );
    }

    if (error) {
      return React.createElement(
        "div",
        { style: { padding: 40, textAlign: "center", color: "#e06060", fontSize: 14 } },
        "Error: " + error
      );
    }

    if (!data || !data.models || data.models.length === 0) {
      return React.createElement(
        "div",
        null,
        React.createElement(PeriodSelector, { days: days, onChange: setDays }),
        React.createElement(
          "div",
          { style: { padding: 40, textAlign: "center", color: "#888", fontSize: 14 } },
          "No token usage data for the selected period."
        )
      );
    }

    var totals = data.totals;
    var models = data.models;
    var totalTokens = (totals.total_input || 0) + (totals.total_output || 0);

    return React.createElement(
      "div",
      { style: { padding: "0 0 24px" } },

      // period selector
      React.createElement(PeriodSelector, { days: days, onChange: setDays }),

      // balance section
      balance && balance.providers && balance.providers.length > 0
        ? React.createElement(
            Card,
            { style: { marginBottom: 24, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0 } },
            React.createElement(
              CardHeader,
              { style: { padding: "10px 16px 6px" } },
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", {
                  style: {
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-tertiary, #888)",
                    fontFamily: "var(--font-mondwest, monospace)",
                  },
                }, "Provider Balances"),
                React.createElement("span", {
                  style: { fontSize: 10, color: "#666" },
                }, "(actual, from provider APIs)")
              )
            ),
            React.createElement(
              CardContent,
              { style: { padding: 0 } },
              balance.providers.map(function (b) {
                return React.createElement(BalanceRow, { key: b.provider, balance: b });
              })
            )
          )
        : null,

      // summary cards
      React.createElement(
        "div",
        { style: { display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" } },
        React.createElement(SummaryCard, { label: "Total Tokens", value: fmt(totalTokens) }),
        React.createElement(SummaryCard, {
          label: "Est. Cost",
          value: fmtCostShort(totals.total_estimated_cost),
          sub: totals.has_actual_cost ? null : "estimated from token count",
        }),
        totals.has_actual_cost
          ? React.createElement(SummaryCard, { label: "Actual Cost", value: fmtCostShort(totals.total_actual_cost) })
          : null,
        React.createElement(SummaryCard, { label: "Sessions", value: fmt(totals.total_sessions) }),
        React.createElement(SummaryCard, { label: "Models Used", value: fmt(totals.distinct_models) })
      ),

      // cost note
      totals.total_estimated_cost > 0
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: 11,
                color: "#666",
                marginBottom: 12,
                fontStyle: "italic",
              },
            },
            totals.has_actual_cost
              ? "Showing both estimated (token-count × pricing) and actual (provider-reported) costs."
              : "Costs are estimated from token counts × published pricing. Actual billing may differ."
          )
        : null,

      // table header
      React.createElement(HeaderRow),

      // model rows
      (function () {
        var totalInput = 0;
        var totalOutput = 0;
        var totalCostAll = 0;
        models.forEach(function (m) {
          totalInput += m.input_tokens || 0;
          totalOutput += m.output_tokens || 0;
          totalCostAll += m.estimated_cost || 0;
        });

        return models.map(function (m) {
          var enriched = Object.assign({}, m, {
            input_pct: totalInput > 0 ? (m.input_tokens || 0) / totalInput * 100 : 0,
            output_pct: totalOutput > 0 ? (m.output_tokens || 0) / totalOutput * 100 : 0,
            cost_pct: totalCostAll > 0 ? (m.estimated_cost || 0) / totalCostAll * 100 : 0,
          });
          return React.createElement(ModelRow, {
            key: m.model + (m.provider || ""),
            model: enriched,
          });
        });
      })()
    );
  }

  // ----- register -----
  window.__HERMES_PLUGINS__.register("token-usage", TokenUsagePage);
})();
