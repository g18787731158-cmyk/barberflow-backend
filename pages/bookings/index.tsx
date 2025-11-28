// pages/bookings/index.tsx
import Link from 'next/link'

export default function LegacyBookingsPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont',
        background: '#111',
        color: '#f5f5f5',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        旧版预约列表（已下线）
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
        这个页面是我们早期测试用的版本，现在系统已经升级到新的
        <code style={{ padding: '2px 6px', background: '#222', borderRadius: 4, marginLeft: 4, marginRight: 4 }}>
          /admin/bookings
        </code>
        管理页。
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
        数据库结构已经更新，旧代码不再兼容，所以这里不再直接查数据库。
      </p>

      <Link
        href="/admin/bookings"
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          borderRadius: 999,
          border: '1px solid #fff',
          textDecoration: 'none',
          color: '#111',
          background: '#fff',
          fontWeight: 600,
        }}
      >
        去新的预约管理页
      </Link>
    </main>
  )
}
