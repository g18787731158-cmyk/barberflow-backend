import prisma from '@/lib/prisma'
import ShopBillingForm from './ShopBillingForm'

export const runtime = 'nodejs'

export default async function ShopSettingsPage() {
  // MVP：先固定 shopId=1（后续你做登录/多店再动态）
  const shopId = 1

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      name: true,
      platformShareBasis: true,
      barberShareBasis: true,
      updatedAt: true,
    },
  })

  if (!shop) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold">店铺不存在</div>
        <div className="text-sm text-gray-500 mt-2">shopId={shopId}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">店铺设置</h1>
              <p className="mt-1 text-sm text-gray-500">
                {shop.name}（ID: {shop.id}）
              </p>
            </div>
            <div className="text-xs text-gray-400">
              updated: {new Date(shop.updatedAt).toLocaleString()}
            </div>
          </div>

          <div className="mt-6">
            <ShopBillingForm
              shopId={shop.id}
              platformShareBasis={shop.platformShareBasis}
              barberShareBasis={shop.barberShareBasis}
            />
          </div>

          <div className="mt-6 text-xs text-gray-500">
            说明：费率保存为 <span className="font-mono">bps</span>（万分比），2% = 200，7% = 700。页面输入用百分比更直观。
          </div>
        </div>
      </div>
    </div>
  )
}
