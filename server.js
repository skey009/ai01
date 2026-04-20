const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = process.env.PORT || 3000;
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

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    const data = readAccounts();
    return json(res, 200, { accounts: serializeAccounts(data.accounts) });
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

ensureDataFile();

server.listen(PORT, HOST, () => {
  console.log(`Web Admin is running at http://${HOST}:${PORT}`);
});
