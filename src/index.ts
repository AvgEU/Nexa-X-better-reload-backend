import { Hono } from "hono";
import path from "node:path";
import fs from "node:fs";
import { loadRoutes } from "./utils/startup/loadRoutes";
import { Nexa } from "./utils/handlers/errors";
import logger from "./utils/logger/logger";
import { cors } from "hono/cors";
import mongoose from "mongoose";
import express from "express";
import { createServer } from "node:http";

// ── Config ────────────────────────────────────────────────────────────────────
function loadConfig() {
  const p = path.join(process.cwd(), "Config", "config.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const config = loadConfig();

// ── Better-Reload globals ─────────────────────────────────────────────────────
const functions  = require("../structs/functions.js");
const kv         = require("../structs/kv.js");
const log        = require("../structs/log.js");

global.JWT_SECRET     = functions.MakeID();
global.exchangeCodes  = [];
global.parties        = {};
global.Clients        = [];
global.MUCs           = {};
global.kv             = kv;
global.botConnected   = false;
global.accessTokens   = [];
global.refreshTokens  = [];
global.clientTokens   = [];

// Load & clean tokens
(function loadTokens() {
  const jwt = require("jsonwebtoken");
  const tokensPath = path.join(process.cwd(), "tokenManager", "tokens.json");
  const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  for (const type of ["accessTokens","refreshTokens","clientTokens"] as const) {
    for (let i = tokens[type].length - 1; i >= 0; i--) {
      const raw = tokens[type][i].token.replace("eg1~","");
      const decoded: any = jwt.decode(raw);
      if (!decoded?.creation_date || decoded.hours_expire == null) { tokens[type].splice(i,1); continue; }
      const exp = new Date(decoded.creation_date);
      exp.setHours(exp.getHours() + decoded.hours_expire);
      if (exp.getTime() <= Date.now()) tokens[type].splice(i,1);
    }
    (global as any)[type] = tokens[type];
  }
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
})();

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.set("strictQuery", false);
logger.backend(`MongoDB connecting: ${config.mongodb.database}`);
await mongoose.connect(config.mongodb.database);
logger.backend("Connected to MongoDB");

// ── XMPP + Matchmaker ─────────────────────────────────────────────────────────
require("../xmpp/xmpp.js");

// ── Discord Bot ───────────────────────────────────────────────────────────────
if (config.discord?.bUseDiscordBot) {
  require("../DiscordBot/index.js");
}

// ── Better-Reload Express server (internal, port 5354) ────────────────────────
const reloadApp = express();
reloadApp.use(express.json({ limit: "10mb" }));
reloadApp.use(express.urlencoded({ extended: true }));

const reloadPort: number = config.internalRoutesPort ?? 5354;
const routesDir = path.join(process.cwd(), "reload-routes");
for (const file of fs.readdirSync(routesDir)) {
  if (!file.endsWith(".js")) continue;
  try {
    reloadApp.use(require(`../reload-routes/${file}`));
    logger.backend(`Loaded route: ${file}`);
  } catch(e: any) {
    logger.error(`Failed route ${file}: ${e.message}`);
  }
}
for (const file of fs.readdirSync(path.join(process.cwd(), "Api"))) {
  if (!file.endsWith(".js")) continue;
  try {
    reloadApp.use(require(`../Api/${file}`));
  } catch(e: any) {
    logger.error(`Failed API ${file}: ${e.message}`);
  }
}
await new Promise<void>((resolve) => {
  reloadApp.listen(reloadPort, "127.0.0.1", () => {
    logger.backend(`Better-Reload routes on 127.0.0.1:${reloadPort}`);
    resolve();
  });
});

// ── Hono app (Stock Nexa routes + proxy to reload) ───────────────────────────
const app = new Hono({ strict: false });
app.use("*", cors());
app.notFound((c) => c.json(Nexa.basic.notFound, 404));

app.use(async (c, next) => {
  if (c.req.path === "/images/icons/gear.png" || c.req.path === "/favicon.ico") {
    return next();
  }
  await next();
  logger.backend(`${c.req.path} | ${c.req.method} | ${c.res.status}`);
});

// Stock Nexa routes first (discovery, eos, habanero — these override reload)
await loadRoutes(path.join("src", "routes"), app);

// Everything else → proxy to Better-Reload Express
// Stock Nexa routes that should NOT be proxied (already handled above)
const NEXA_ROUTES = new Set([
  "/fortnite/api/calendar/v1/timeline",
  "/fortnite/api/game/v2/matchmakingservice/ticket/player",
  "/fortnite/api/matchmaking/session/findPlayer",
  "/fortnite/api/matchmaking/session",
  "/waitingroom/api/waitingroom",
  "/lightswitch/api/service",
  "/account/api/oauth",
  "/account/api/public/account",
  "/fortnite/api/game/v2/profile",
  "/fortnite/api/cloudstorage",
  "/fortnite/api/storefront",
  "/content/api/pages",
  "/fortnite/api/receipts",
]);

function isNexaRoute(p: string): boolean {
  return NEXA_ROUTES.has(p) || [...NEXA_ROUTES].some(r => p.startsWith(r));
}

app.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (isNexaRoute(p)) return next();

  // Proxy to reload
  const target = `http://127.0.0.1:${reloadPort}${p}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`;
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  const init: RequestInit = { method: c.req.method, headers };
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    init.body = await c.req.arrayBuffer();
  }
  try {
    const res = await fetch(target, init);
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    return next();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port: number = config.port ?? 5353;
logger.backend("========================================");
logger.backend("  Nexa + Better-Reload  |  Port " + port);
logger.backend("========================================");

export default { port, fetch: app.fetch };
