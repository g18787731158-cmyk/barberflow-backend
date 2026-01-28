# DB Migration Policy

目标：降低生产迁移炸库概率；明确允许/禁止边界；保证流程可回溯。

## 核心原则
- **生产只允许 `prisma migrate deploy`**。
- **生产禁止 `prisma db push` / `prisma migrate dev`**。
- 任何高风险变更必须走手工 SQL Runbook。

## 标准流程
1) 本地开发：写 schema + 生成 migration
2) PR 审核：确认风险等级 + 变更说明
3) Staging（可选）：演练迁移与回滚
4) Production：仅 `migrate deploy`（见下文命令）

## 命名规范
- migration 名称需描述变更意图（例如 `add_booking_status_index`）
- 不允许模糊命名（如 `update` / `fix`）

## Allow / Block
**Allow（可走迁移）**
- 新增表/列
- 新增索引（非阻塞方式）
- 新增 enum 值（若存在 enum）

**Block（必须走手工 SQL Runbook）**
- DROP 表/列
- 列类型缩窄
- 大表重写/回填
- 全表 UPDATE / DELETE（无 WHERE）
- 非幂等 SQL

## 回滚策略
- Prisma 迁移 **不提供自动回滚**。
- 生产迁移前必须有备份/快照。
- 紧急回滚优先：回滚 SQL + 快照恢复。

## 生产执行命令（仅 deploy）
```bash
ALLOW_DB_MIGRATIONS=1 NODE_ENV=production npm run db:migrate:deploy
```

