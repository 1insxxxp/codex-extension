const fs = require("node:fs");
const path = require("node:path");

const defaultDbPath = path.join(__dirname, "..", "data", "server.json");
const dbPath = path.resolve(process.env.DB_PATH || defaultDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const initialState = {
  extension_installs: [],
  messages: [],
  message_reads: []
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
      message_reads: Array.isArray(parsed.message_reads) ? parsed.message_reads : []
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

module.exports = {
  upsertInstall,
  touchInstall,
  listInstalls,
  createMessage,
  listAdminMessages,
  listMessagesForInstall,
  markMessageRead,
  deleteMessage
};
