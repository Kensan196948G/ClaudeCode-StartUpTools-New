# Daily Development Status

Shows project progress. Auto-generated from state.json by `scripts/dashboards/render.js`.

## Progress

- Project: {{project_name}}
- Current Phase: {{exec_phase}}
- Current Task: {{exec_summary}}
- Session Progress: {{session_progress_pct}}

---

## Loop Status

- Active Loop: {{exec_phase}}
- Session Start: {{session_start_at}}
- Elapsed: {{elapsed_hm}}
- Remaining: {{remaining_hm}}

---

## CI Status

- Last Build: {{ci_last_result}}
- Retry Count: {{ci_retry_count}} / 15
- Auto Repair: {{ci_auto_repair_state}}

---

## STABLE Tracking

- Consecutive Success: {{stable_consecutive}}
- Required: {{stable_target_n}}
- STABLE Achieved: {{stable_achieved}}
- Last STABLE PR: {{stable_last_pr}}

---

## Agent / Skill Usage (current session)

- Total Agent Calls: {{agent_total_calls}}
- Total Skill Calls: {{skill_total_calls}}
- Top Agent: {{agent_top}}
- Top Skill: {{skill_top}}

---

## Warnings

- Open Warnings: {{warning_count}}
- Latest: {{warning_latest}}

---

## Git

- Branch: {{git_branch}}
- HEAD: {{git_head}}
- Worktree: {{git_dirty}}
