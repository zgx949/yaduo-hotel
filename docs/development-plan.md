# SkyHotel Agent Pro 开发计划（MVP）

## 目标

在 3 天内交付一个可运行 MVP，覆盖：

- 号池基础 CRUD
- 下单任务入队 + 状态查询
- 用户/权限（ADMIN/USER）

当前策略是先保证可运行、可演示，再逐步替换为 PostgreSQL + Redis + 第三方真实链路。

## 范围定义

### 第一期（本次搭建）

- 前后端同仓运行
- Express API 模块化框架
- 前端 Vite 代理后端
- 内存数据存储（开发模式）
- 任务状态模拟流转（waiting -> active -> completed）

### 第二期（接真实数据）

- PostgreSQL 落表与 Prisma 迁移
- Redis + BullMQ 队列替代内存任务
- 旧 Django/MySQL 数据迁移脚本（最小字段优先）

### 第三期（增强能力）

- 代理池管理与限流
- Python 消费者接入
- 实时推送（WebSocket）和监控告警

## 里程碑与交付

### Day 1：框架可运行

- 完成 backend 脚手架
- 提供健康检查接口
- 打通 `npm run dev` 一键同时启动前后端
- 输出 README 和开发计划文档

**验收标准**

- `http://localhost:3000` 可访问前端
- `http://localhost:8787/api/health` 返回 `ok: true`

### Day 2：核心模块 API 化

- 用户登录/登出/me
- 用户列表/新增/编辑（仅管理员）
- 号池列表/新增/更新
- 下单创建 + 任务查询

**验收标准**

- Postman 可完整走通登录 + 创建订单 + 查询任务状态

### Day 3：稳定性与接入准备

- 统一错误处理
- 权限边界验证
- 前端替换第一批 Mock 数据（登录、号池、下单）
- 输出后续接 PostgreSQL/Redis 的迁移路线

**验收标准**

- 核心接口异常时返回结构一致
- 基础权限校验可生效（ADMIN / USER）

## 风险与应对

1. 旧系统表结构混乱，直接迁移成本高
   - 先定义新 schema，做映射导入，不直接复刻旧表。

2. 第三方下单链路不稳定
   - 先抽象执行器接口，支持 Node/Python 双实现。

3. 高频任务与代理 IP 管理复杂
   - MVP 先实现任务重试和限流占位，稳定后再扩展策略。

## 技术决策（当前）

- 前端：React + Vite（已有）
- 后端：Express（本次已搭建）
- 数据库：PostgreSQL（下一阶段）
- 队列：Redis + BullMQ（下一阶段）
- 鉴权：当前 token 内存实现；下一阶段切换 session + pg store

## 目录建议

```text
skyhotel-agent-pro/
  backend/
    src/
      config/
      data/
      middleware/
      routes/
      services/
  docs/
    development-plan.md
```
