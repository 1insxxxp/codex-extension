const form = document.getElementById("messageForm");
const formStatus = document.getElementById("formStatus");
const installs = document.getElementById("installs");
const messages = document.getElementById("messages");
const refreshAnalytics = document.getElementById("refreshAnalytics");
const refreshInstalls = document.getElementById("refreshInstalls");
const refreshMessages = document.getElementById("refreshMessages");
const target = document.getElementById("target");
const targetValue = document.getElementById("targetValue");
const analyticsFields = {
  updated: document.getElementById("analyticsUpdated"),
  todayPageViews: document.getElementById("todayPageViews"),
  todayVisitors: document.getElementById("todayVisitors"),
  todayClicks: document.getElementById("todayClicks"),
  todayDownloads: document.getElementById("todayDownloads"),
  totalPageViews: document.getElementById("totalPageViews"),
  totalVisitors: document.getElementById("totalVisitors"),
  totalClicks: document.getElementById("totalClicks"),
  totalDownloads: document.getElementById("totalDownloads"),
  dailyStats: document.getElementById("dailyStats")
};

function setStatus(text) {
  formStatus.textContent = text;
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json"
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `请求失败：${response.status}`);
  }

  return payload;
}

function formatTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(time));
}

function createText(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function renderAnalytics(summary) {
  const today = summary.today || {};
  const totals = summary.totals || {};

  setText(analyticsFields.updated, `更新时间 ${formatTime(summary.generated_at)}`);
  setText(analyticsFields.todayPageViews, formatNumber(today.page_view));
  setText(analyticsFields.todayVisitors, formatNumber(today.unique_visitors));
  setText(analyticsFields.todayClicks, formatNumber(today.download_click));
  setText(analyticsFields.todayDownloads, formatNumber(today.download_file));
  setText(analyticsFields.totalPageViews, formatNumber(totals.page_view));
  setText(analyticsFields.totalVisitors, formatNumber(totals.unique_visitors));
  setText(analyticsFields.totalClicks, formatNumber(totals.download_click));
  setText(analyticsFields.totalDownloads, formatNumber(totals.download_file));

  analyticsFields.dailyStats.replaceChildren();
  for (const day of summary.days || []) {
    const row = document.createElement("article");
    row.className = "daily-row";
    row.append(
      createText("span", "", day.date),
      createText("span", "", `访问 ${formatNumber(day.page_view)}`),
      createText("span", "", `访客 ${formatNumber(day.unique_visitors)}`),
      createText("span", "", `点击 ${formatNumber(day.download_click)}`),
      createText("span", "", `下载 ${formatNumber(day.download_file)}`)
    );
    analyticsFields.dailyStats.append(row);
  }
}

function copyText(value) {
  navigator.clipboard.writeText(value).then(() => {
    setStatus("已复制安装 ID。");
  }).catch(() => {
    setStatus("复制失败，请手动复制。");
  });
}

function renderInstalls(items) {
  installs.replaceChildren();

  if (!items.length) {
    installs.append(createText("p", "empty", "暂无安装记录。"));
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "list-item";
    const title = createText("h3", "mono", item.id);
    const meta = createText("p", "muted", `版本 ${item.extension_version || "unknown"} · 最近在线 ${formatTime(item.last_seen_at)} · ${item.locale || "未知语言"}`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary small";
    button.textContent = "复制 ID";
    button.addEventListener("click", () => copyText(item.id));
    row.append(title, meta, button);
    installs.append(row);
  }
}

function renderMessages(items) {
  messages.replaceChildren();

  if (!items.length) {
    messages.append(createText("p", "empty", "暂无消息。"));
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = `list-item level-${item.level}`;
    row.append(
      createText("h3", "", item.title),
      createText("p", "", item.body),
      createText("p", "muted", `${item.target === "all" ? "全部用户" : `安装 ID：${item.target_value}`} · ${item.level} · ${formatTime(item.created_at)}`)
    );

    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.url;
      row.append(link);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary small danger";
    button.textContent = "删除";
    button.addEventListener("click", () => deleteMessage(item.id));
    row.append(button);
    messages.append(row);
  }
}

async function loadInstalls() {
  installs.textContent = "正在加载...";
  const payload = await requestJson("/admin/api/installs");
  renderInstalls(payload.installs || []);
}

async function loadAnalytics() {
  setText(analyticsFields.updated, "正在加载...");
  const payload = await requestJson("/admin/api/analytics");
  renderAnalytics(payload.analytics || {});
}

async function loadMessages() {
  messages.textContent = "正在加载...";
  const payload = await requestJson("/admin/api/messages");
  renderMessages(payload.messages || []);
}

function toIsoFromLocal(value) {
  if (!value) {
    return "";
  }

  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toISOString() : "";
}

async function createMessage(event) {
  event.preventDefault();
  setStatus("正在发送...");

  const data = new FormData(form);
  const payload = {
    title: data.get("title"),
    body: data.get("body"),
    level: data.get("level"),
    target: data.get("target"),
    target_value: data.get("target_value"),
    url: data.get("url"),
    expires_at: toIsoFromLocal(data.get("expires_at"))
  };

  try {
    await requestJson("/admin/api/messages", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    targetValue.disabled = true;
    setStatus("消息已发送。");
    await loadMessages();
  } catch (error) {
    setStatus(error.message || "发送失败。");
  }
}

async function deleteMessage(id) {
  if (!confirm("确定删除这条消息？")) {
    return;
  }

  await requestJson(`/admin/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadMessages();
}

function updateTargetInput() {
  targetValue.disabled = target.value !== "install_id";
  if (targetValue.disabled) {
    targetValue.value = "";
  }
}

form.addEventListener("submit", createMessage);
refreshAnalytics.addEventListener("click", loadAnalytics);
refreshInstalls.addEventListener("click", loadInstalls);
refreshMessages.addEventListener("click", loadMessages);
target.addEventListener("change", updateTargetInput);
updateTargetInput();
loadAnalytics().catch((error) => setText(analyticsFields.updated, error.message));
loadInstalls().catch((error) => installs.textContent = error.message);
loadMessages().catch((error) => messages.textContent = error.message);
