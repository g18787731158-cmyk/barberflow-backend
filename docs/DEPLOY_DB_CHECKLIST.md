# Deploy DB Checklist

## 上线前
- [ ] 已备份/快照（可回滚）
- [ ] 迁移风险等级已标注（LOW/MED/HIGH）
- [ ] 迁移在 staging 演练通过（如有）
- [ ] `npm run db:audit` 已更新风险登记
- [ ] 关键 API 读写路径确认（bookings/create / today stats / pay flow）

## 上线后
- [ ] `bookings/create` 正常
- [ ] `dashboard/today` 正常
- [ ] `barber/today` 正常
- [ ] `miniapp/pay/create` 正常

