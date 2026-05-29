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

  // ----- balance card (collapsible) -----
  function BalanceCard(props) {
    var providers = props.providers;
    var collapsedState = hooks.useState(function () {
      try { return localStorage.getItem("tu_balance_collapsed") === "1"; }
      catch (e) { return false; }
    });
    var collapsed = collapsedState[0];
    var setCollapsed = collapsedState[1];

    function toggleCollapsed() {
      var next = !collapsed;
      setCollapsed(next);
      try { localStorage.setItem("tu_balance_collapsed", next ? "1" : "0"); }
      catch (e) {}
    }

    return React.createElement(
      Card,
      { style: { marginBottom: 24, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0 } },
      React.createElement(
        CardHeader,
        {
          style: { padding: "10px 16px 6px", cursor: "pointer" },
          onClick: toggleCollapsed
        },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", {
            style: {
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: "monospace",
            },
          }, "Provider Balances"),
          React.createElement("span", {
            style: { fontSize: 10, color: "#666" },
          }, "(actual, from provider APIs)"),
          React.createElement("span", { style: { flex: 1 } }),
          React.createElement("span", {
            style: { fontSize: 12, color: "#666", marginLeft: "auto" },
          }, collapsed ? "\u25B8" : "\u25BE")
        )
      ),
      collapsed ? null : React.createElement(
        CardContent,
        { style: { padding: 0 } },
        providers.map(function (b) {
          return React.createElement(BalanceRow, { key: b.provider, balance: b });
        })
      )
    );
  }

  // ----- summary card -----
  function SummaryCard(props) {
    return React.createElement(
      Card,
      { style: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, minWidth: 130, flex: "1 1 0", minHeight: 70, display: "flex", flexDirection: "column" } },
      React.createElement(
        CardHeader,
        { style: { padding: "10px 14px 4px", flexShrink: 0 } },
        React.createElement("span", {
          style: {
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }, props.label)
      ),
      React.createElement(
        CardContent,
        { style: { padding: "0 14px 10px", flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "flex-end" } },
        React.createElement("span", {
          style: { fontSize: 18, fontWeight: 600, color: "#e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
        }, props.value)
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

    // Use plugin_cost as primary display; fall back to estimated_cost
    var hasPluginCost = m.has_plugin_cost !== false;
    var primaryCost = hasPluginCost ? (m.plugin_cost || 0) : (m.estimated_cost || 0);
    var costLabel = hasPluginCost ? "" : "~";
    var costColor = m.has_actual_cost ? "#4ade80" : hasPluginCost ? "#b0b0b0" : "#999";

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
        React.createElement("div", { style: { flex: 1, textAlign: "right", color: "#e0e0e0", fontWeight: 600, paddingRight: 8 } }, fmt(m.total_tokens)),
        React.createElement("div", { style: { flex: 0.6, textAlign: "right", color: "#999", paddingRight: 8 } }, fmt(m.cache_read_tokens)),
        React.createElement("div", { style: { flex: 0.7, textAlign: "right", paddingRight: 8, color: costColor, fontWeight: m.has_actual_cost ? 600 : 400 } },
          costLabel + fmtCostShort(primaryCost)
        ),
        React.createElement("div", { style: { flex: 0.5, textAlign: "right", color: "#999" } }, fmt(m.sessions)),
        React.createElement("div", { style: { width: 20, textAlign: "center", color: "#666" } }, isOpen ? "\u25BE" : "\u25B8")
      ),
      // bar indicator
      React.createElement("div", {
        style: {
          height: 2,
          width: (m.total_pct || 0) + "%",
          backgroundColor: m.has_actual_cost ? "#22c55e" : "#6366f1",
          transition: "width 0.3s",
        },
      }),
      isOpen
        ? React.createElement(
            "div",
            { style: { padding: "12px 0 12px 16px", display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "#999" } },
            // cost breakdown: plugin (realistic) vs DB-estimated vs actual
            React.createElement(
              "div",
              { style: { display: "flex", gap: 24, flexWrap: "wrap" } },
              React.createElement("span", null,
                "Realistic: ", React.createElement("strong", { style: { color: hasPluginCost ? "#4ade80" : "#666" } },
                  hasPluginCost ? fmtCost(m.plugin_cost) : "N/A"
                )
              ),
              React.createElement("span", null,
                "Hermes DB: ", React.createElement("strong", { style: { color: "#b0b0b0" } }, fmtCost(m.estimated_cost))
              ),
              React.createElement("span", null,
                "Actual: ", React.createElement("strong", { style: { color: m.has_actual_cost ? "#4ade80" : "#666" } }, m.has_actual_cost ? fmtCost(m.actual_cost) : "N/A (provider doesn't report)")
              ),
              m.pricing_input !== undefined
                ? React.createElement("span", { style: { color: "#666", fontSize: 10 } },
                    "Rate: $" + m.pricing_input + "/$" + m.pricing_output + " per 1M tokens")
                : null
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
              React.createElement("span", null, "Total share: ", fmtPct(m.total_pct)),
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
      color: "#888",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontFamily: "monospace",
    };
    return React.createElement(
      "div",
      { style: style },
      React.createElement("div", { style: { flex: 2, minWidth: 0 } }, "Model"),
      React.createElement("div", { style: { flex: 1, textAlign: "right", paddingRight: 8 } }, "Input"),
      React.createElement("div", { style: { flex: 1, textAlign: "right", paddingRight: 8 } }, "Output"),
      React.createElement("div", { style: { flex: 1, textAlign: "right", paddingRight: 8, fontWeight: 600, color: "#ccc" } }, "Total"),
      React.createElement("div", { style: { flex: 0.6, textAlign: "right", paddingRight: 8 } }, "Cache"),
      React.createElement("div", { style: { flex: 0.7, textAlign: "right", paddingRight: 8 } }, "Cost"),
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
            ...(active ? { backgroundColor: "#6366f1", color: "#fff" } : {}),
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
    var totalTokens = totals.total_tokens || ((totals.total_input || 0) + (totals.total_output || 0));

    // Use plugin_cost as primary display cost
    var primaryTotalCost = totals.has_plugin_cost ? (totals.total_plugin_cost || 0) : (totals.total_estimated_cost || 0);
    var hasPrimaryCost = totals.has_plugin_cost || totals.total_estimated_cost > 0;

    return React.createElement(
      "div",
      { style: { padding: "0 0 24px" } },

      // period selector
      React.createElement(PeriodSelector, { days: days, onChange: setDays }),

      // balance section (collapsible)
      balance && balance.providers && balance.providers.length > 0
        ? React.createElement(BalanceCard, { providers: balance.providers })
        : null,

      // summary cards
      React.createElement(
        "div",
        { style: { display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" } },
        React.createElement(SummaryCard, { label: "Total Tokens", value: fmt(totalTokens) }),
        React.createElement(SummaryCard, {
          label: "Realistic Cost",
          value: fmtCostShort(primaryTotalCost),
        }),
        totals.has_actual_cost
          ? React.createElement(SummaryCard, { label: "Actual Cost", value: fmtCostShort(totals.total_actual_cost) })
          : null,
        React.createElement(SummaryCard, { label: "Sessions", value: fmt(totals.total_sessions) }),
        React.createElement(SummaryCard, { label: "Models Used", value: fmt(totals.distinct_models) })
      ),

      // cost note
      totals.has_plugin_cost
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
              ? "Showing realistic (pricing-table) and actual (provider-reported) costs."
              : "Cost from real-world pricing table. Actual billing may differ."
          )
        : null,

      // table header
      React.createElement(HeaderRow),

      // model rows
      (function () {
        var totalTokensAll = 0;
        var totalCostAll = 0;
        models.forEach(function (m) {
          totalTokensAll += (m.total_tokens || m.input_tokens || 0) + (m.output_tokens || 0);
          if (m.has_plugin_cost) {
            totalCostAll += m.plugin_cost || 0;
          } else {
            totalCostAll += m.estimated_cost || 0;
          }
        });

        return models.map(function (m) {
          var thisTotal = m.total_tokens || ((m.input_tokens || 0) + (m.output_tokens || 0));
          var thisCost = m.has_plugin_cost ? (m.plugin_cost || 0) : (m.estimated_cost || 0);
          var enriched = Object.assign({}, m, {
            total_pct: totalTokensAll > 0 ? thisTotal / totalTokensAll * 100 : 0,
            cost_pct: totalCostAll > 0 ? thisCost / totalCostAll * 100 : 0,
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
