const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

const verbose = config.bEnableVerboseLogs !== false;

function getTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** ASCII-only — fixes broken glyphs in Windows cmd.exe */
function sanitize(text) {
  return String(text).replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function write(label, ...args) {
  const msg = sanitize(
    args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === "object") return JSON.stringify(a);
        return String(a);
      })
      .join(" "),
  );
  const line = `[${getTimestamp()}] [${label}] ${msg}\n`;
  process.stdout.write(line);
}

function backend(...args) {
  write("BACKEND", ...args);
}

function bot(...args) {
  write("BOT", ...args);
}

function xmpp(...args) {
  write("XMPP", ...args);
}

function error(...args) {
  write("ERROR", ...args);
}

function debug(...args) {
  if (config.bEnableDebugLogs || verbose) write("DEBUG", ...args);
}

function connection(...args) {
  if (verbose) write("CONN", ...args);
}

function http(...args) {
  if (verbose || config.bEnableHttpRequestLogs) write("HTTP", ...args);
}

function website(...args) {
  write("WEBSITE", ...args);
}

function AutoRotation(...args) {
  if (config.bEnableAutoRotateDebugLogs) write("SHOP", ...args);
}

function checkforupdate(...args) {
  write("UPDATE", ...args);
}

function autobackendrestart(...args) {
  write("RESTART", ...args);
}

function calderaservice(...args) {
  write("CALDERA", ...args);
}

module.exports = {
  backend,
  bot,
  xmpp,
  error,
  debug,
  connection,
  http,
  website,
  AutoRotation,
  checkforupdate,
  autobackendrestart,
  calderaservice,
};
