import Link from 'next/link'

const ENTRIES = [
  {
    title: '店主管理',
    desc: '看预约、看收入、调排班，一站式门店经营面板。',
    href: '/shop-owner',
    tag: 'Shop Owner',
  },
  {
    title: '理发师后台',
    desc: '今日预约、个人业绩、快速标记完成。',
    href: '/barber',
    tag: 'Barber Console',
  },
  {
    title: '客户页面',
    desc: '自助预约与查询，复约更方便。',
    href: '/customer',
    tag: 'Customer Portal',
  },
  {
    title: '平台管理',
    desc: '全站门店、收入、支付、预约监控。',
    href: '/platform',
    tag: 'Platform Command',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <header className="mb-10">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-400">BarberFlow OS</div>
            <h1 className="mt-3 text-4xl font-semibold" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              理发店 SaaS · H5 运营中枢
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-neutral-400">
              统一入口，覆盖店主、理发师、客户与平台管理员。轻量移动端体验，支持桌面查看。
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            {ENTRIES.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 transition hover:border-neutral-300"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{item.tag}</div>
                <div className="mt-2 text-2xl font-semibold group-hover:text-white">
                  {item.title}
                </div>
                <div className="mt-2 text-sm text-neutral-400">{item.desc}</div>
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-300">
                  进入控制台
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </Link>
            ))}
          </section>

          <section className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-xs text-neutral-400">核心能力</div>
              <div className="mt-3 text-sm text-neutral-300">
                预约、排班、收入与支付闭环，实时运营回路。
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-xs text-neutral-400">多角色协同</div>
              <div className="mt-3 text-sm text-neutral-300">
                店主看经营，理发师看工单，客户看预约，平台看全局。
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-xs text-neutral-400">部署与运维</div>
              <div className="mt-3 text-sm text-neutral-300">
                ECS 部署脚本已就绪，支持零停机部署与回滚。
              </div>
            </div>
          </section>

          <footer className="mt-12 text-xs text-neutral-500">
            当前版本：BarberFlow OS · H5 合集入口。建议移动端访问体验更佳。
          </footer>
        </div>
      </div>
    </main>
  )
}
