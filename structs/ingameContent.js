const fs = require("fs");
const path = require("path");

let cached = null;

function loadIngameConfig() {
  if (cached) return cached;
  const file = path.join(__dirname, "..", "Config", "ingame.json");
  if (!fs.existsSync(file)) {
    cached = {};
    return cached;
  }
  cached = JSON.parse(fs.readFileSync(file, "utf8"));
  return cached;
}

function setMotd(contentpages, cfg) {
  if (!cfg.news) return;
  const n = cfg.news;
  try {
    const motds = contentpages.battleroyalenewsv2?.news?.motds;
    if (motds?.[0]) {
      if (n.title) motds[0].title = n.title;
      if (n.body) motds[0].body = n.body;
      if (n.motdTabTitle) motds[0].tabTitleOverride = n.motdTabTitle;
      if (n.imageUrl) {
        motds[0].image = n.imageUrl;
        motds[0].tileImage = n.imageUrl;
      }
      if (cfg.discordUrl) motds[0].websiteURL = cfg.discordUrl;
      if (n.websiteButtonText) motds[0].websiteButtonText = n.websiteButtonText;
    }
  } catch {}

  try {
    const msgs = contentpages.emergencynotice?.news?.messages;
    if (msgs?.[0] && cfg.emergencyNotice) {
      if (cfg.emergencyNotice.title) msgs[0].title = cfg.emergencyNotice.title;
      if (cfg.emergencyNotice.body) msgs[0].body = cfg.emergencyNotice.body;
    }
  } catch {}

  try {
    const msgs2 = contentpages.emergencynoticev2?.emergencynotices?.emergencynotices;
    if (msgs2?.[0] && cfg.emergencyNotice) {
      if (cfg.emergencyNotice.title) msgs2[0].title = cfg.emergencyNotice.title;
      if (cfg.emergencyNotice.body) msgs2[0].body = cfg.emergencyNotice.body;
    }
  } catch {}
}

function setModeSelect(contentpages, cfg) {
  if (!cfg.modeSelect) return;
  const m = cfg.modeSelect;
  try {
    const br = contentpages.subgameselectdata?.battleRoyale?.message;
    if (br) {
      if (m.battleRoyaleTitle) br.title = m.battleRoyaleTitle;
      if (m.battleRoyaleBody) br.body = m.battleRoyaleBody;
    }
    const cr = contentpages.subgameselectdata?.creative?.message;
    if (cr) {
      if (m.creativeTitle) cr.title = m.creativeTitle;
      if (m.creativeBody) cr.body = m.creativeBody;
    }
  } catch {}
}

function applyMotdTarget(motdTarget, cfg) {
  if (!cfg.motdTarget) return motdTarget;
  try {
    for (const item of motdTarget.contentItems || []) {
      const fields = item.contentFields || {};
      if (cfg.motdTarget.title && fields.title) {
        if (typeof fields.title === "object") {
          Object.keys(fields.title).forEach((lang) => {
            fields.title[lang] = cfg.motdTarget.title;
          });
        } else fields.title = cfg.motdTarget.title;
      }
      if (cfg.motdTarget.body && fields.body) {
        if (typeof fields.body === "object") {
          Object.keys(fields.body).forEach((lang) => {
            fields.body[lang] = cfg.motdTarget.body;
          });
        } else fields.body = cfg.motdTarget.body;
      }
    }
  } catch {}
  return motdTarget;
}

function applyIngameOverrides(contentpages) {
  const cfg = loadIngameConfig();
  if (!cfg || Object.keys(cfg).length === 0) return contentpages;
  setMotd(contentpages, cfg);
  setModeSelect(contentpages, cfg);
  return contentpages;
}

module.exports = {
  loadIngameConfig,
  applyIngameOverrides,
  applyMotdTarget,
};
