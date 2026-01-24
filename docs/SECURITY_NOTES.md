# Security Notes

生成时间：2026-01-24

## 受保护的 endpoints

- `app/api/admin/barbers` (GET/POST)
- `app/api/admin/bookings` (GET)
- `app/api/admin/bookings/[id]` (PATCH)
- `app/api/admin/bookings/update-status` (POST)
- `app/api/admin/bookings/complete-and-settle` (POST)
- `app/api/admin/shops/update-billing` (POST)
- `app/api/admin/timeoff` (GET/POST)
- `app/api/miniapp/pay/mock-success` (POST, 非生产环境 + ADMIN_TOKEN)
- `app/api/test-pay` (POST, 非生产环境 + ADMIN_TOKEN)

## 鉴权方式

- Header `Authorization: Bearer <ADMIN_TOKEN>` 或 `x-admin-token: <ADMIN_TOKEN>`。
- `ADMIN_TOKEN` 未配置时会拒绝（500）。
- `miniapp/pay/mock-success` 与 `test-pay` 在生产环境直接返回 404。

## pages/api legacy endpoints

这些 legacy endpoints 在 production 返回 404；非生产需要 ADMIN_TOKEN（Bearer 或 x-admin-token）。

- `pages/api/barbers/create`
- `pages/api/bookings/create`
- `pages/api/bookings/update-status`
- `pages/api/services/create`
- `pages/api/shops/create`

## 手工测试步骤（建议）

1) 未带 token 访问 admin 接口，确认 401：
   - `curl -i http://localhost:3000/api/admin/bookings?date=2026-01-24`

2) 带 token 访问 admin 接口，确认 200：
   - `curl -i -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/bookings?date=2026-01-24`

3) 非生产环境访问 mock 支付：
   - `curl -i -H "x-admin-token: $ADMIN_TOKEN" -X POST http://localhost:3000/api/miniapp/pay/mock-success -d '{"bookingId":1}'`

4) 生产环境访问 mock 支付（预期 404）：
   - `NODE_ENV=production curl -i -X POST http://localhost:3000/api/miniapp/pay/mock-success`

5) miniapp pay create 订单归属校验：
   - 传入错误的 `customerOpenid/customerId`，预期 403。
