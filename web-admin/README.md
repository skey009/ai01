# Web Admin

这是 `AI 智能交易后台系统` 的第 6 个核心模块原型，覆盖以下能力：

- 多账户切换（Binance / OKX）
- 交易所 API Key / Secret / Passphrase 设置
- 根据 API Key 查看账户余额与订单
- 策略开关
- 风控配置
- 日志监控
- 手动干预

## 运行方式

在项目根目录执行：

```powershell
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

## 当前实现说明

- 当前为前端交互原型 + 本地静态服务
- 已支持在后台页面保存交易所密钥到本地配置文件 `data/accounts.json`
- 所有账户、余额、订单、日志仍为模拟数据
- 暂未连接真实交易所，不会触发真实下单
- 手动干预只记录操作轨迹，不执行真实交易动作

## 文件结构

- `server.js`: 零依赖本地静态服务
- `data/accounts.json`: 本地账户与密钥配置
- `web-admin/index.html`: 后台页面结构
- `web-admin/styles.css`: 页面样式与响应式布局
- `web-admin/app.js`: 页面交互、状态管理、模拟数据

## 后续接入建议

- 将账户列表与 API Key 配置接入后端密钥管理服务
- 将余额、订单、日志改为后端接口返回
- 所有交易相关操作统一经过 `RiskControl.check()`
- 手动干预动作接入审批流与审计日志
