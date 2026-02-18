# SkyHotel Agent Pro

React 原型 + Express 后端同仓项目。

当前版本目标是先跑通完整骨架，后续再逐步切换到 PostgreSQL + Redis + BullMQ 的真实生产链路。

## 当前能力

- 前后端同仓，一条命令启动
- 后端模块化路由骨架（auth/users/pool/orders/tasks）
- 下单任务模拟异步执行与状态流转
- 基础权限分层（ADMIN / USER）
- 前端已配置 `/api` 代理到后端

## 技术栈

- Frontend: React + Vite + TypeScript
- Backend: Express (ESM)
- Runtime: Node.js 20+
- 当前存储: Prisma + SQLite（users/pool/blacklist/system）
- 计划接入: PostgreSQL + Redis + BullMQ

## 项目结构

```text
skyhotel-agent-pro/
  App.tsx
  views/
  backend/
    src/
      app.js
      server.js
      config/
      data/
      middleware/
      routes/
      services/
  docs/
    development-plan.md
```

## 本地运行

### 1) 安装依赖

在项目根目录：

```bash
npm install
npm --prefix backend install
```

### 2) 启动前后端

```bash
npm run dev
```

默认地址：

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8787`
- Health: `http://localhost:8787/api/health`

## 环境变量

### Frontend

文件：`.env.local`

```bash
GEMINI_API_KEY=your_key_here
```

### Backend

复制 `backend/.env.example` 为 `backend/.env` 后按需修改：

```bash
NODE_ENV=development
PORT=8787
API_PREFIX=/api
CORS_ORIGIN=http://localhost:3000
USE_MEMORY_STORE=true
DATABASE_URL="file:./prisma/dev.db"
ATOUR_ACCESS_TOKEN=
ATOUR_CLIENT_ID=363CB080-412A-4BFB-AF6E-8C3472F93814
ATOUR_PLATFORM_TYPE=2
ATOUR_CHANNEL_ID=20001
ATOUR_APP_VERSION=4.1.0
ATOUR_MEB_ID=
ATOUR_COOKIE=
ATOUR_PLACE_SEARCH_CLIENT_ID=0354EF67-0288-4C6A-89B3-A5009DD8926E
ATOUR_PLACE_SEARCH_BASE_URL=https://api2.yaduo.com/atourlife/placeSearch/searchV2
```

说明：

- 新建预订搜索通过 `/api/hotels/search` 代理亚朵搜索接口。
- 搜索框联想通过 `/api/hotels/place-search?keyword=` 代理亚朵 `placeSearch/searchV2`。
- 未配置 `ATOUR_ACCESS_TOKEN` 时，前端会自动回退到本地 `MOCK_HOTELS`。

### Backend 数据库（Prisma）

后端已接入 Prisma，以下模块默认走数据库（SQLite）：

- 用户与权限（users/auth）
- 号池管理（pool）
- 酒店黑名单（blacklist）
- 系统管理（system，包括代理与 LLM 模型配置）

初始化本地数据库（在项目根目录执行）：

```bash
npm --prefix backend install
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate -- --name init_sqlite
npm --prefix backend run prisma:seed
```

Prisma Studio（查看表数据）：

```bash
npm --prefix backend run prisma:studio
```

如果 Studio 看不到表或提示 `DATABASE_URL` 错误，请确认 `backend/.env` 里有：

```bash
DATABASE_URL="file:./prisma/dev.db"
```

并且先执行过 `prisma:migrate` 和 `prisma:seed`。

切换到 PostgreSQL（部署环境）：

1. 将 `backend/prisma/schema.prisma` 的 `datasource db.provider` 从 `sqlite` 改为 `postgresql`
2. 将 `DATABASE_URL` 改为 PostgreSQL 连接串（如 `postgresql://user:pass@host:5432/dbname`）
3. 重新执行 `npm --prefix backend run prisma:migrate` 与 `npm --prefix backend run prisma:generate`

## 后端 API（当前骨架）

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users`（ADMIN）
- `POST /api/users`（ADMIN）
- `PATCH /api/users/:id`（ADMIN）
- `GET /api/pool/accounts`
- `GET /api/pool/accounts/:id`
- `GET /api/pool/corporate-agreements`
- `POST /api/pool/accounts`
- `PATCH /api/pool/accounts/:id`
- `DELETE /api/pool/accounts/:id`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/tasks/:taskId`
- `GET /api/hotels/place-search?keyword=`
- `POST /api/hotels/search`
- `GET /api/blacklist/records`
- `GET /api/blacklist/records/:id`
- `POST /api/blacklist/records`
- `PATCH /api/blacklist/records/:id`
- `DELETE /api/blacklist/records/:id`
- `GET /api/blacklist/hotels`
- `GET /api/blacklist/hotel-check?chainId=&hotelName=`
- `GET /api/health/keys`
- `GET /api/health/crypto`
- `POST /api/health/crypto/test`

说明：`/api/health/crypto` 与 `/api/health/crypto/test` 仅在 `NODE_ENV=development` 时注册；生产环境会自动关闭（路由不存在）。

## 快速联调示例

### 登录获取 token

```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin"}'
```

### 创建订单（带 token）

```bash
curl -X POST http://localhost:8787/api/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"hotelName":"上海静安瑞吉","customerName":"张三","price":1288}'
```

### 查询任务状态

```bash
curl http://localhost:8787/api/tasks/<TASK_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

### 查看加解密算法信息

> 仅开发环境可用；生产环境该接口不会注册。

```bash
curl http://localhost:8787/api/health/crypto
```

返回示例：

```json
{
  "ok": true,
  "encryption": {
    "algorithm": "RSA-OAEP",
    "oaepHash": "sha256",
    "inputEncoding": "utf8",
    "outputEncoding": "base64",
    "keyFormat": "PEM",
    "ready": true
  }
}
```

### 测试加密和解密

> 仅开发环境可用；生产环境该接口不会注册。

```bash
curl -X POST http://localhost:8787/api/health/crypto/test \
  -H "Content-Type: application/json" \
  -d '{"plainText":"hello-atour"}'
```

解密已有密文：

```bash
curl -X POST http://localhost:8787/api/health/crypto/test \
  -H "Content-Type: application/json" \
  -d '{"cipherText":"<base64密文>"}'
```

## 号池字段（当前接口）

对齐旧 Django `UserToken` 基础字段：

- `phone`
- `token`（唯一）
- `is_online`
- `remark`
- `is_platinum`
- `is_corp_user`
- `is_new_user`
- `breakfast_coupons`
- `room_upgrade_coupons`
- `late_checkout_coupons`
- `created_at`
- `updated_at`

同时保留前端当前视图兼容字段（如 `tier/status/coupons/points`）。

增强设计：一个账号可绑定多个企业协议（`corporate_agreements`），用于后续下单时按协议名选择。

## 酒店黑名单字段（当前接口）

核心标识：`chainId + hotelName`。

记录字段：

- `id`
- `chainId`
- `hotelName`
- `severity` (`HIGH` / `MEDIUM` / `LOW`)
- `reason`
- `tags` (数组)
- `status` (`ACTIVE` / `RESOLVED`)
- `reportedBy`
- `source`
- `date`

复用查询：

- `/api/blacklist/hotels`：按酒店聚合，返回次数/最高风险/标签汇总
- `/api/blacklist/hotel-check`：供其他模块快速判断酒店是否命中黑名单

## 下一步

1. 将内存数据层替换为 PostgreSQL + Prisma。
2. 将内存任务处理替换为 Redis + BullMQ。
3. 将前端关键页面从 `MOCK_*` 数据切换到真实 API。
4. 接入操作审计日志和代理池能力。

详细节奏见：`docs/development-plan.md`
