# 飞猪 OTA 酒店商品管理与自动上架实施计划

## TL;DR
> **Summary**: 基于现有 OTA 架构新增独立“飞猪商品管理”页面，实现亚朵酒店/房型导入、本地树形持久化管理（酒店->房型->策略）、保存即自动发布到飞猪，并补齐最小后端 API 自动化测试。
> **Deliverables**:
> - 新独立页面（不改造既有 `OtaPlatform`）
> - 后端导入/发布分离接口与自动发布链路
> - `shid/srid` 后台映射表与发布自动带出
> - 策略实体化持久化（兼容旧 `rawPayload`）
> - 最小后端 API 测试基础与核心用例
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: 2 → 3 → 4 → 5 → 8 → 9 → 12

## Context
### Original Request
- 对接飞猪酒店商品上架。
- 选择亚朵酒店后可获取酒店与房型信息并落库，再上架飞猪。
- 商品信息在本地持久化管理。
- 使用酒店->房型->策略树形管理。
- 新建独立 OTA 酒店商品管理页面。

### Interview Summary
- 页面方案：确认新建独立页面。
- 发布策略：确认保存即自动发布到飞猪。
- 测试策略：确认新增最小后端 API 测试。
- 导入方式：确认首版支持亚朵搜索/选择导入。
- 匹配字段：确认 `shid/srid` 通过后台映射表维护并在发布时自动带出。

### Metis Review (gaps addressed)
- 风险 1：现有 `/api/ota/products/*` 语义偏“按 outer_id 拉取导入”，与“保存即发布”语义冲突。
  - 处理：新增独立 product-center 路由，显式区分导入与发布动作。
- 风险 2：飞猪必填字段缺失导致发布失败不可观测。
  - 处理：后端统一校验、机器可读错误码、同步日志记录。
- 风险 3：测试环境缺少可运行链路。
  - 处理：新增最小测试脚本与 DB 启动说明，测试中只走 mock adapter，不触达真实 TOP。

## Work Objectives
### Core Objective
- 交付一条可执行、可追踪、可回放的飞猪商品链路：亚朵导入 -> 本地树管理 -> 自动发布飞猪 -> 结果落库与日志留痕。

### Deliverables
- 新页面 `views/FeizhuProductCenter.tsx`（命名可按团队规范微调，但必须独立于 `views/OtaPlatform.tsx`）。
- 新后端路由组（建议前缀 `/api/ota/product-center/*`）。
- Prisma 新增/扩展模型：`shid/srid` 映射、策略发布字段、发布状态字段。
- 服务层新增导入与发布编排（复用 `taobao-top.adapter.js` 的 `upsert*` 能力）。
- 最小自动化测试：后端 API 核心 happy/failure 覆盖。

### Definition of Done (verifiable conditions with commands)
- 新后端接口可启动并通过测试：`npm --prefix backend test`
- 前端构建通过：`npm run build`
- Prisma schema 可推送：`npx --prefix backend prisma db push`
- 不破坏既有 OTA 页面：`npm run build` 且执行自动化 smoke 场景验证 `ota-platform` 可进入。

### Must Have
- 导入与发布接口语义分离，禁止隐式发布。
- 保存策略时自动触发发布（受发布开关控制）。
- 发布前强校验 `shid/srid` 与必填字段，失败必须可追踪。
- 树节点三层固定：酒店、房型、策略。
- 兼容既有 `OtaRoomType.rawPayload.rateplans/strategyConfigs` 读取。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不改造订单履约、日历推送、Webhook 主流程。
- 不替换或重写既有 `views/OtaPlatform.tsx`。
- 不在测试中调用真实飞猪 TOP 网关。
- 不依赖人工判断作为验收条件（必须命令或自动场景可验证）。

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + Node.js test runner/Supertest（新增）
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Backend foundation（测试基建、schema、store、service、route、adapter guard）
Wave 2: Frontend product center（菜单/页面、树管理、导入/映射/自动发布交互）
Wave 3: Integration hardening（端到端 API 用例、兼容回归、文档与发布开关验收）

### Dependency Matrix (full, all tasks)
- 1 -> 12
- 2 -> 3, 4, 5, 10, 12
- 3 -> 4, 5, 10
- 4 -> 5, 8, 9, 12
- 5 -> 8, 9, 10, 12
- 6 -> 7, 8, 9
- 7 -> 8, 9
- 8 -> 9, 11, 12
- 9 -> 11, 12
- 10 -> 12
- 11 -> 12

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 6 tasks -> unspecified-high, quick
- Wave 2 -> 5 tasks -> visual-engineering, unspecified-high
- Wave 3 -> 3 tasks -> unspecified-high, writing

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. 建立最小后端 API 测试基建（不触达真实飞猪）

  **What to do**: 在 `backend` 引入 Node test runner + Supertest 最小基建；新增 `test` 脚本、测试目录、测试环境加载；明确测试仅连本地测试 DB，并通过 mock adapter 断开真实 TOP 调用。
  **Must NOT do**: 不允许测试依赖线上 RDS；不允许测试请求真实 `https://eco.taobao.com/router/rest`。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 涉及运行时、环境变量、测试可执行性约束。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`playwright`] — 后端测试无需浏览器自动化。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [12] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/package.json` — 后端脚本组织与命令入口。
  - Pattern: `backend/src/lib/prisma.js:1` — 当前 `DATABASE_URL` 强依赖行为。
  - Pattern: `backend/src/app.js:9` — 可直接用于 Supertest 挂载 app。
  - Pattern: `docker-compose.yml` — 当前仅 redis，无测试 postgres。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm --prefix backend test` 可执行并返回退出码 0（在测试环境准备完成后）。
  - [ ] 测试日志中无真实 TOP 域名请求。
  - [ ] 缺失测试数据库配置时，测试给出明确错误提示（非静默失败）。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Backend test smoke
    Tool: Bash
    Steps: 设置测试环境变量(DATABASE_URL 指向测试库) -> 运行 npm --prefix backend test
    Expected: 至少 1 个测试执行成功；命令退出码为 0
    Evidence: .sisyphus/evidence/task-1-test-infra.txt

  Scenario: Missing DATABASE_URL
    Tool: Bash
    Steps: 清空 DATABASE_URL -> 运行 npm --prefix backend test
    Expected: 进程失败并输出明确 DATABASE_URL 缺失信息
    Evidence: .sisyphus/evidence/task-1-test-infra-error.txt
  ```

  **Commit**: YES | Message: `test(ota): bootstrap backend api test harness` | Files: [`backend/package.json`, `backend/tests/**`, `backend/src/**test-utils**`]

- [x] 2. 扩展 Prisma 模型以承载 `shid/srid` 映射与策略发布状态

  **What to do**: 在 `backend/prisma/schema.prisma` 新增酒店映射模型与房型映射模型（分别承载 `shid`、`srid`），并扩展策略实体（以 `OtaRoomMapping` 为策略主实体）增加发布必需字段：`breakfastCount`、`guaranteeType`、`cancelPolicyCal`、`publishStatus`、`lastPublishedAt`、`lastPublishError`；保留原唯一索引语义。
  **Must NOT do**: 不删除既有 OTA 模型；不破坏 `OtaRoomMapping` 现有唯一约束；不将策略改为非结构化纯 JSON。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 数据模型变更影响面大。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`frontend-ui-ux`] — 非 UI 任务。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 4, 5, 10, 12] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - API/Type: `backend/prisma/schema.prisma:334` — 现有 `OtaHotelMapping`。
  - API/Type: `backend/prisma/schema.prisma:349` — 现有 `OtaRoomMapping`（策略主键）。
  - API/Type: `backend/prisma/schema.prisma:390` — `OtaCalendarItem` 索引与字段风格参考。
  - External: `docs/商品发布流程.md` — `shid/srid`、`breakfast_count`、`guarantee_type`、`cancel_policy_cal` 字段要求。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx --prefix backend prisma validate` 通过。
  - [ ] `npx --prefix backend prisma db push` 成功并生成新表/新列。
  - [ ] `npm --prefix backend run prisma:generate` 成功。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Prisma schema apply
    Tool: Bash
    Steps: 运行 prisma validate -> prisma db push -> prisma generate
    Expected: 三个命令均成功；无 schema 冲突
    Evidence: .sisyphus/evidence/task-2-prisma-schema.txt

  Scenario: Duplicate mapping guard
    Tool: Bash
    Steps: 向新映射表写入相同 platform + hotel/room 唯一键两次
    Expected: 第二次触发唯一约束错误
    Evidence: .sisyphus/evidence/task-2-prisma-schema-error.txt
  ```

  **Commit**: YES | Message: `feat(ota): add shid-srid mapping and strategy publish fields` | Files: [`backend/prisma/schema.prisma`]

- [x] 3. 实现 store 层映射与策略持久化（兼容旧 rawPayload）

  **What to do**: 在 `backend/src/data/ota-prisma-store.js` 新增 `shid/srid` 映射 CRUD；策略保存以 `OtaRoomMapping` 新字段为主，同时镜像写入 `OtaRoomType.rawPayload.strategyConfigs` 以兼容老读取逻辑；新增查询聚合接口供树结构页面一次性拉取酒店/房型/策略。
  **Must NOT do**: 不移除 `readStrategyFormula/writeStrategyFormula`；不让旧页面读取报错。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 需要处理兼容读写与聚合输出。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`playwright`] — 数据层任务。

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4, 5, 10] | Blocked By: [2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/data/ota-prisma-store.js:610` — `upsertRoomMapping` 当前策略写入路径。
  - Pattern: `backend/src/data/ota-prisma-store.js:92` — `readStrategyFormula` 兼容读取逻辑。
  - Pattern: `backend/src/data/ota-prisma-store.js:115` — `writeStrategyFormula` 镜像写入逻辑。
  - Pattern: `backend/src/data/ota-prisma-store.js:764` — `listRoomMappings` 输出扩展字段方式。

  **Acceptance Criteria** (agent-executable only):
  - [ ] store 新增方法具备单测或 API 间接覆盖，并在 `npm --prefix backend test` 通过。
  - [ ] 策略保存后，新字段与 `rawPayload.strategyConfigs` 内容一致。
  - [ ] 旧 `listRoomMappings` 调用方无需改动即可获得兼容结果。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Strategy dual-write consistency
    Tool: Bash
    Steps: 调用策略保存方法写入 formula/breakfast/guarantee -> 查询 OtaRoomMapping 与 OtaRoomType.rawPayload
    Expected: 两侧关键字段一致，查询接口返回一致值
    Evidence: .sisyphus/evidence/task-3-store-consistency.txt

  Scenario: Legacy read compatibility
    Tool: Bash
    Steps: 仅写入旧 rawPayload.strategyConfigs -> 调用 listRoomMappings
    Expected: 返回仍能解析 formula 字段，不抛异常
    Evidence: .sisyphus/evidence/task-3-store-consistency-error.txt
  ```

  **Commit**: YES | Message: `feat(ota): persist strategy and shid-srid mappings in prisma store` | Files: [`backend/src/data/ota-prisma-store.js`]

- [x] 4. 重构 OTA service：显式拆分“导入”与“发布”编排

  **What to do**: 在 `backend/src/services/ota-integration.service.js` 增加 product-center 编排方法：`importFromAtour`、`saveStrategyAndAutoPublish`、`publishHotel/Room/Strategy`、`validatePublishPayload`；复用 adapter 的 `upsertHotelProduct/upsertRoomTypeProduct/upsertRatePlanProduct` 真实发布能力；将旧 `/api/ota/products/*` 行为保持不变用于兼容。
  **Must NOT do**: 不改变旧接口响应结构；不在导入接口内隐式发布。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 服务层是核心编排与错误语义中心。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`frontend-ui-ux`] — 非前端任务。

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5, 8, 9, 12] | Blocked By: [3]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/services/ota-integration.service.js:458` — 当前 `upsertHotelProduct` 为“导入”语义。
  - Pattern: `backend/src/services/ota-integration.service.js:539` — 当前 `upsertRoomTypeProduct`。
  - Pattern: `backend/src/services/ota-integration.service.js:663` — 当前 `upsertRatePlanProduct`。
  - Pattern: `backend/src/services/ota/taobao-top.adapter.js:483` — 真正酒店发布方法。
  - Pattern: `backend/src/services/ota/taobao-top.adapter.js:523` — 真正房型发布方法。
  - Pattern: `backend/src/services/ota/taobao-top.adapter.js:574` — 真正策略发布方法。
  - Pattern: `backend/src/config/env.js:62` — OTA 相关 env 变量风格。

  **Acceptance Criteria** (agent-executable only):
  - [ ] service 提供导入与发布两组独立方法，且导入不会触发发布。
  - [ ] 自动发布路径在缺失 `shid/srid` 时返回结构化错误（含错误键）。
  - [ ] 发布成功后写入发布状态与同步日志。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Import does not publish
    Tool: Bash
    Steps: 调用 importFromAtour -> 检查同步日志类型与 adapter publish 调用计数
    Expected: 仅发生导入落库，无 publish 调用
    Evidence: .sisyphus/evidence/task-4-service-split.txt

  Scenario: Auto-publish validation failure
    Tool: Bash
    Steps: 保存策略时缺少 srid/shid 映射 -> 调用 saveStrategyAndAutoPublish
    Expected: 返回 409 类错误与 machine-readable error key；数据库保留草稿
    Evidence: .sisyphus/evidence/task-4-service-split-error.txt
  ```

  **Commit**: YES | Message: `feat(ota): split import and publish orchestration for product center` | Files: [`backend/src/services/ota-integration.service.js`, `backend/src/config/env.js`]

- [x] 5. 新增 product-center 路由并固定 API 合约

  **What to do**: 新增路由文件（建议 `backend/src/routes/ota-product-center.routes.js`）并在路由聚合注册，提供以下接口：
  - `GET /api/ota/product-center/tree?platform=FLIGGY`
  - `POST /api/ota/product-center/import-atour`
  - `POST /api/ota/product-center/mappings/hotel-shid`
  - `POST /api/ota/product-center/mappings/room-srid`
  - `POST /api/ota/product-center/strategies/save-and-publish`
  - `POST /api/ota/product-center/publish/retry`
  全部 ADMIN + 鉴权保护，错误码约定：`VALIDATION_ERROR`、`MAPPING_MISSING`、`PUBLISH_DISABLED`、`PUBLISH_FAILED`。
  **Must NOT do**: 不复用旧 `/api/ota/products/*` 作为新页面唯一接口；不返回无结构字符串错误。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 接口设计与权限控制影响前后端契约。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`playwright`] — 后端 API 定义任务。

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [8, 9, 10, 12] | Blocked By: [4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/routes/ota.routes.js:29` — OTA 路由风格（鉴权+错误处理）。
  - Pattern: `backend/src/routes/ota.routes.js:120` — mapping 接口返回风格。
  - Pattern: `backend/src/routes/index.js` — 路由注册入口。
  - Pattern: `backend/src/middleware/auth.js` — `requireAuth/requireRole` 用法。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 新路由被注册后，`GET /api/health` 与旧 OTA 接口行为不受影响。
  - [ ] 新接口在未登录、非 ADMIN、参数缺失三种情况下返回确定错误。
  - [ ] `save-and-publish` 响应含 `publishStatus`、`publishTraceId`、`errors[]` 结构。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Authorized product-center call
    Tool: Bash
    Steps: 以 ADMIN token 调用 GET /api/ota/product-center/tree
    Expected: 返回 200 且 items 为树结构数组
    Evidence: .sisyphus/evidence/task-5-routes-contract.txt

  Scenario: Role guard
    Tool: Bash
    Steps: 用 USER token 调用 POST /api/ota/product-center/strategies/save-and-publish
    Expected: 返回 403 且 message 明确无权限
    Evidence: .sisyphus/evidence/task-5-routes-contract-error.txt
  ```

  **Commit**: YES | Message: `feat(ota): add product-center routes and api contracts` | Files: [`backend/src/routes/ota-product-center.routes.js`, `backend/src/routes/index.js`]

- [x] 6. 加入发布安全阀与 mock 发布通道

  **What to do**: 增加发布开关 `OTA_PUBLISH_ENABLED`（默认 false）；当开关关闭时，`save-and-publish` 只保存并返回 `PUBLISH_DISABLED`；测试环境默认注入 mock adapter（可复用 `backend/src/services/ota/fliggy-mock.adapter.js`）。
  **Must NOT do**: 不允许默认开启真实发布；不允许测试环境误用真实 TOP 凭证。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 配置与守卫逻辑相对集中。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`frontend-ui-ux`] — 非 UI。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [9, 10, 12] | Blocked By: [4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/config/env.js:10` — boolean env 解析约定。
  - Pattern: `backend/src/services/ota/fliggy-mock.adapter.js` — mock adapter 能力。
  - Pattern: `docs/fliggy-ota-integration.md:118` — TOP 网关与凭证说明。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `OTA_PUBLISH_ENABLED=false` 时，发布动作不触发真实 adapter。
  - [ ] `OTA_PUBLISH_ENABLED=true` 且映射齐全时，发布分支可执行。
  - [ ] 测试环境运行时默认走 mock adapter。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Publish disabled gate
    Tool: Bash
    Steps: 设置 OTA_PUBLISH_ENABLED=false -> 调用 save-and-publish
    Expected: 返回 PUBLISH_DISABLED；本地策略保存成功；无真实发布调用
    Evidence: .sisyphus/evidence/task-6-publish-gate.txt

  Scenario: Publish enabled with mock adapter
    Tool: Bash
    Steps: 设置 OTA_PUBLISH_ENABLED=true + test env -> 调用 save-and-publish
    Expected: 返回 publish success（mock response）且记录 publish trace
    Evidence: .sisyphus/evidence/task-6-publish-gate-error.txt
  ```

  **Commit**: YES | Message: `chore(ota): add publish gate and test-safe mock adapter switch` | Files: [`backend/src/config/env.js`, `backend/src/services/ota-integration.service.js`]

- [x] 7. 新增独立菜单与页面容器（Feizhu Product Center）

  **What to do**: 在 `components/Sidebar.tsx` 新增独立菜单项（如 `feizhu-product-center`），在 `App.tsx` 注册新 tab 与渲染分支，创建 `views/FeizhuProductCenter.tsx` 页面壳体（加载态、错误态、空态、权限态）。
  **Must NOT do**: 不替换 `ota-platform` 菜单；不把新需求塞回 `views/OtaPlatform.tsx`。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 导航结构与页面框架属于前端交互层。
  - Skills: [`frontend-ui-ux`] — 需要页面信息架构与交互清晰度。
  - Omitted: [`playwright`] — 本任务先完成结构，不做浏览器执行。

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8, 9, 11, 12] | Blocked By: [6]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `components/Sidebar.tsx:32` — 菜单分组与 `MENU_GROUPS` 结构。
  - Pattern: `App.tsx:251` — tab 渲染 switch 模式。
  - Pattern: `views/OtaPlatform.tsx:343` — OTA 页面 state 组织风格。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 管理员可见并进入新页面；普通用户不可见或不可访问。
  - [ ] `npm run build` 通过且无 TS 错误。
  - [ ] 旧 `ota-platform` 页面入口保持可用。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Admin navigation
    Tool: Playwright
    Steps: 以 ADMIN 登录 -> 点击侧栏菜单 data-testid=menu-feizhu-product-center
    Expected: 打开新标签页并渲染页面标题“飞猪商品管理”
    Evidence: .sisyphus/evidence/task-7-page-shell.png

  Scenario: User role restriction
    Tool: Playwright
    Steps: 以 USER 登录 -> 检查侧栏
    Expected: 不显示该菜单或点击后显示“无权访问”
    Evidence: .sisyphus/evidence/task-7-page-shell-error.png
  ```

  **Commit**: YES | Message: `feat(ota-ui): add dedicated feizhu product center entry and page shell` | Files: [`components/Sidebar.tsx`, `App.tsx`, `views/FeizhuProductCenter.tsx`]

- [x] 8. 实现三层树视图与策略编辑表单（酒店->房型->策略）

  **What to do**: 在新页面实现左侧树和右侧详情区：
  - 酒店节点：展示酒店名、outer_id、映射状态（shid）。
  - 房型节点：展示房型名、outer_id、映射状态（srid）。
  - 策略节点：展示 `rateplanCode`、早餐、担保、取消政策、发布状态。
  保存策略时调用 `save-and-publish`，并在节点实时刷新发布状态。
  **Must NOT do**: 不使用不可自动化定位的随机 DOM；必须为关键控件加 `data-testid`。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 树形交互与复杂表单联动。
  - Skills: [`frontend-ui-ux`] — 需要良好信息密度与可操作性。
  - Omitted: [`git-master`] — 非 git 流程任务。

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [9, 11, 12] | Blocked By: [5, 7]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `views/OtaPlatform.tsx:599` — 已有酒店/房型选中状态与 memo 组织。
  - Pattern: `views/OtaPlatform.tsx:918` — 策略弹窗数据结构可复用。
  - Pattern: `backend/src/routes/ota.routes.js:29` — OTA 接口风格与返回模式。
  - Pattern: `backend/src/routes/index.js` — 新路由注册入口位置。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 树节点可展开/收起并保持选中状态。
  - [ ] 策略表单必填校验生效（`rateplanCode`、`breakfastCount`、`guaranteeType`、取消政策）。
  - [ ] 点击保存后自动触发发布并展示成功/失败 badge。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Tree edit and auto publish success
    Tool: Playwright
    Steps: 进入页面 -> 选中酒店节点 data-testid=hotel-node-{id} -> 选中房型节点 data-testid=room-node-{id} -> 编辑策略表单并点击 data-testid=btn-save-publish
    Expected: 出现“发布成功”状态标签，策略节点显示最新发布时间
    Evidence: .sisyphus/evidence/task-8-tree-strategy.png

  Scenario: Validation failure
    Tool: Playwright
    Steps: 清空 rateplanCode 或取消政策 -> 点击保存发布
    Expected: 阻止提交并显示字段级错误提示
    Evidence: .sisyphus/evidence/task-8-tree-strategy-error.png
  ```

  **Commit**: YES | Message: `feat(ota-ui): implement hotel-room-strategy tree and strategy editor` | Files: [`views/FeizhuProductCenter.tsx`, `components/ui/**`]

- [x] 9. 实现亚朵搜索导入 + 映射维护 + 发布失败可重试

  **What to do**: 完成新页面关键动作链路：
  - 亚朵搜索：调用 `/api/hotels/place-search`。
  - 酒店导入：调用 `/api/ota/product-center/import-atour`。
  - `shid/srid` 映射维护：调用 mapping 接口并回填树状态。
  - 发布失败重试：调用 `/api/ota/product-center/publish/retry`。
  同步显示结构化错误（`MAPPING_MISSING`、`PUBLISH_FAILED`）。
  **Must NOT do**: 不在前端拼装 TOP 参数直接请求飞猪；不吞错误。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 前端动作编排与状态管理复杂。
  - Skills: [`frontend-ui-ux`] — 需要清晰反馈与错误可恢复设计。
  - Omitted: [`playwright`] — 执行阶段 QA 再用。

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [11, 12] | Blocked By: [4, 5, 8]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/routes/hotels.routes.js:364` — 亚朵搜索参数与返回结构。
  - Pattern: `views/OtaPlatform.tsx:1078` — 内部酒店搜索与绑定交互参考。
  - API/Type: `docs/商品发布流程.md` — `shid/srid` 必填背景。
  - Pattern: `backend/src/routes/ota.routes.js:29` — 新接口实现应遵循的统一风格。
  - Pattern: `backend/src/routes/index.js` — 新路由挂载点。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 可通过亚朵关键词搜索并导入至少 1 家酒店及其房型。
  - [ ] 未配置 `shid/srid` 时，保存发布返回可识别错误并引导补全映射。
  - [ ] 映射补全后可一键重试发布并成功。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Import -> map -> publish retry success
    Tool: Playwright
    Steps: 搜索“亚朵” -> 选择一条结果导入 -> 不配映射直接发布(应失败) -> 补全 shid/srid -> 点击重试
    Expected: 首次失败错误码 MAPPING_MISSING，重试后状态变为发布成功
    Evidence: .sisyphus/evidence/task-9-import-mapping-retry.png

  Scenario: Atour search empty result
    Tool: Playwright
    Steps: 输入罕见关键词并搜索
    Expected: 显示“无匹配结果”空态，不出现 JS 异常
    Evidence: .sisyphus/evidence/task-9-import-mapping-retry-error.png
  ```

  **Commit**: YES | Message: `feat(ota-ui): add atour import flow mapping maintenance and publish retry` | Files: [`views/FeizhuProductCenter.tsx`, `services/**`, `types.ts`]

- [x] 10. 补齐后端 API 核心用例（导入、映射、自动发布、失败分支）

  **What to do**: 基于任务 1 的测试基建，新增 product-center API 测试：
  - 导入成功（写入酒店/房型）。
  - 缺失映射发布失败（`MAPPING_MISSING`）。
  - 开关关闭发布失败（`PUBLISH_DISABLED`）。
  - 映射齐全发布成功（mock adapter）。
  - 旧 `/api/ota/products/*` 回归不变。
  **Must NOT do**: 不写只断言 200 的空洞测试；不跳过失败分支。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 涵盖多分支与兼容回归。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`frontend-ui-ux`] — 非 UI。

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [12] | Blocked By: [2, 3, 5, 6]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `backend/src/routes/ota.routes.js` — 既有 OTA API 回归参考。
  - Pattern: `backend/src/app.js:9` — Supertest app 入口。
  - Pattern: `backend/src/services/ota/fliggy-mock.adapter.js` — 测试发布模拟。
  - Pattern: `backend/src/routes/ota.routes.js` — 旧接口风格与兼容基线。
  - Pattern: `backend/src/routes/index.js` — 路由聚合注册。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm --prefix backend test -- product-center` 通过。
  - [ ] 覆盖至少 1 个成功链路 + 3 个失败链路。
  - [ ] 回归用例覆盖旧产品接口不变。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Product center API suite
    Tool: Bash
    Steps: 运行 npm --prefix backend test -- product-center
    Expected: 所有 product-center 相关测试通过
    Evidence: .sisyphus/evidence/task-10-api-tests.txt

  Scenario: Legacy endpoint regression
    Tool: Bash
    Steps: 运行 npm --prefix backend test -- ota-products-legacy
    Expected: 旧接口行为断言保持通过
    Evidence: .sisyphus/evidence/task-10-api-tests-error.txt
  ```

  **Commit**: YES | Message: `test(ota): cover product-center import mapping and publish flows` | Files: [`backend/tests/ota/**`]

- [ ] 11. 前端可构建与核心交互自动化验收（新页 + 旧页回归）

  **What to do**: 对前端执行构建与关键流程自动化：新页面导入/映射/发布链路 + 旧 `ota-platform` 可访问 smoke；如新增 `data-testid`，确保命名稳定并写入 QA 脚本。
  **Must NOT do**: 不仅做截图不做断言；不忽略旧页入口回归。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 前端交互回归与可测试性增强。
  - Skills: [`playwright`] — 需要浏览器自动化验证交互链路。
  - Omitted: [`git-master`] — 非 git 操作。

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [12] | Blocked By: [7, 8, 9]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `views/OtaPlatform.tsx` — 旧页回归目标与交互参考。
  - Pattern: `App.tsx:251` — tab 切换与渲染行为。
  - Pattern: `components/Sidebar.tsx:32` — 菜单入口可见性逻辑。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run build` 成功。
  - [ ] 自动化脚本完成新页面 happy/failure 各 1 条。
  - [ ] 自动化脚本确认旧 `ota-platform` 可进入并加载。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: New page happy flow
    Tool: Playwright
    Steps: 登录 ADMIN -> 进入飞猪商品管理 -> 完成导入与发布
    Expected: 页面提示发布成功，树节点状态更新为 SUCCESS
    Evidence: .sisyphus/evidence/task-11-ui-regression.png

  Scenario: Old page smoke
    Tool: Playwright
    Steps: 打开 OTA中台旧页
    Expected: 页面可加载且核心按钮（同步酒店）可见
    Evidence: .sisyphus/evidence/task-11-ui-regression-error.png
  ```

  **Commit**: YES | Message: `test(ota-ui): add playwright regression for new and legacy ota pages` | Files: [`playwright/**`, `views/FeizhuProductCenter.tsx`]

- [ ] 12. 收口发布文档与运行手册（含开关、映射、排障）

  **What to do**: 更新文档，明确新页面流程、接口列表、`OTA_PUBLISH_ENABLED` 行为、`shid/srid` 维护路径、常见错误码与排障步骤；补充本地联调与测试执行命令。
  **Must NOT do**: 不写与实现不一致的字段定义；不遗漏失败分支说明。

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: 以可执行运维文档为主。
  - Skills: `[]` — 无额外技能依赖。
  - Omitted: [`frontend-ui-ux`] — 非视觉实现。

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [] | Blocked By: [1, 2, 4, 5, 6, 8, 9, 10, 11]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `docs/fliggy-ota-integration.md` — OTA 文档结构模板。
  - Pattern: `docs/商品发布流程.md` — 字段来源与飞猪 API 要求。
  - Pattern: `README.md` — 环境变量与本地运行说明风格。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 文档列出新接口、请求示例、错误码、恢复步骤。
  - [ ] 文档中所有命令可在本地执行（至少语法正确）。
  - [ ] 包含新旧页面并行说明，避免误操作。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```text
  Scenario: Runbook command verification
    Tool: Bash
    Steps: 按文档顺序执行关键命令（prisma/test/build）
    Expected: 命令可执行且与文档描述一致
    Evidence: .sisyphus/evidence/task-12-runbook.txt

  Scenario: Error code playbook check
    Tool: Bash
    Steps: 人为触发 MAPPING_MISSING 与 PUBLISH_DISABLED
    Expected: 文档中能定位到对应排障步骤并可恢复
    Evidence: .sisyphus/evidence/task-12-runbook-error.txt
  ```

  **Commit**: YES | Message: `docs(ota): add feizhu product center runbook and troubleshooting` | Files: [`docs/fliggy-ota-integration.md`, `README.md`, `docs/商品发布流程.md`]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- 按能力切片提交，禁止单一超大提交。
- 推荐提交序列：test infra -> schema/store -> service/routes -> frontend page -> regression/docs。
- 统一 commit message 风格：`feat(ota): ...` / `test(ota): ...` / `chore(ota): ...`。

## Success Criteria
- 管理员可在新页面完成：搜索亚朵酒店 -> 导入酒店/房型 -> 配置策略 -> 保存并自动发布飞猪。
- 发布失败具备结构化错误与日志可追踪，成功有平台侧回执落库。
- 既有 OTA 页面功能不回归。
- 最小后端 API 自动化测试在本地可重复通过。
