import Link from 'next/link'

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#fff',
        padding: '40px 20px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
        }}
      >
        {/* 顶部标题 */}
        <header style={{ marginBottom: '32px' }}>
          <div
            style={{
              fontSize: '13px',
              opacity: 0.7,
              marginBottom: '4px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            BarberFlow · 1.0 内测
          </div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 600,
              marginBottom: '10px',
            }}
          >
            理发店预约 & 营收小助手
          </h1>
          <p
            style={{
              fontSize: '14px',
              opacity: 0.8,
              lineHeight: 1.6,
            }}
          >
            目前支持：单门店、多理发师。
            客人可以在线选理发师、选项目、选时间；
            老板可以在后台查看今日预约和预估营收。
          </p>
        </header>

        {/* 入口卡片 */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* 客人入口 */}
          <Link
            href="/booking"
            style={{
              display: 'block',
              padding: '16px 18px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.2)',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                opacity: 0.9,
                marginBottom: 4,
              }}
            >
              客人入口
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              我要在线预约理发
            </div>
            <div
              style={{
                fontSize: '12px',
                opacity: 0.8,
              }}
            >
              选择理发师 · 选择项目 · 选择时间格，一键提交预约
            </div>
          </Link>

          {/* 老板入口 */}
          <Link
            href="/admin/bookings"
            style={{
              display: 'block',
              padding: '16px 18px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: '#111',
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                opacity: 0.9,
                marginBottom: 4,
              }}
            >
              老板 / 店长入口
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              查看今日预约 & 实收统计
            </div>
            <div
              style={{
                fontSize: '12px',
                opacity: 0.8,
              }}
            >
              按日期和理发师筛选，查看预约状态、本日营收、本理发师实收
            </div>
          </Link>
        </section>

        {/* 底部说明 */}
        <footer
          style={{
            fontSize: '11px',
            opacity: 0.6,
            lineHeight: 1.6,
          }}
        >
          当前版本：BarberFlow 1.0（店内自用测试版）。
          仅支持单门店、无登录权限控制。
          后续 2.0 将接入微信小程序、支持更多门店和账号体系。
        </footer>
      </div>
    </main>
  )
}
