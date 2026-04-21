const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "web-admin");
const DATA_DIR = path.join(__dirname, "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const marketState = {
  symbol: "BTC/USDT",
  lastPrice: 64280,
  change24h: 1.82,
  volume24h: 18429.31,
  klines: [],
  depth: { bids: [], asks: [] },
  trades: [],
  cache: {
    status: "HOT",
    key: "redis:market:btcusdt:1m",
    updatedAt: "",
  },
};

const executionState = {
  orders: [
    {
      id: "ord-1001",
      accountId: "binance-main",
      symbol: "BTC/USDT",
      side: "BUY",
      orderType: "LIMIT",
      quantity: 0.18,
      price: 64120,
      stopLoss: 2.2,
      takeProfit: 5.2,
      idempotencyKey: "alpha-btc-001",
      status: "FILLED",
      retryCount: 0,
      lastError: "",
      createdAt: "2026-04-21 11:20:00",
      transitions: ["CREATED", "RISK_CHECK_PASSED", "QUEUED", "SUBMITTED", "FILLED"],
    },
    {
      id: "ord-1002",
      accountId: "okx-hedge",
      symbol: "ETH/USDT",
      side: "SELL",
      orderType: "MARKET",
      quantity: 1.2,
      price: 3128,
      stopLoss: 1.3,
      takeProfit: 4.1,
      idempotencyKey: "hedge-eth-007",
      status: "FAILED",
      retryCount: 1,
      lastError: "交易所超时，等待重试",
      createdAt: "2026-04-21 11:42:00",
      transitions: ["CREATED", "RISK_CHECK_PASSED", "QUEUED", "SUBMITTED", "FAILED"],
    },
  ],
};

const wsClients = new Set();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(ACCOUNTS_FILE)) {
    const initialData = {
      accounts: [
        {
          id: "binance-main",
          name: "Binance Alpha",
          exchange: "Binance",
          owner: "Primary Desk",
          health: "在线",
          note: "默认演示账户",
          credentials: {
            apiKey: "",
            apiSecret: "",
            passphrase: "",
            note: "",
            updatedAt: "",
          },
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
            { id: "sar", name: "SAR Trend Reversal", enabled: false, confidence: 0.67, mode: "AUTO" },
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
          health: "延迟可控",
          note: "默认演示账户",
          credentials: {
            apiKey: "",
            apiSecret: "",
            passphrase: "",
            note: "",
            updatedAt: "",
          },
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
            { id: "sar", name: "SAR Trend Reversal", enabled: true, confidence: 0.64, mode: "SEMI" },
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
    };

    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(initialData, null, 2), "utf8");
  }
}

function readAccounts() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
}

function writeAccounts(data) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(error.code === "ENOENT" ? "404 Not Found" : "500 Internal Server Error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("请求体过大"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("JSON 格式错误"));
      }
    });
    req.on("error", reject);
  });
}

function maskValue(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-1)}`;
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function serializeAccounts(accounts) {
  return accounts.map((account) => ({
    ...account,
    credentials: {
      ...account.credentials,
      maskedKey: maskValue(account.credentials.apiKey),
      maskedSecret: maskValue(account.credentials.apiSecret),
      maskedPassphrase: maskValue(account.credentials.passphrase),
    },
  }));
}

function formatTimeLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function seedMarket() {
  const now = new Date();
  let price = marketState.lastPrice;
  let cumulativeVolume = 0;
  let cumulativePV = 0;

  for (let i = 31; i >= 0; i -= 1) {
    const time = new Date(now.getTime() - i * 60_000);
    const open = price;
    const close = open + randomBetween(-55, 55);
    const high = Math.max(open, close) + randomBetween(8, 45);
    const low = Math.min(open, close) - randomBetween(8, 45);
    const volume = randomBetween(120, 480);
    price = close;
    cumulativeVolume += volume;
    cumulativePV += close * volume;

    marketState.klines.push({
      time: time.toISOString(),
      timeLabel: formatTimeLabel(time),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(2)),
      vwap: Number((cumulativePV / cumulativeVolume).toFixed(2)),
    });
  }

  marketState.lastPrice = Number(price.toFixed(2));
  refreshDepthAndTrades();
  marketState.cache.updatedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function refreshDepthAndTrades() {
  const mid = marketState.lastPrice;
  marketState.depth = {
    asks: Array.from({ length: 6 }, (_, index) => ({
      price: Number((mid + (index + 1) * randomBetween(6, 14)).toFixed(2)),
      size: Number(randomBetween(0.18, 1.8).toFixed(4)),
    })),
    bids: Array.from({ length: 6 }, (_, index) => ({
      price: Number((mid - (index + 1) * randomBetween(6, 14)).toFixed(2)),
      size: Number(randomBetween(0.18, 1.8).toFixed(4)),
    })),
  };

  const sides = ["BUY", "SELL"];
  marketState.trades = Array.from({ length: 8 }, () => ({
    side: sides[Math.floor(Math.random() * sides.length)],
    price: Number((mid + randomBetween(-18, 18)).toFixed(2)),
    size: Number(randomBetween(0.01, 0.8).toFixed(4)),
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  }));
}

function ema(values, period) {
  if (!values.length) {
    return 0;
  }

  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function macd(values) {
  const macdSeries = [];
  for (let i = 26; i <= values.length; i += 1) {
    const window = values.slice(0, i);
    macdSeries.push(ema(window.slice(-12), 12) - ema(window.slice(-26), 26));
  }

  const macdLine = macdSeries[macdSeries.length - 1] || 0;
  const signalLine = ema(macdSeries.slice(-9), 9);
  return { macdLine, signalLine };
}

function calculateSar(klines) {
  if (klines.length < 5) {
    return 0;
  }

  const recent = klines.slice(-5);
  const highs = recent.map((item) => item.high);
  const lows = recent.map((item) => item.low);
  const trendUp = recent[recent.length - 1].close >= recent[0].close;
  return trendUp ? Math.min(...lows) : Math.max(...highs);
}

function buildSignal() {
  const closes = marketState.klines.map((item) => item.close);
  const latest = marketState.klines[marketState.klines.length - 1];
  const latestVwap = latest.vwap;
  const latestRsi = rsi(closes, 14);
  const macdValue = macd(closes);
  const sarValue = calculateSar(marketState.klines);
  const deltaFromVwap = latest.close - latestVwap;

  let action = "HOLD";
  let title = "等待确认";
  let confidence = 0.58;
  let reason = "价格接近 VWAP，RSI、MACD 与 SAR 暂未形成一致方向。";

  if (latest.close > latestVwap && latestRsi < 68 && macdValue.macdLine > macdValue.signalLine && latest.close > sarValue) {
    action = "BUY";
    title = "顺势做多";
    confidence = 0.84;
    reason = `价格高于 VWAP ${deltaFromVwap.toFixed(2)}，RSI 为 ${latestRsi.toFixed(2)}，MACD 上穿信号线，SAR 位于价格下方。`;
  } else if (
    latest.close < latestVwap &&
    latestRsi > 38 &&
    macdValue.macdLine < macdValue.signalLine &&
    latest.close < sarValue
  ) {
    action = "SELL";
    title = "转弱减仓";
    confidence = 0.8;
    reason = `价格低于 VWAP ${Math.abs(deltaFromVwap).toFixed(2)}，RSI 为 ${latestRsi.toFixed(2)}，MACD 下穿信号线，SAR 位于价格上方。`;
  }

  return {
    action,
    title,
    confidence: Number(confidence.toFixed(2)),
    reason,
    indicators: {
      vwap: Number(latestVwap.toFixed(2)),
      rsi: Number(latestRsi.toFixed(2)),
      macd: Number(macdValue.macdLine.toFixed(4)),
      macdSignal: Number(macdValue.signalLine.toFixed(4)),
      sar: Number(sarValue.toFixed(2)),
    },
  };
}

function getMarketPayload() {
  return {
    market: marketState,
    signal: buildSignal(),
  };
}

function evolveMarket() {
  const last = marketState.klines[marketState.klines.length - 1];
  const now = new Date();
  const drift = randomBetween(-42, 42);
  const open = last.close;
  const close = open + drift;
  const high = Math.max(open, close) + randomBetween(4, 26);
  const low = Math.min(open, close) - randomBetween(4, 26);
  const volume = randomBetween(110, 510);

  marketState.klines.push({
    time: now.toISOString(),
    timeLabel: formatTimeLabel(now),
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: Number(volume.toFixed(2)),
    vwap: Number(
      (
        marketState.klines.reduce((sum, item) => sum + item.close * item.volume, 0) /
        marketState.klines.reduce((sum, item) => sum + item.volume, 0)
      ).toFixed(2)
    ),
  });

  if (marketState.klines.length > 32) {
    marketState.klines.shift();
  }

  marketState.lastPrice = Number(close.toFixed(2));
  marketState.change24h = Number((marketState.change24h + randomBetween(-0.22, 0.22)).toFixed(2));
  marketState.volume24h = Number((marketState.volume24h + randomBetween(12, 38)).toFixed(2));
  marketState.cache.updatedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  refreshDepthAndTrades();
  broadcastMarket();
}

function createWebSocketFrame(payload) {
  const message = Buffer.from(payload);
  const length = message.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), message]);
  }
  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, message]);
  }
  throw new Error("WebSocket payload too large");
}

function handleWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n")
  );

  wsClients.add(socket);
  socket.on("close", () => wsClients.delete(socket));
  socket.on("end", () => wsClients.delete(socket));
  socket.on("error", () => wsClients.delete(socket));
  socket.write(createWebSocketFrame(JSON.stringify(getMarketPayload())));
}

function broadcastMarket() {
  const payload = createWebSocketFrame(JSON.stringify(getMarketPayload()));
  for (const client of wsClients) {
    if (!client.destroyed) {
      client.write(payload);
    }
  }
}

function getAccountById(accountId) {
  const data = readAccounts();
  return data.accounts.find((item) => item.id === accountId);
}

function getRiskMetrics(accountId) {
  const account = getAccountById(accountId);
  const lossesBase = accountId === "okx-hedge" ? 2 : 1;
  const apiBase = accountId === "okx-hedge" ? 71 : 52;
  return {
    currentExposure: accountId === "okx-hedge" ? 19.6 : 22.4,
    tradeRisk: accountId === "okx-hedge" ? 0.7 : 0.9,
    consecutiveLosses: lossesBase,
    apiCallsLastMinute: apiBase,
    account,
  };
}

function evaluateRisk(accountId, draft = {}) {
  const metrics = getRiskMetrics(accountId);
  const account = metrics.account;
  const checks = [];
  const quantity = Number(draft.quantity || 0);
  const price = Number(draft.price || marketState.lastPrice);
  const orderNotional = quantity * price;
  const positionUsage = metrics.currentExposure + orderNotional / 10000;
  const tradeRisk = Number(draft.stopLoss || account.risk.stopLoss);
  const apiCalls = metrics.apiCallsLastMinute + (draft.includeApiCall ? 1 : 0);

  checks.push({
    key: "positionLimit",
    label: "最大仓位限制",
    passed: positionUsage <= account.risk.positionLimit,
    current: Number(positionUsage.toFixed(2)),
    limit: account.risk.positionLimit,
  });
  checks.push({
    key: "riskPerTrade",
    label: "单笔风险限制",
    passed: tradeRisk <= account.risk.riskPerTrade,
    current: tradeRisk,
    limit: account.risk.riskPerTrade,
  });
  checks.push({
    key: "stopLoss",
    label: "止损限制",
    passed: Number(draft.stopLoss || account.risk.stopLoss) <= account.risk.stopLoss,
    current: Number(draft.stopLoss || account.risk.stopLoss),
    limit: account.risk.stopLoss,
  });
  checks.push({
    key: "takeProfit",
    label: "止盈限制",
    passed: Number(draft.takeProfit || account.risk.takeProfit) <= account.risk.takeProfit + 2.5,
    current: Number(draft.takeProfit || account.risk.takeProfit),
    limit: account.risk.takeProfit,
  });
  checks.push({
    key: "circuitBreaker",
    label: "连续亏损熔断",
    passed: metrics.consecutiveLosses < account.risk.circuitBreakerLosses,
    current: metrics.consecutiveLosses,
    limit: account.risk.circuitBreakerLosses,
  });
  checks.push({
    key: "apiRateLimit",
    label: "API 调用频率限制",
    passed: apiCalls <= account.risk.apiRateLimit,
    current: apiCalls,
    limit: account.risk.apiRateLimit,
  });

  return {
    accountId,
    allowed: checks.every((item) => item.passed),
    checks,
    summary: {
      currentExposure: metrics.currentExposure,
      projectedExposure: Number(positionUsage.toFixed(2)),
      consecutiveLosses: metrics.consecutiveLosses,
      apiCallsLastMinute: apiCalls,
    },
  };
}

function getRiskSnapshot(accountId) {
  const account = getAccountById(accountId);
  const evaluation = evaluateRisk(accountId, {});
  return {
    accountId,
    config: account.risk,
    evaluation,
  };
}

function buildPortfolio(accountId) {
  const base = accountId === "okx-hedge"
    ? {
        positions: [
          { symbol: "BTC/USDT", side: "SHORT", size: 0.84, entry: 64820, mark: 64540, pnl: 235.2, pnlPct: 2.38 },
          { symbol: "ARB/USDT", side: "LONG", size: 9200, entry: 1.08, mark: 1.12, pnl: 368, pnlPct: 3.7 },
        ],
        equity: 90240,
        available: 52410,
        unrealizedPnl: 603.2,
      }
    : {
        positions: [
          { symbol: "BTC/USDT", side: "LONG", size: 1.12, entry: 63880, mark: 64540, pnl: 739.2, pnlPct: 1.93 },
          { symbol: "ETH/USDT", side: "LONG", size: 9.6, entry: 3094, mark: 3132, pnl: 364.8, pnlPct: 1.23 },
          { symbol: "SOL/USDT", side: "LONG", size: 220, entry: 142.1, mark: 144.4, pnl: 506, pnlPct: 1.62 },
        ],
        equity: 132480,
        available: 96210,
        unrealizedPnl: 1610,
      };

  const curve = Array.from({ length: 12 }, (_, index) => {
    const value = base.equity - 2100 + index * 180 + Math.round(Math.sin(index / 1.8) * 620);
    return {
      label: `D${index + 1}`,
      equity: value,
    };
  });

  return {
    accountId,
    summary: {
      equity: base.equity,
      available: base.available,
      unrealizedPnl: base.unrealizedPnl,
      pnlToday: Number((base.unrealizedPnl * 0.62).toFixed(2)),
    },
    positions: base.positions,
    curve,
  };
}

function createOrder(payload) {
  const existing = executionState.orders.find((item) => item.idempotencyKey === payload.idempotencyKey);
  if (existing) {
    return { order: existing, idempotent: true };
  }

  const risk = evaluateRisk(payload.accountId, { ...payload, includeApiCall: true });
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const failed = !risk.allowed || payload.symbol === "ETH/USDT";
  const order = {
    id: `ord-${1000 + executionState.orders.length + 1}`,
    accountId: payload.accountId,
    symbol: payload.symbol,
    side: payload.side,
    orderType: payload.orderType,
    quantity: Number(payload.quantity),
    price: Number(payload.price || marketState.lastPrice),
    stopLoss: Number(payload.stopLoss),
    takeProfit: Number(payload.takeProfit),
    idempotencyKey: payload.idempotencyKey,
    status: failed ? (risk.allowed ? "FAILED" : "REJECTED") : "FILLED",
    retryCount: 0,
    lastError: failed ? (risk.allowed ? "交易所返回超时，等待重试" : "RiskControl.check() 未通过") : "",
    createdAt: now,
    transitions: failed
      ? risk.allowed
        ? ["CREATED", "RISK_CHECK_PASSED", "QUEUED", "SUBMITTED", "FAILED"]
        : ["CREATED", "RISK_CHECK_FAILED", "REJECTED"]
      : ["CREATED", "RISK_CHECK_PASSED", "QUEUED", "SUBMITTED", "FILLED"],
  };

  executionState.orders.unshift(order);
  return { order, idempotent: false, risk };
}

function retryOrder(orderId) {
  const order = executionState.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("订单不存在");
  }

  if (order.status !== "FAILED") {
    return order;
  }

  if (order.transitions.includes("RETRYING")) {
    return order;
  }

  order.retryCount += 1;
  order.status = "FILLED";
  order.lastError = "";
  order.transitions.push("RETRYING", "SUBMITTED", "FILLED");
  return order;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    const data = readAccounts();
    return json(res, 200, { accounts: serializeAccounts(data.accounts) });
  }

  if (req.method === "GET" && url.pathname === "/api/market/state") {
    return json(res, 200, getMarketPayload());
  }

  if (req.method === "GET" && url.pathname === "/api/risk/state") {
    const accountId = url.searchParams.get("accountId") || "binance-main";
    return json(res, 200, getRiskSnapshot(accountId));
  }

  if (req.method === "POST" && url.pathname === "/api/risk/check") {
    const payload = await readBody(req);
    return json(res, 200, evaluateRisk(payload.accountId || "binance-main", { ...payload, includeApiCall: true }));
  }

  if (req.method === "GET" && url.pathname === "/api/execution/state") {
    const accountId = url.searchParams.get("accountId");
    const orders = accountId ? executionState.orders.filter((item) => item.accountId === accountId) : executionState.orders;
    return json(res, 200, { orders });
  }

  if (req.method === "POST" && url.pathname === "/api/execution/orders") {
    const payload = await readBody(req);
    const required = ["accountId", "symbol", "side", "orderType", "quantity", "stopLoss", "takeProfit", "idempotencyKey"];
    const missing = required.find((key) => !String(payload[key] ?? "").trim());
    if (missing) {
      return json(res, 400, { error: `缺少字段：${missing}` });
    }
    return json(res, 200, createOrder(payload));
  }

  const retryMatch = url.pathname.match(/^\/api\/execution\/orders\/([^/]+)\/retry$/);
  if (req.method === "POST" && retryMatch) {
    try {
      return json(res, 200, { order: retryOrder(retryMatch[1]) });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/portfolio/state") {
    const accountId = url.searchParams.get("accountId") || "binance-main";
    return json(res, 200, buildPortfolio(accountId));
  }

  const credentialsMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/credentials$/);
  if (req.method === "POST" && credentialsMatch) {
    try {
      const accountId = credentialsMatch[1];
      const payload = await readBody(req);
      const requiredFields = ["name", "owner", "exchange", "health", "apiKey", "apiSecret"];
      const missingField = requiredFields.find((field) => !String(payload[field] || "").trim());

      if (missingField) {
        return json(res, 400, { error: `缺少字段：${missingField}` });
      }

      const data = readAccounts();
      const account = data.accounts.find((item) => item.id === accountId);
      if (!account) {
        return json(res, 404, { error: "账户不存在" });
      }

      account.name = String(payload.name).trim();
      account.owner = String(payload.owner).trim();
      account.exchange = String(payload.exchange).trim();
      account.health = String(payload.health).trim();
      account.credentials = {
        apiKey: String(payload.apiKey).trim(),
        apiSecret: String(payload.apiSecret).trim(),
        passphrase: String(payload.passphrase || "").trim(),
        note: String(payload.note || "").trim(),
        updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      };

      writeAccounts(data);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: error.message || "保存失败" });
    }
  }

  return json(res, 404, { error: "API Not Found" });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    return handleApi(req, res);
  }

  const reqPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.on("upgrade", (req, socket) => {
  if (req.url === "/ws/market") {
    handleWebSocket(req, socket);
    return;
  }
  socket.destroy();
});

ensureDataFile();
seedMarket();
setInterval(evolveMarket, 2500);

server.listen(PORT, HOST, () => {
  console.log(`Web Admin is running at http://${HOST}:${PORT}`);
});
