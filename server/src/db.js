const fs = require("node:fs");
const path = require("node:path");

const defaultDbPath = path.join(__dirname, "..", "data", "server.json");
const dbPath = path.resolve(process.env.DB_PATH || defaultDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const initialState = {
  extension_installs: [],
  messages: [],
  message_reads: [],
  analytics_events: []
};

function readState() {
  if (!fs.existsSync(dbPath)) {
    return structuredClone(initialState);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return {
      extension_installs: Array.isArray(parsed.extension_installs) ? parsed.extension_installs : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      message_reads: Array.isArray(parsed.message_reads) ? parsed.message_reads : [],
      analytics_events: Array.isArray(parsed.analytics_events) ? parsed.analytics_events : []
    };
  } catch {
    return structuredClone(initialState);
  }
}

function writeState(state) {
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  fs.renameSync(tempPath, dbPath);
}

function update(mutator) {
  const state = readState();
  const result = mutator(state);
  writeState(state);
  return result;
}

function upsertInstall(install) {
  return update((state) => {
    const existing = state.extension_installs.find((item) => item.id === install.id);
    if (existing) {
      Object.assign(existing, {
        last_seen_at: install.last_seen_at,
        extension_version: install.extension_version,
        locale: install.locale,
        user_agent: install.user_agent
      });
      return existing;
    }

    const record = { ...install, disabled: 0 };
    state.extension_installs.push(record);
    return record;
  });
}

function touchInstall(installId, lastSeenAt) {
  update((state) => {
    const existing = state.extension_installs.find((item) => item.id === installId);
    if (existing) {
      existing.last_seen_at = lastSeenAt;
    }
  });
}

function listInstalls() {
  return readState().extension_installs
    .slice()
    .sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
    .slice(0, 500)
    .map(({ user_agent, ...item }) => item);
}

function createMessage(message) {
  update((state) => {
    state.messages.push(message);
  });
  return message;
}

function listAdminMessages() {
  return readState().messages
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 200);
}

function listMessagesForInstall(installId, now) {
  const state = readState();
  return state.messages
    .filter((message) => {
      const active = !message.expires_at || message.expires_at > now;
      const targeted = message.target === "all" || (message.target === "install_id" && message.target_value === installId);
      return active && targeted;
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50)
    .map((message) => {
      const read = state.message_reads.find((item) => item.message_id === message.id && item.install_id === installId);
      return { ...message, read_at: read?.read_at || "" };
    });
}

function markMessageRead(messageId, installId, readAt) {
  return update((state) => {
    const existing = state.message_reads.find((item) => item.message_id === messageId && item.install_id === installId);
    if (existing) {
      existing.read_at = readAt;
      return existing;
    }

    const record = { message_id: messageId, install_id: installId, read_at: readAt };
    state.message_reads.push(record);
    return record;
  });
}

function deleteMessage(messageId) {
  return update((state) => {
    const before = state.messages.length;
    state.messages = state.messages.filter((message) => message.id !== messageId);
    state.message_reads = state.message_reads.filter((read) => read.message_id !== messageId);
    return before - state.messages.length;
  });
}

function dateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function createEmptyAnalyticsDay(date) {
  return {
    date,
    page_view: 0,
    download_click: 0,
    download_file: 0,
    unique_visitors: 0
  };
}

function recordAnalyticsEvent(event) {
  const record = {
    type: event.type,
    path: event.path || "",
    visitor_hash: event.visitor_hash || "",
    occurred_at: event.occurred_at || new Date().toISOString()
  };

  return update((state) => {
    state.analytics_events.push(record);
    if (state.analytics_events.length > 50000) {
      state.analytics_events = state.analytics_events.slice(-50000);
    }
    return record;
  });
}

function getAnalyticsSummary(now = new Date().toISOString()) {
  const state = readState();
  const todayKey = dateKey(now);
  const totals = {
    page_view: 0,
    download_click: 0,
    download_file: 0,
    unique_visitors: 0
  };
  const totalVisitors = new Set();
  const days = [];
  const dayMap = new Map();
  const dayVisitors = new Map();
  const baseTime = new Date(`${todayKey}T00:00:00.000Z`).getTime();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = new Date(baseTime - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day = createEmptyAnalyticsDay(key);
    days.push(day);
    dayMap.set(key, day);
    dayVisitors.set(key, new Set());
  }

  for (const event of state.analytics_events) {
    if (event.type === "page_view" || event.type === "download_click" || event.type === "download_file") {
      totals[event.type] += 1;
    }

    if (event.visitor_hash) {
      totalVisitors.add(event.visitor_hash);
    }

    const key = dateKey(event.occurred_at);
    const day = dayMap.get(key);
    if (!day) {
      continue;
    }

    if (event.type === "page_view" || event.type === "download_click" || event.type === "download_file") {
      day[event.type] += 1;
    }

    if (event.visitor_hash) {
      dayVisitors.get(key).add(event.visitor_hash);
    }
  }

  totals.unique_visitors = totalVisitors.size;
  for (const day of days) {
    day.unique_visitors = dayVisitors.get(day.date).size;
  }

  return {
    generated_at: now,
    totals,
    today: dayMap.get(todayKey) || createEmptyAnalyticsDay(todayKey),
    days
  };
}

module.exports = {
  upsertInstall,
  touchInstall,
  listInstalls,
  createMessage,
  listAdminMessages,
  listMessagesForInstall,
  markMessageRead,
  deleteMessage,
  recordAnalyticsEvent,
  getAnalyticsSummary
};
