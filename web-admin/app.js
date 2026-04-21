const page = document.body.dataset.page || "overview";

const state = {
  selectedAccountId: "binance-main",
  logFilter: "ALL",
  accounts: [],
  market: null,
  signal: null,
  logs: [
    { level: "INFO", time: "09:00:12", message: "后台系统已启动，当前为本地实时演示模式" },
    { level: "INFO", time: "09:01:30", message: "各菜单已拆分为独立页面" },
  ],
  interventions: [
    { time: "09:00:00", title: "系统初始化", detail: "后台系统载入完成，当前未执行任何真实交易请求。" },
  ],
};

function byId(id) {
  return document.getElementById(id);
}

const refs = {
  heroStats: byId("heroStats"),
  streamStatus: byId("streamStatus"),
  marketSummary: byId("marketSummary"),
  klineList: byId("klineList"),
  depthBook: byId("depthBook"),
  tradeList: byId("tradeList"),
  cacheBar: byId("cacheBar"),
  signalCard: byId("signalCard"),
  indicatorGrid: byId("indicatorGrid"),
  accountSelect: byId("accountSelect"),
  accountCard: byId("accountCard"),
  balanceList: byId("balanceList"),
  orderList: byId("orderList"),
  credentialsForm: byId("credentialsForm"),
  credentialsHint: byId("credentialsHint"),
  strategyList: byId("strategyList"),
  riskForm: byId("riskForm"),
  logFilter: byId("logFilter"),
  logList: byId("logList"),
  interventionTimeline: byId("interventionTimeline"),
  toast: byId("toast"),
};

function maskSecret(value) {
  if (!value) {
    return "未设置";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-1)}`;
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function fmtNumber(value, digits = 2) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function has(ref) {
  return Boolean(ref);
}

function pushLog(level, message) {
  state.logs.unshift({
    level,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    message,
  });
  renderLogs();
  renderHero();
}

function showToast(message) {
  if (!has(refs.toast)) {
    return;
  }
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => refs.toast.classList.remove("show"), 2200);
}

function addIntervention(title, detail) {
  const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  state.interventions.push({ time: now, title, detail });
  renderInterventions();
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(error.error || "请求失败");
  }

  return response.json();
}

async function loadAccounts() {
  const payload = await requestJson("/api/accounts");
  state.accounts = payload.accounts.map((account) => ({
    ...account,
    credentials: {
      ...account.credentials,
      maskedKey: maskSecret(account.credentials?.apiKey),
      maskedSecret: maskSecret(account.credentials?.apiSecret),
      maskedPassphrase: maskSecret(account.credentials?.passphrase),
    },
  }));

  if (!state.accounts.some((account) => account.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0]?.id || "";
  }
}

async function loadMarketSnapshot() {
  const payload = await requestJson("/api/market/state");
  state.market = payload.market;
  state.signal = payload.signal;
}

function connectMarketStream() {
  if (page !== "market" && page !== "signal" && page !== "overview") {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/market`);

  socket.addEventListener("open", () => {
    if (has(refs.streamStatus)) {
      refs.streamStatus.textContent = "WebSocket 已连接";
      refs.streamStatus.className = "live-chip live";
    }
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    state.market = payload.market;
    state.signal = payload.signal;
    renderMarketData();
    renderSignal();
    renderHero();
  });

  socket.addEventListener("close", () => {
    if (has(refs.streamStatus)) {
      refs.streamStatus.textContent = "实时通道已断开，正在重连";
      refs.streamStatus.className = "live-chip warn";
    }
    window.setTimeout(connectMarketStream, 1500);
  });
}

function getCurrentAccount() {
  return state.accounts.find((account) => account.id === state.selectedAccountId) || state.accounts[0];
}

function renderHero() {
  if (!has(refs.heroStats)) {
    return;
  }

  const account = getCurrentAccount();
  const totalAccounts = state.accounts.length;
  const configuredCount = state.accounts.filter((item) => item.credentials && item.credentials.apiKey).length;
  const activeStrategies = account ? account.strategies.filter((item) => item.enabled).length : 0;
  const action = state.signal?.action || "HOLD";

  refs.heroStats.innerHTML = [
    { label: "已接入账户", value: totalAccounts },
    { label: "已配置密钥", value: configuredCount },
    { label: "启用策略", value: activeStrategies },
    { label: "当前信号", value: action },
  ]
    .map(
      (item) => `
        <div class="hero-stat">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderMarketData() {
  if (!state.market || !has(refs.marketSummary)) {
    return;
  }

  const summary = [
    { label: "交易对", value: state.market.symbol },
    { label: "最新价", value: fmtNumber(state.market.lastPrice, 2) },
    { label: "24h 变动", value: `${state.market.change24h >= 0 ? "+" : ""}${fmtNumber(state.market.change24h, 2)}%` },
    { label: "成交量", value: fmtNumber(state.market.volume24h, 2) },
  ];

  refs.marketSummary.innerHTML = summary
    .map(
      (item) => `
        <div class="hero-stat">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");

  if (has(refs.klineList)) {
    refs.klineList.innerHTML = state.market.klines
      .slice(-8)
      .reverse()
      .map(
        (kline) => `
          <div class="kline-item">
            <div>
              <strong>${kline.timeLabel}</strong>
              <p>O ${fmtNumber(kline.open)} · C ${fmtNumber(kline.close)}</p>
            </div>
            <span class="${kline.close >= kline.open ? "up" : "down"}">
              ${kline.close >= kline.open ? "+" : ""}${fmtNumber(kline.close - kline.open)}
            </span>
          </div>
        `
      )
      .join("");
  }

  if (has(refs.depthBook)) {
    refs.depthBook.innerHTML = `
      <div class="depth-column">
        <strong>卖盘</strong>
        ${state.market.depth.asks
          .map(
            (row) => `
              <div class="depth-row ask">
                <span>${fmtNumber(row.price)}</span>
                <span>${fmtNumber(row.size, 4)}</span>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="depth-column">
        <strong>买盘</strong>
        ${state.market.depth.bids
          .map(
            (row) => `
              <div class="depth-row bid">
                <span>${fmtNumber(row.price)}</span>
                <span>${fmtNumber(row.size, 4)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  if (has(refs.tradeList)) {
    refs.tradeList.innerHTML = state.market.trades
      .slice(0, 8)
      .map(
        (trade) => `
          <div class="trade-item">
            <div>
              <strong>${trade.side}</strong>
              <p>${trade.time}</p>
            </div>
            <div class="trade-values">
              <span>${fmtNumber(trade.price)}</span>
              <span>${fmtNumber(trade.size, 4)}</span>
            </div>
          </div>
        `
      )
      .join("");
  }

  if (has(refs.cacheBar)) {
    refs.cacheBar.innerHTML = `
      <span>Redis 缓存状态：${state.market.cache.status}</span>
      <span>最近同步：${state.market.cache.updatedAt}</span>
      <span>缓存键：${state.market.cache.key}</span>
    `;
  }
}

function renderSignal() {
  if (!state.signal || !has(refs.signalCard)) {
    return;
  }

  refs.signalCard.innerHTML = `
    <span class="status-pill ${state.signal.action === "SELL" ? "error" : state.signal.action === "HOLD" ? "warn" : ""}">
      ${state.signal.action}
    </span>
    <h4>${state.signal.title}</h4>
    <p>${state.signal.reason}</p>
    <p>confidence ${state.signal.confidence}</p>
  `;

  if (has(refs.indicatorGrid)) {
    refs.indicatorGrid.innerHTML = [
      { label: "VWAP", value: fmtNumber(state.signal.indicators.vwap) },
      { label: "RSI", value: fmtNumber(state.signal.indicators.rsi) },
      { label: "MACD", value: fmtNumber(state.signal.indicators.macd, 4) },
      { label: "Signal", value: fmtNumber(state.signal.indicators.macdSignal, 4) },
    ]
      .map(
        (item) => `
          <div class="indicator-item">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `
      )
      .join("");
  }
}

function renderAccountSelect() {
  if (!has(refs.accountSelect)) {
    return;
  }

  refs.accountSelect.innerHTML = state.accounts
    .map(
      (account) => `
        <option value="${account.id}" ${account.id === state.selectedAccountId ? "selected" : ""}>
          ${account.exchange} · ${account.name}
        </option>
      `
    )
    .join("");
}

function renderAccountDetails() {
  if (!has(refs.accountCard)) {
    return;
  }

  const account = getCurrentAccount();
  if (!account) {
    return;
  }

  refs.accountCard.innerHTML = `
    <div class="section-head">
      <div>
        <h4>${account.name}</h4>
        <p>${account.exchange} / ${account.owner}</p>
      </div>
      <span class="badge">${account.health}</span>
    </div>
    <p>API Key: ${account.credentials?.maskedKey || "未设置"}</p>
    <p>Secret: ${account.credentials?.maskedSecret || "未设置"}</p>
    <p>Passphrase: ${account.credentials?.maskedPassphrase || "未设置"}</p>
    <p>备注: ${account.credentials?.note || "无"}</p>
  `;

  if (has(refs.balanceList)) {
    refs.balanceList.innerHTML = account.balances
      .map(
        (balance) => `
          <div class="metric-item">
            <div>
              <strong>${balance.asset}</strong>
              <p>可用 ${balance.available}</p>
            </div>
            <span>${balance.total}</span>
          </div>
        `
      )
      .join("");
  }

  if (has(refs.orderList)) {
    refs.orderList.innerHTML = account.orders
      .map(
        (order) => `
          <div class="order-item">
            <div>
              <strong>${order.symbol}</strong>
              <p>${order.side} · ${order.type}</p>
            </div>
            <span class="status-pill ${statusClass(order.status)}">${order.status}</span>
          </div>
        `
      )
      .join("");
  }
}

function renderCredentialForm() {
  if (!has(refs.credentialsForm)) {
    return;
  }

  const account = getCurrentAccount();
  if (!account) {
    return;
  }

  refs.credentialsForm.elements.name.value = account.name || "";
  refs.credentialsForm.elements.owner.value = account.owner || "";
  refs.credentialsForm.elements.exchange.value = account.exchange || "Binance";
  refs.credentialsForm.elements.health.value = account.health || "";
  refs.credentialsForm.elements.apiKey.value = account.credentials?.apiKey || "";
  refs.credentialsForm.elements.apiSecret.value = account.credentials?.apiSecret || "";
  refs.credentialsForm.elements.passphrase.value = account.credentials?.passphrase || "";
  refs.credentialsForm.elements.note.value = account.credentials?.note || "";

  if (has(refs.credentialsHint)) {
    refs.credentialsHint.textContent = account.credentials?.updatedAt
      ? `最近保存时间：${account.credentials.updatedAt}`
      : "尚未保存真实 API 密钥。填写后会保存在本地配置文件中。";
  }
}

function renderStrategies() {
  if (!has(refs.strategyList)) {
    return;
  }

  const account = getCurrentAccount();
  refs.strategyList.innerHTML = account.strategies
    .map(
      (strategy) => `
        <div class="strategy-item">
          <div class="strategy-meta">
            <strong>${strategy.name}</strong>
            <p>模式 ${strategy.mode} · confidence ${strategy.confidence}</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-strategy-id="${strategy.id}" ${strategy.enabled ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>
      `
    )
    .join("");
}

function renderRiskForm() {
  if (!has(refs.riskForm)) {
    return;
  }

  const account = getCurrentAccount();
  Object.entries(account.risk).forEach(([key, value]) => {
    refs.riskForm.elements[key].value = value;
  });
}

function renderLogs() {
  if (!has(refs.logList)) {
    return;
  }

  const logs = state.logFilter === "ALL" ? state.logs : state.logs.filter((item) => item.level === state.logFilter);
  refs.logList.innerHTML = logs
    .map(
      (log) => `
        <div class="log-item">
          <div>
            <strong>${log.time} · ${log.level}</strong>
            <p>${log.message}</p>
          </div>
          <span class="status-pill ${statusClass(log.level)}">${log.level}</span>
        </div>
      `
    )
    .join("");
}

function renderInterventions() {
  if (!has(refs.interventionTimeline)) {
    return;
  }

  refs.interventionTimeline.innerHTML = state.interventions
    .slice()
    .reverse()
    .map(
      (item) => `
        <div class="timeline-item">
          <div>
            <strong>${item.title}</strong>
            <p>${item.detail}</p>
          </div>
          <span>${item.time}</span>
        </div>
      `
    )
    .join("");
}

function statusClass(status) {
  if (status === "ERROR" || status === "SELL" || status === "OPEN") {
    return "error";
  }
  if (status === "WARN" || status === "PARTIAL" || status === "PENDING" || status === "HOLD") {
    return "warn";
  }
  return "";
}

function attachEvents() {
  if (has(refs.accountSelect)) {
    refs.accountSelect.addEventListener("change", (event) => {
      state.selectedAccountId = event.target.value;
      renderAll();
      showToast("账户已切换");
    });
  }

  if (has(refs.credentialsForm)) {
    refs.credentialsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const account = getCurrentAccount();
      const formData = new FormData(refs.credentialsForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        await requestJson(`/api/accounts/${account.id}/credentials`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        await loadAccounts();
        renderAll();
        pushLog("INFO", `${payload.exchange} 账户 ${payload.name} 的 API 配置已保存`);
        showToast("密钥配置已保存");
      } catch (error) {
        pushLog("ERROR", `保存 API 配置失败：${error.message}`);
        showToast(error.message);
      }
    });
  }

  if (has(refs.strategyList)) {
    refs.strategyList.addEventListener("change", (event) => {
      if (!event.target.matches("input[type='checkbox']")) {
        return;
      }

      const account = getCurrentAccount();
      const strategy = account.strategies.find((item) => item.id === event.target.dataset.strategyId);
      strategy.enabled = event.target.checked;
      const actionText = strategy.enabled ? "启用" : "停用";
      pushLog("INFO", `${account.name} ${actionText}策略 ${strategy.name}`);
      showToast(`已${actionText}${strategy.name}`);
    });
  }

  if (has(refs.riskForm)) {
    refs.riskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(refs.riskForm);
      const risk = getCurrentAccount().risk;

      for (const [key, value] of formData.entries()) {
        risk[key] = Number(value);
      }

      pushLog("WARN", `${getCurrentAccount().name} 风控配置被人工更新`);
      showToast("风控配置已保存");
    });
  }

  if (has(refs.logFilter)) {
    refs.logFilter.addEventListener("change", (event) => {
      state.logFilter = event.target.value;
      renderLogs();
    });
  }

  document.querySelectorAll(".action-btn").forEach((button) => {
    button.addEventListener("click", () => handleIntervention(button.dataset.action));
  });
}

function handleIntervention(action) {
  const account = getCurrentAccount();
  const actionMap = {
    "pause-all": {
      title: "人工暂停策略",
      detail: `${account.name} 已将全部策略切为人工审核模式。`,
      toast: "全部策略已暂停",
    },
    "cancel-open-orders": {
      title: "人工撤单",
      detail: `${account.name} 的挂单已标记为待撤销，等待执行引擎确认。`,
      toast: "撤单请求已记录",
    },
    "reduce-risk": {
      title: "紧急降风险",
      detail: `${account.name} 单笔风险临时下调 30%，并提高人工复核等级。`,
      toast: "风险参数已下调",
    },
    "close-position": {
      title: "模拟强平",
      detail: `${account.name} 高风险仓位已进入人工平仓审批队列。`,
      toast: "强平流程已创建",
    },
  };

  const selected = actionMap[action];
  addIntervention(selected.title, selected.detail);
  pushLog("WARN", `${account.name} 执行手动干预：${selected.title}`);
  showToast(selected.toast);
}

function renderAll() {
  renderHero();
  renderMarketData();
  renderSignal();
  renderAccountSelect();
  renderAccountDetails();
  renderCredentialForm();
  renderStrategies();
  renderRiskForm();
  renderLogs();
  renderInterventions();
}

async function bootstrap() {
  try {
    await Promise.all([loadAccounts(), loadMarketSnapshot()]);
    renderAll();
    attachEvents();
    connectMarketStream();
  } catch (error) {
    showToast(`初始化失败：${error.message}`);
  }
}

bootstrap();
