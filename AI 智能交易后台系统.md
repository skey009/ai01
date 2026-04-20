# 🤖 Codex Agent Instructions — AI Trading System

---

## 📌 Project Overview

这是一个 AI 驱动的量化交易后台系统，核心目标：

- 自动分析市场数据
- 生成交易信号（AI / 策略）
- 执行交易（Binance / OKX 等）
- 提供 Web 管理后台

---

## 🏗️ Tech Stack

- Frontend: React / Next.js
- Backend: Node.js (NestJS) / Python (FastAPI)
- DB: PostgreSQL / Redis
- Queue: Kafka / BullMQ
- AI: LLM + 策略模型
- Trading API: Binance / OKX

---

## 🧩 Core Modules（核心模块）

### 1. Market Data（行情模块）
- K线 / 深度 / 成交
- WebSocket 实时数据
- 数据缓存（Redis）

---

### 2. Strategy Engine（策略引擎）
- 技术指标（VWAP / RSI / MACD）
- AI信号（LLM / 模型推理）
- 信号必须可解释（Explainable）

---

### 3. Risk Control（风控系统）🚨
**最高优先级模块**

必须实现：

- 最大仓位限制（Position Limit）
- 单笔风险限制（Risk per Trade）
- 止损 / 止盈（Stop Loss / Take Profit）
- 连续亏损熔断（Circuit Breaker）
- API调用频率限制

---

### 4. Execution Engine（交易执行）
- 下单（市价 / 限价）
- 状态跟踪（订单状态机）
- 失败重试（必须幂等）

---

### 5. Portfolio（资产管理）
- 持仓
- PnL计算
- 资金曲线

---

### 6. Web Admin（后台系统）
- 多个账户可以手动切换，UI相同（主要支持币安和OKX）
- 根据API key可以看到账户余额和订单
- 策略开关
- 风控配置
- 日志监控
- 手动干预

---

## ⚙️ Development Rules

### 🚫 禁止行为（非常重要）

Codex 绝对不能：

- ❌ 直接执行真实交易（除非明确说明）
- ❌ 跳过风控直接下单
- ❌ 使用未验证策略
- ❌ 忽略异常处理
- ❌ 写“猜测行情”的逻辑

---

### ✅ 必须遵守

- 所有交易前必须调用 RiskControl.check()
- 所有策略输出必须带置信度（confidence）
- 所有关键操作必须记录日志
- 所有外部API必须加重试 + 超时

---

## 🧠 Strategy Rules（策略规则）

策略必须：

1. 可回测（Backtestable）
2. 可解释（Explainable）
3. 可关闭（Feature Flag）

示例：

```ts
signal = {
  action: "BUY" | "SELL" | "HOLD",
  confidence: 0.82,
  reason: "VWAP breakout + volume spike"
}