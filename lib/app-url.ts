// The base URL this app is reachable at — used to build clickable links in
// outbound emails (e.g. the "open the Business Support dashboard" link in
// agent assignment notifications). Defaults to localhost for local dev;
// set APP_BASE_URL in production (e.g. https://vendor-assistant-bot.veltriance.com).
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
