# BarberFlow Backend 快速体检

生成时间：2026-01-24

## 1) 项目结构与入口（Next.js 路由/启动方式/关键目录）

- 运行方式：`npm run dev` / `npm run build` + `npm start`（Next.js 16，`output: "standalone"`）。
- 路由结构：同时存在 `app/`（App Router）与 `pages/`（Pages Router）。
  - App Router 入口：`app/page.tsx`，全局布局 `app/layout.tsx`。
  - App API 入口：`app/api/**/route.ts`（如 `app/api/bookings/*`、`app/api/admin/*`）。
  - Pages Router 页面：`pages/**`（如 `pages/shops/*`、`pages/bookings/*`）。
  - Pages API 入口：`pages/api/**`（`pages/api/bookings/*`、`pages/api/shops/*` 等）。
- 关键目录：
  - `app/`：主前端与新 API 路由。
  - `pages/`：旧页面/旧 API（可能与 app/api 重复）。
  - `lib/`：Prisma client、状态工具、时间处理。
  - `prisma/`：schema + migrations + 若干手工 SQL。
  - `deploy.sh`：服务器部署脚本（pm2 + nginx）。

## 2) 配置与安全（env 使用、密钥/支付相关敏感点、部署脚本风险）

- 环境变量使用集中在：
  - 微信登录：`WECHAT_MP_APPID` / `WECHAT_MP_SECRET`（`app/api/wx/login`, `app/api/miniapp/*`）。
  - 管理员接口：`ADMIN_TOKEN` 只在 `app/api/admin/barbers` 中校验。
  - 绑定口令：`BARBER_BIND_CODE`（`app/api/miniapp/bind-barber`）。
- 高风险点（建议优先修复）：
  - **多数 admin 接口未鉴权**：
    - `app/api/admin/bookings/*`、`app/api/admin/timeoff`、`app/api/admin/shops/update-billing` 等没有 `ADMIN_TOKEN` 或其他校验。
  - **支付相关 mock 接口无保护**：
    - `app/api/miniapp/pay/mock-success` 可直接将任意 `booking` 标记为已支付。
    - `app/api/miniapp/pay/create` 未校验用户身份/订单归属。
  - **公开测试接口**：`app/api/test-pay` 在生产环境存在风险。
- 部署脚本风险点（`deploy.sh`）：
  - `git reset --hard` + `git clean -fd` 会清理未提交文件（虽然排除了 `.env*` 和 `scripts/`，仍需确认其他运行时文件）。
  - `sudo nginx -t` / `systemctl reload nginx` 依赖 sudo，部署失败会触发 rollback 但仍可能影响服务可用性。
  - `curl /api/health` 仅本机检查，未覆盖外部链路。

## 3) Prisma 模型与迁移风险点（破坏性变更、索引、关系）

- 模型概览：`shop`、`barber`、`service`、`booking`、`ledger`、`barbertimeoff`。
- 索引/约束：
  - `booking`：`@@unique([barberId, startTime, slotLock])`，并对 `barberId`/`shopId`/`serviceId`/`phone` 建索引。
  - `barber`：`openid` 唯一索引（新增迁移 `202601140002_add_barber_openid`）。
- 迁移与潜在破坏性变更：
  - legacy 迁移中包含 **drop table/column** 与 **新增必填字段**（`20251124181322_add_booking_unique_barber_time`）：对已有数据不安全，需要确保在生产已完成且无遗留数据。
  - `booking` 使用 `slotLock` + unique 组合防并发，取消时将 `slotLock` 设为 `NULL`；MySQL 允许 `NULL` 唯一索引重复，这符合“取消后允许重订”的设计，但要确保业务逻辑同步。
- 风险点：
  - `shadowDatabaseUrl` 必填（schema 中要求），若缺失会导致 Prisma migrate/dev 失败。
  - `prisma/` 下存在手工 SQL（`booking*.sql`），容易造成 schema 与迁移历史不一致。

## 4) 代码质量与潜在坑（类型、错误处理、重复逻辑、边界条件）

- **安全/鉴权一致性**：
  - 只有 `app/api/admin/barbers` 做了 `ADMIN_TOKEN` 校验，其余 admin 与订单关键接口缺失鉴权。
- **支付与结算流程**：
  - 目前为 mock 支付；没有签名校验/回调验真，也没有订单归属校验。
- **时间与时区处理不一致**：
  - 部分接口使用中国时区（`+08:00`），部分使用服务器本地时区（`new Date(y, m, d, 0,0,0)`）。
  - `app/api/bookings` 与 `app/api/miniapp/bookings` 的时间构造逻辑不同，可能在跨时区部署时产生偏差。
- **状态常量重复且不统一**：
  - `lib/status.ts` 与 `lib/bookingStatus.ts` 维护两套状态（`CANCELED` / `CANCELLED`），易导致状态分支遗漏。
- **文件异常**：
  - `lib/time.ts` 文件中混入了 Prisma client 代码并 `export default prisma`，与 `lib/prisma.ts` 重复，且会引发“无意创建 PrismaClient”与模块导出混乱。
- **缺少类型/校验统一层**：
  - API 里大量 `any`/手写 parse，缺少统一 schema 校验（如 zod），增加边界输入问题。

## 最值得先修的 Top 5

1) **统一鉴权/授权**：为所有 `app/api/admin/**` 与支付/结算/预约状态修改接口加鉴权与权限校验。
2) **下线或保护 mock 支付与测试接口**：禁用 `miniapp/pay/mock-success`、`test-pay`，并添加支付回调签名校验与订单归属校验。
3) **修复 `lib/time.ts` 混入 PrismaClient**：拆分/清理，避免意外导出和重复连接。
4) **时区处理统一**：明确统一使用 `+08:00` 或 UTC，并抽成公共工具，避免跨服务/跨环境时间漂移。
5) **状态常量与迁移历史整理**：合并状态定义（取消 `CANCELED/CANCELLED` 混用），并明确 legacy SQL/迁移来源以避免 schema 漂移。
