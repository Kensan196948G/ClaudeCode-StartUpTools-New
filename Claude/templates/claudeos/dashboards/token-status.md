# Token Usage Dashboard

Auto-generated from state.json by `scripts/dashboards/render.js`.

## Current Usage

- Session Tokens Used: {{token_session_used}}
- Session Tokens Remaining: {{token_session_remaining}}
- Session Usage %: {{token_session_pct}}

---

## Threshold

- Safe Zone: < 70%
- Warning: 70-90%
- Critical: > 90%
- Current Status: {{token_status}}

---

## Forecast

- Estimated Remaining Time: {{remaining_hm}}
- Expected End Time: {{session_end_planned}}

---

## Control

- Token Budget Mode: {{token_budget_mode}}
- Auto-Compact Threshold: {{token_autocompact_pct}}

---

## Action

- Normal: Continue Improvement Loop
- Warning: Stop Improvement / Verify Priority
- Critical: Safe Shutdown
- Current Recommended: {{token_recommendation}}
