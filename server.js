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

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
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

function buildSignal() {
  const closes = marketState.klines.map((item) => item.close);
  const latest = marketState.klines[marketState.klines.length - 1];
  const latestVwap = latest.vwap;
  const latestRsi = rsi(closes, 14);
  const macdValue = macd(closes);
  const deltaFromVwap = latest.close - latestVwap;
  let action = "HOLD";
  let title = "等待确认";
  let confidence = 0.58;
  let reason = "价格接近 VWAP，RSI 和 MACD 暂未形成一致方向。";

  if (latest.close > latestVwap && latestRsi < 68 && macdValue.macdLine > macdValue.signalLine) {
    action = "BUY";
    title = "顺势做多";
    confidence = 0.81;
    reason = `价格高于 VWAP ${deltaFromVwap.toFixed(2)}，RSI 为 ${latestRsi.toFixed(2)}，MACD 上穿信号线。`;
  } else if (latest.close < latestVwap && latestRsi > 38 && macdValue.macdLine < macdValue.signalLine) {
    action = "SELL";
    title = "转弱减仓";
    confidence = 0.78;
    reason = `价格低于 VWAP ${Math.abs(deltaFromVwap).toFixed(2)}，RSI 为 ${latestRsi.toFixed(2)}，MACD 下穿信号线。`;
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

  const snapshot = JSON.stringify(getMarketPayload());
  socket.write(createWebSocketFrame(snapshot));
}

function broadcastMarket() {
  const payload = createWebSocketFrame(JSON.stringify(getMarketPayload()));
  for (const client of wsClients) {
    if (!client.destroyed) {
      client.write(payload);
    }
  }
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
