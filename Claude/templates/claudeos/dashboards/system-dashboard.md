# ClaudeOS System Dashboard

Auto-generated from state.json by `scripts/dashboards/render.js`.

## 🧭 Global Status

- Mode: Auto
- Project: {{project_name}}
- Phase: {{exec_phase}}
- Goal: {{goal_title}}

---

## ⏱ Time Control

- Start Time: {{session_start_at}}
- Elapsed: {{elapsed_hm}}
- Remaining: {{remaining_hm}}
- Limit: 5h
- Time Status: {{time_status}}

---

## 🔁 Loop Status

- Current Loop: {{exec_phase}}
- Loop Progress: {{session_progress_pct}}

---

## ✅ STABLE Status

- Consecutive Success: {{stable_consecutive}}
- Required: {{stable_target_n}}
- STABLE: {{stable_achieved}}
- Reason: {{stable_target_n_reason}}

---

## ⚙ CI Status

- Last Result: {{ci_last_result}}
- Retry Count: {{ci_retry_count}} / 15
- Auto Repair: {{ci_auto_repair_state}}

---

## 🚨 Risk Status

- Warning Risk: {{risk_warnings}}
- CI Risk: {{risk_ci}}
- Security Risk: {{risk_security}}

---

## 👥 Agent Status (call counts this session)

- CTO: {{agent_cto_calls}}
- Architect: {{agent_architect_calls}}
- Developer: {{agent_developer_calls}}
- QA: {{agent_qa_calls}}
- Security: {{agent_security_calls}}
- DevOps: {{agent_devops_calls}}
- Reviewer: {{agent_reviewer_calls}}

---

## 📊 Project Status

- Phase Mode: {{project_phase_mode}}
- Cron Enabled: {{project_cron_enabled}}
- Release Deadline: {{project_release_deadline}}
- Open Warnings: {{warning_count}}

---

## 🛑 Stop Conditions

- 5h Reached: {{stop_5h}}
- STABLE Achieved: {{stable_achieved}}
- Token Status: {{token_status}}

---

## 🎯 Next Action

{{next_action}}
