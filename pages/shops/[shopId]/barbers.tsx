// pages/shops/[shopId]/barbers.tsx
import type { GetServerSideProps } from 'next'
import { prisma } from '@/lib/prisma'

type Props = {
  shopId: number
  shopName: string
  barbers: { id: number; name: string; workStartHour: number; workEndHour: number }[]
}

export default function ShopBarbersPage(props: Props) {
  return (
    <main style={{ padding: 24 }}>
      <h1>门店：{props.shopName}（ID: {props.shopId}）</h1>
      <ul>
        {props.barbers.map((b) => (
          <li key={b.id}>
            #{b.id} {b.name}（{b.workStartHour}:00 - {b.workEndHour}:00）
          </li>
        ))}
      </ul>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const shopId = Number(ctx.params?.shopId || 0)
  if (!shopId) return { notFound: true }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      // ✅ 关键：字段名是 barber
      barber: { orderBy: { id: 'asc' } },
    },
  })

  if (!shop) return { notFound: true }

  return {
    props: {
      shopId,
      shopName: shop.name,
      barbers: shop.barber.map((b) => ({
        id: b.id,
        name: b.name,
        workStartHour: b.workStartHour,
        workEndHour: b.workEndHour,
      })),
    },
  }
}
