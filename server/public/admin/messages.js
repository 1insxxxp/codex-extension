const form = document.getElementById("messageForm");
const formStatus = document.getElementById("formStatus");
const installs = document.getElementById("installs");
const messages = document.getElementById("messages");
const refreshAnalytics = document.getElementById("refreshAnalytics");
const refreshInstalls = document.getElementById("refreshInstalls");
const refreshMessages = document.getElementById("refreshMessages");
const target = document.getElementById("target");
const targetValue = document.getElementById("targetValue");
const tabButtons = document.querySelectorAll("[data-tab-target]");
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
  dailyStats: document.getElementById("dailyStats"),
  trafficChart: document.getElementById("trafficChart"),
  downloadChart: document.getElementById("downloadChart")
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

function formatDate(value) {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time)) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
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

function activateTab(panelId) {
  for (const button of tabButtons) {
    const active = button.dataset.tabTarget === panelId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }

  for (const panel of document.querySelectorAll(".tab-panel")) {
    const active = panel.id === panelId;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
}

function setTabQuery(panelId) {
  const tabName = panelId === "messagesPanel" ? "messages" : "analytics";
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tabName);
  history.replaceState(null, "", url);
}

function syncTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const panelId = params.get("tab") === "messages" ? "messagesPanel" : "analyticsPanel";
  activateTab(panelId);
}

function selectTab(button) {
  activateTab(button.dataset.tabTarget);
  setTabQuery(button.dataset.tabTarget);
  button.focus();
}

function handleTabKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const buttons = Array.from(tabButtons);
  const currentIndex = buttons.indexOf(event.currentTarget);
  let nextIndex = currentIndex;

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = buttons.length - 1;
  } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % buttons.length;
  } else {
    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  }

  selectTab(buttons[nextIndex]);
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function buildPath(days, key, maxValue, width, height, padding) {
  return days.map((day, index) => {
    const x = padding.left + (days.length === 1 ? 0 : index * (width - padding.left - padding.right) / (days.length - 1));
    const y = height - padding.bottom - (Number(day[key] || 0) / maxValue) * (height - padding.top - padding.bottom);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function renderTrafficChart(days) {
  analyticsFields.trafficChart.replaceChildren();

  if (!days.length) {
    analyticsFields.trafficChart.append(createText("p", "empty", "暂无趋势数据。"));
    return;
  }

  const width = 760;
  const height = 320;
  const padding = { top: 28, right: 24, bottom: 46, left: 48 };
  const series = [
    { key: "page_view", label: "访问", color: "#2563eb" },
    { key: "unique_visitors", label: "访客", color: "#16a34a" },
    { key: "download_click", label: "点击", color: "#d97706" },
    { key: "download_file", label: "下载", color: "#7c3aed" }
  ];
  const maxValue = Math.max(1, ...days.flatMap((day) => series.map((item) => Number(day[item.key] || 0))));
  const svg = createSvgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "近 7 天访问统计折线图" });

  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + step * (height - padding.top - padding.bottom) / 4;
    svg.append(createSvgElement("line", { class: "chart-grid", x1: padding.left, y1: y, x2: width - padding.right, y2: y }));
    const label = createSvgElement("text", { class: "chart-label", x: 8, y: y + 4 });
    label.textContent = Math.round(maxValue - step * maxValue / 4);
    svg.append(label);
  }

  for (const [index, day] of days.entries()) {
    const x = padding.left + (days.length === 1 ? 0 : index * (width - padding.left - padding.right) / (days.length - 1));
    const label = createSvgElement("text", { class: "chart-label", x, y: height - 15, "text-anchor": "middle" });
    label.textContent = formatDate(day.date);
    svg.append(label);
  }

  for (const [index, item] of series.entries()) {
    svg.append(createSvgElement("path", {
      class: "chart-line",
      d: buildPath(days, item.key, maxValue, width, height, padding),
      stroke: item.color
    }));

    for (const [dayIndex, day] of days.entries()) {
      const x = padding.left + (days.length === 1 ? 0 : dayIndex * (width - padding.left - padding.right) / (days.length - 1));
      const y = height - padding.bottom - (Number(day[item.key] || 0) / maxValue) * (height - padding.top - padding.bottom);
      svg.append(createSvgElement("circle", { class: "chart-dot", cx: x, cy: y, r: 4, fill: item.color }));
    }

    const legendX = padding.left + index * 110;
    svg.append(createSvgElement("circle", { cx: legendX, cy: 16, r: 5, fill: item.color }));
    const legend = createSvgElement("text", { class: "chart-legend", x: legendX + 10, y: 20 });
    legend.textContent = item.label;
    svg.append(legend);
  }

  analyticsFields.trafficChart.append(svg);
}

function renderDownloadChart(totals) {
  const values = [
    { label: "访问", value: totals.page_view || 0 },
    { label: "点击", value: totals.download_click || 0 },
    { label: "下载", value: totals.download_file || 0 }
  ];
  const maxValue = Math.max(1, ...values.map((item) => Number(item.value || 0)));

  analyticsFields.downloadChart.replaceChildren();
  for (const item of values) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(4, Number(item.value || 0) / maxValue * 100)}%`;
    track.append(fill);
    row.append(
      createText("span", "", item.label),
      track,
      createText("strong", "", formatNumber(item.value))
    );
    analyticsFields.downloadChart.append(row);
  }
}

function renderDailyTable(days) {
  analyticsFields.dailyStats.replaceChildren();
  if (!days.length) {
    analyticsFields.dailyStats.append(createText("p", "empty", "暂无统计明细。"));
    return;
  }

  const table = document.createElement("table");
  table.className = "table";
  table.innerHTML = "<thead><tr><th>日期</th><th>访问</th><th>访客</th><th>下载点击</th><th>实际下载</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const day of days) {
    const row = document.createElement("tr");
    row.append(
      createText("td", "", day.date),
      createText("td", "", formatNumber(day.page_view)),
      createText("td", "", formatNumber(day.unique_visitors)),
      createText("td", "", formatNumber(day.download_click)),
      createText("td", "", formatNumber(day.download_file))
    );
    tbody.append(row);
  }
  table.append(tbody);
  analyticsFields.dailyStats.append(table);
}

function renderAnalytics(summary) {
  const today = summary.today || {};
  const totals = summary.totals || {};
  const days = summary.days || [];

  setText(analyticsFields.updated, `更新时间 ${formatTime(summary.generated_at)}`);
  setText(analyticsFields.todayPageViews, formatNumber(today.page_view));
  setText(analyticsFields.todayVisitors, formatNumber(today.unique_visitors));
  setText(analyticsFields.todayClicks, formatNumber(today.download_click));
  setText(analyticsFields.todayDownloads, formatNumber(today.download_file));
  setText(analyticsFields.totalPageViews, formatNumber(totals.page_view));
  setText(analyticsFields.totalVisitors, formatNumber(totals.unique_visitors));
  setText(analyticsFields.totalClicks, formatNumber(totals.download_click));
  setText(analyticsFields.totalDownloads, formatNumber(totals.download_file));
  renderTrafficChart(days);
  renderDownloadChart(totals);
  renderDailyTable(days);
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
  installs.textContent = "正在加载…";
  const payload = await requestJson("/admin/api/installs");
  renderInstalls(payload.installs || []);
}

async function loadAnalytics() {
  setText(analyticsFields.updated, "正在加载…");
  const payload = await requestJson("/admin/api/analytics");
  renderAnalytics(payload.analytics || {});
}

async function loadMessages() {
  messages.textContent = "正在加载…";
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
  setStatus("正在发送…");

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

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    activateTab(button.dataset.tabTarget);
    setTabQuery(button.dataset.tabTarget);
  });
  button.addEventListener("keydown", handleTabKeydown);
}
form.addEventListener("submit", createMessage);
refreshAnalytics.addEventListener("click", loadAnalytics);
refreshInstalls.addEventListener("click", loadInstalls);
refreshMessages.addEventListener("click", loadMessages);
target.addEventListener("change", updateTargetInput);
syncTabFromUrl();
updateTargetInput();
loadAnalytics().catch((error) => setText(analyticsFields.updated, error.message));
loadInstalls().catch((error) => installs.textContent = error.message);
loadMessages().catch((error) => messages.textContent = error.message);
