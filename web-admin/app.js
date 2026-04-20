const state = {
  selectedAccountId: "binance-main",
  logFilter: "ALL",
  accounts: [],
  logs: [
    { level: "INFO", time: "19:00:12", message: "后台系统已启动，当前为本地演示模式" },
    { level: "INFO", time: "19:01:30", message: "可在“密钥设置”区域保存 Binance / OKX API 配置" },
  ],
  interventions: [
    { time: "18:48:09", title: "系统初始化", detail: "后台系统载入完成，尚未执行任何真实交易请求。" },
  ],
};

const refs = {
  heroStats: document.getElementById("heroStats"),
  accountSelect: document.getElementById("accountSelect"),
  accountCard: document.getElementById("accountCard"),
  balanceList: document.getElementById("balanceList"),
  orderList: document.getElementById("orderList"),
  credentialsForm: document.getElementById("credentialsForm"),
  credentialsHint: document.getElementById("credentialsHint"),
  strategyList: document.getElementById("strategyList"),
  riskForm: document.getElementById("riskForm"),
  logFilter: document.getElementById("logFilter"),
  logList: document.getElementById("logList"),
  interventionTimeline: document.getElementById("interventionTimeline"),
  toast: document.getElementById("toast"),
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

function getCurrentAccount() {
  return state.accounts.find((account) => account.id === state.selectedAccountId) || state.accounts[0];
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

function renderHero() {
  const account = getCurrentAccount();
  const totalAccounts = state.accounts.length;
  const totalStrategies = account ? account.strategies.filter((item) => item.enabled).length : 0;
  const warnCount = state.logs.filter((item) => item.level !== "INFO").length;
  const configuredCount = state.accounts.filter((item) => item.credentials && item.credentials.apiKey).length;

  refs.heroStats.innerHTML = [
    { label: "已接入账户", value: totalAccounts },
    { label: "已配置密钥", value: configuredCount },
    { label: "启用策略", value: totalStrategies },
    { label: "风险告警", value: warnCount },
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
      (account) => `
        <option value="${account.id}" ${account.id === state.selectedAccountId ? "selected" : ""}>
          ${account.exchange} · ${account.name}
        </option>
      `
    )
    .join("");
}

function renderAccountDetails() {
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

function renderCredentialForm() {
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

  refs.credentialsHint.textContent = account.credentials?.updatedAt
    ? `最近保存时间：${account.credentials.updatedAt}`
    : "尚未保存真实 API 密钥。填写后会保存在本地配置文件中。";
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

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
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

function attachEvents() {
  refs.accountSelect.addEventListener("change", (event) => {
    state.selectedAccountId = event.target.value;
    renderAll();
    showToast("账户已切换");
  });

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
  pushLog("WARN", `${account.name} 执行手动干预：${selected.title}`);
  showToast(selected.toast);
}

function renderAll() {
  renderHero();
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
    await loadAccounts();
    renderAll();
    attachEvents();
  } catch (error) {
    refs.toast.textContent = `初始化失败：${error.message}`;
    refs.toast.classList.add("show");
  }
}

bootstrap();
