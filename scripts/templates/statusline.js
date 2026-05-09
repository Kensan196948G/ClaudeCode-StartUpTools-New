// Claude Code status line script — 2-line output
const { execSync } = require("child_process");
const os = require("os");

const C = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[97m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  r: "\x1b[0m",
};

function getGitBranch(cwd) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "?";
  }
}

function progressBar(pct, width = 8) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  let color = C.green;
  if (pct >= 80) color = C.red;
  else if (pct >= 50) color = C.yellow;
  return color + "▰".repeat(filled) + C.cyan + "▱".repeat(empty) + C.r;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

// Compact reset time: "3pm Asia/Tokyo" (same day) or "1/15 3pm Asia/Tokyo" (different day)
function formatResetCompact(epoch) {
  if (!epoch) return "";
  const dt = new Date(epoch * 1000);
  const now = new Date();
  const tz = "Asia/Tokyo";
  const timeStr = dt
    .toLocaleString("en-US", { hour: "numeric", hour12: true, timeZone: tz })
    .toLowerCase()
    .replace(" ", "");
  const sameDay =
    dt.toLocaleDateString("en-US", { timeZone: tz }) ===
    now.toLocaleDateString("en-US", { timeZone: tz });
  if (sameDay) return `${timeStr} Asia/Tokyo`;
  const m = dt.toLocaleString("en-US", { month: "numeric", timeZone: tz });
  const d = dt.toLocaleString("en-US", { day: "numeric", timeZone: tz });
  return `${m}/${d} ${timeStr} Asia/Tokyo`;
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  if (!raw.trim()) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const model = data.model || {};
  const modelName = (model.display_name || model.id || "?")
    .replace("claude-", "")
    .replace("-20", " ");

  const cwd = data.cwd || "";
  const project = cwd ? require("path").basename(cwd) : "?";
  const branch = getGitBranch(cwd || ".");
  const platform = os.platform() === "win32" ? "win" : os.platform().replace("darwin", "mac");

  const ctx = data.context_window || {};
  const ctxPct = Math.round(ctx.used_percentage || 0);

  const cost = data.cost || {};
  const linesAdded = cost.total_lines_added || 0;
  const linesRemoved = cost.total_lines_removed || 0;
  const durationMs = cost.total_duration_ms || 0;

  const rateLimits = data.rate_limits || {};
  const fiveHour = rateLimits.five_hour || {};
  const sevenDay = rateLimits.seven_day || {};
  const fivePct = fiveHour.used_percentage;
  const sevenPct = sevenDay.used_percentage;

  const sep = `${C.blue} | ${C.r}`;

  // Line 1: model / project / branch / platform / context / file changes / duration
  const line1Parts = [
    `${C.magenta}[${modelName}]${C.r}`,
    `${C.yellow}${project}${C.r}`,
    `${C.green}${branch}${C.r}`,
    `${C.cyan}${platform}${C.r}`,
    `${C.blue}ctx:${C.white}${ctxPct}%${C.r} ${progressBar(ctxPct)}`,
    `${C.green}+${linesAdded}${C.r}/${C.red}-${linesRemoved}${C.r}`,
  ];
  if (durationMs > 0) {
    line1Parts.push(`${C.blue}${formatDuration(durationMs)}${C.r}`);
  }
  process.stdout.write(line1Parts.join(sep) + "\n");

  // Line 2: rate limits (5h / 7d) — omitted entirely if neither is available
  const line2Parts = [];
  if (fivePct != null) {
    const rst = formatResetCompact(fiveHour.resets_at);
    const rstPart = rst ? ` ${C.cyan}rst:${rst}${C.r}` : "";
    line2Parts.push(`${C.blue}5h:${C.white}${Math.round(fivePct)}%${C.r} ${progressBar(fivePct, 8)}${rstPart}`);
  }
  if (sevenPct != null) {
    const rst = formatResetCompact(sevenDay.resets_at);
    const rstPart = rst ? ` ${C.cyan}rst:${rst}${C.r}` : "";
    line2Parts.push(`${C.blue}7d:${C.white}${Math.round(sevenPct)}%${C.r} ${progressBar(sevenPct, 8)}${rstPart}`);
  }
  if (line2Parts.length > 0) {
    process.stdout.write(line2Parts.join(sep) + "\n");
  }
});
