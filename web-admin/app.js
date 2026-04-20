const state = {
  selectedAccountId: "binance-main",
  logFilter: "ALL",
  accounts: [
    {
      id: "binance-main",
      name: "Binance Alpha",
      exchange: "Binance",
      owner: "Primary Desk",
      apiKey: "BNZ-9A1D-32F0-XXXX",
      health: "在线",
      balances: [
        { asset: "USDT", total: "128,340.22", available: "96,210.17" },
        { asset: "BTC", total: "2.4800", available: "1.9100" },
        { asset: "ETH", total: "18.6300", available: "14.3000" },
      ],
      orders: [
        { symbol: "BTC/USDT", side: "BUY", type: "LIMIT", status: "OPEN" },
        { symbol: "ETH/USDT", side: "SELL", type: "MARKET", status: "FILLED" },
        { symbol: "SOL/USDT", side: "BUY", type: "LIMIT", status: "PARTIAL" },
      ],
      strategies: [
        { id: "vwap", name: "VWAP Breakout", enabled: true, confidence: 0.82, mode: "AUTO" },
        { id: "rsi", name: "RSI Mean Reversion", enabled: false, confidence: 0.61, mode: "PAPER" },
        { id: "ai", name: "LLM Signal Overlay", enabled: true, confidence: 0.76, mode: "ASSIST" },
      ],
      risk: {
        positionLimit: 35,
        riskPerTrade: 1.2,
        stopLoss: 2.4,
        takeProfit: 5.8,
        circuitBreakerLosses: 3,
        apiRateLimit: 120,
      },
    },
    {
      id: "okx-hedge",
      name: "OKX Hedge",
      exchange: "OKX",
      owner: "Hedge Desk",
      apiKey: "OKX-77D2-61BA-XXXX",
      health: "延迟可控",
      balances: [
        { asset: "USDT", total: "86,920.11", available: "52,410.55" },
        { asset: "BTC", total: "1.3500", available: "0.8300" },
        { asset: "ARB", total: "12,540.00", available: "11,800.00" },
      ],
      orders: [
        { symbol: "BTC/USDT", side: "SELL", type: "LIMIT", status: "OPEN" },
        { symbol: "ARB/USDT", side: "BUY", type: "MARKET", status: "FILLED" },
        { symbol: "ETH/USDT", side: "SELL", type: "STOP", status: "PENDING" },
      ],
      strategies: [
        { id: "trend", name: "Trend Capture", enabled: true, confidence: 0.69, mode: "AUTO" },
        { id: "basis", name: "Basis Spread", enabled: true, confidence: 0.72, mode: "SEMI" },
        { id: "ai", name: "LLM Signal Overlay", enabled: false, confidence: 0.53, mode: "OFF" },
      ],
      risk: {
        positionLimit: 24,
        riskPerTrade: 0.8,
        stopLoss: 1.6,
        takeProfit: 4.2,
        circuitBreakerLosses: 2,
        apiRateLimit: 90,
      },
    },
  ],
  logs: [
    { level: "INFO", time: "19:00:12", message: "Binance Alpha 余额同步完成" },
    { level: "WARN", time: "19:01:36", message: "OKX Hedge API 延迟升高，已进入重试窗口" },
    { level: "INFO", time: "19:02:18", message: "VWAP Breakout 信号通过风控检查" },
    { level: "ERROR", time: "19:03:44", message: "ETH/USDT 止损委托失败，已记录待人工复核" },
    { level: "INFO", time: "19:05:21", message: "人工干预队列待处理 1 项" },
  ],
  interventions: [
    { time: "18:48:09", title: "系统初始化", detail: "后台系统载入完成，当前为模拟演示模式。" },
  ],
};

const refs = {
  heroStats: document.getElementById("heroStats"),
  accountSelect: document.getElementById("accountSelect"),
  accountCard: document.getElementById("accountCard"),
  balanceList: document.getElementById("balanceList"),
  orderList: document.getElementById("orderList"),
  strategyList: document.getElementById("strategyList"),
  riskForm: document.getElementById("riskForm"),
  logFilter: document.getElementById("logFilter"),
  logList: document.getElementById("logList"),
  interventionTimeline: document.getElementById("interventionTimeline"),
  toast: document.getElementById("toast"),
};

function getCurrentAccount() {
  return state.accounts.find((account) => account.id === state.selectedAccountId);
}

function renderHero() {
  const totalAccounts = state.accounts.length;
  const totalStrategies = getCurrentAccount().strategies.filter((item) => item.enabled).length;
  const warnCount = state.logs.filter((item) => item.level !== "INFO").length;
  const openOrders = getCurrentAccount().orders.filter((item) => item.status === "OPEN").length;

  refs.heroStats.innerHTML = [
    { label: "已接入账户", value: totalAccounts },
    { label: "启用策略", value: totalStrategies },
    { label: "风险告警", value: warnCount },
    { label: "当前挂单", value: openOrders },
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

function renderAccountSelect() {
  refs.accountSelect.innerHTML = state.accounts
    .map(
      (account) =>
        `<option value="${account.id}" ${account.id === state.selectedAccountId ? "selected" : ""}>
          ${account.exchange} · ${account.name}
        </option>`
    )
    .join("");
}

function renderAccountDetails() {
  const account = getCurrentAccount();

  refs.accountCard.innerHTML = `
    <div class="section-head">
      <div>
        <h4>${account.name}</h4>
        <p>${account.exchange} / ${account.owner}</p>
      </div>
      <span class="badge">${account.health}</span>
    </div>
    <p>API Key: ${account.apiKey}</p>
  `;

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

function renderStrategies() {
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
  const risk = getCurrentAccount().risk;
  Object.entries(risk).forEach(([key, value]) => {
    refs.riskForm.elements[key].value = value;
  });
}

function renderLogs() {
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
  if (status === "ERROR" || status === "OPEN") {
    return "error";
  }
  if (status === "WARN" || status === "PARTIAL" || status === "PENDING") {
    return "warn";
  }
  return "";
}

function showToast(message) {
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

function attachEvents() {
  refs.accountSelect.addEventListener("change", (event) => {
    state.selectedAccountId = event.target.value;
    renderAll();
    showToast("账户已切换");
  });

  refs.strategyList.addEventListener("change", (event) => {
    if (!event.target.matches("input[type='checkbox']")) {
      return;
    }

    const account = getCurrentAccount();
    const strategy = account.strategies.find((item) => item.id === event.target.dataset.strategyId);
    strategy.enabled = event.target.checked;

    const actionText = strategy.enabled ? "启用" : "停用";
    state.logs.unshift({
      level: "INFO",
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      message: `${account.name} ${actionText}策略 ${strategy.name}`,
    });

    renderHero();
    renderLogs();
    showToast(`已${actionText}${strategy.name}`);
  });

  refs.riskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(refs.riskForm);
    const risk = getCurrentAccount().risk;

    for (const [key, value] of formData.entries()) {
      risk[key] = Number(value);
    }

    state.logs.unshift({
      level: "WARN",
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      message: `${getCurrentAccount().name} 风控配置被人工更新`,
    });

    renderLogs();
    showToast("风控配置已保存");
  });

  refs.logFilter.addEventListener("change", (event) => {
    state.logFilter = event.target.value;
    renderLogs();
  });

  document.querySelectorAll(".action-btn").forEach((button) => {
    button.addEventListener("click", () => {
      handleIntervention(button.dataset.action);
    });
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
  state.logs.unshift({
    level: "WARN",
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    message: `${account.name} 执行手动干预：${selected.title}`,
  });
  renderLogs();
  showToast(selected.toast);
}

function renderAll() {
  renderHero();
  renderAccountSelect();
  renderAccountDetails();
  renderStrategies();
  renderRiskForm();
  renderLogs();
  renderInterventions();
}

renderAll();
attachEvents();
