// pm2 ecosystem config for ClaudeOS Dashboard
// Usage (Linux):
//   npm install -g pm2
//   pm2 start scripts/dashboards/pm2.config.js
//   pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: "claudeos-dashboard",
      script: "scripts/dashboards/serve-dashboard.js",
      args: "3737",
      cwd: process.cwd(),
      watch: ["scripts/dashboards/serve-dashboard.js"],  // JS変更時のみ再起動
      watch_delay: 1000,
      restart_delay: 5000,        // クラッシュ後5秒で再起動
      max_restarts: 10,
      min_uptime: "10s",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: `${process.env.HOME}/.claudeos/logs/dashboard-err.log`,
      out_file: `${process.env.HOME}/.claudeos/logs/dashboard-out.log`,
      env: {
        NODE_ENV: "production",
        PORT: "3737",
      },
    },
  ],
};
