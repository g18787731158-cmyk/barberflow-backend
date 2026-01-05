'use client'

import type React from 'react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Service = {
  id: number
  name: string
  price: number
  durationMinutes: number
}

type Barber = {
  id: number
  name: string
}

type SuccessInfo = {
  userName: string
  barberName: string
  serviceName: string
  price: number
  dateStr: string   // YYYY-MM-DD
  timeStr: string   // HH:mm
}

const WORK_START_HOUR = 10 // 10:00 开始
const WORK_END_HOUR = 21 // 21:00 结束
const MIN_ADVANCE_MINUTES = 60 // ⭐ 需提前 60 分钟预约（想改成 2 小时就填 120）

// 生成一天内的半小时时间点，如 ["10:00","10:30",...]
function generateTimeSlots() {
  const slots: string[] = []
  for (let h = WORK_START_HOUR; h <= WORK_END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    if (h !== WORK_END_HOUR) {
      slots.push(`${String(h).padStart(2, '0')}:30`)
    }
  }
  return slots
}

// 把 Date 变成 "YYYY-MM-DD"
function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type DayItem = {
  label: string // 显示的文字，比如“今天”/“11-21”
  dateStr: string // 真正用于查询的日期：YYYY-MM-DD
  weekLabel: string // 周几：周一、周二…
}

// 生成接下来几天的日期按钮（包含今天）
function generateNextDays(count: number): DayItem[] {
  const result: DayItem[] = []
  const now = new Date()
  const weekNames = ['日', '一', '二', '三', '四', '五', '六']

  for (let i = 0; i < count; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)

    const dateStr = formatDate(d) // YYYY-MM-DD
    const weekLabel = `周${weekNames[d.getDay()]}`
    let label = dateStr.slice(5).replace('-', '/') // 变成 "11/20"

    if (i === 0) label = '今天'
    if (i === 1) label = '明天'

    result.push({ label, dateStr, weekLabel })
  }

  return result
}

export default function BookingPage() {
  const [userName, setUserName] = useState('')
  const [phone, setPhone] = useState('')

  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null)
  const [loadingServices, setLoadingServices] = useState(false)

  const [barbers, setBarbers] = useState<Barber[]>([])
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null)
  const [loadingBarbers, setLoadingBarbers] = useState(false)

  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const dayItems = useMemo(() => generateNextDays(7), [])
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)

  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 预约成功后的信息卡片
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null)

  // 加载服务列表
  useEffect(() => {
    async function fetchServices() {
      try {
        setLoadingServices(true)
        const res = await fetch('/api/services')
        const data = await res.json()
        if (!res.ok) {
          console.error(data)
          setMessage('获取服务列表失败，请稍后刷新再试')
          return
        }
        setServices(data.services || [])
        if (data.services && data.services.length > 0) {
          setSelectedServiceId(data.services[0].id)
        }
      } catch (err) {
        console.error(err)
        setMessage('获取服务列表失败，请检查网络')
      } finally {
        setLoadingServices(false)
      }
    }
    fetchServices()
  }, [])

  // 加载理发师列表
  useEffect(() => {
    async function fetchBarbers() {
      try {
        setLoadingBarbers(true)
        const res = await fetch('/api/barbers')
        const data = await res.json()
        if (!res.ok) {
          console.error(data)
          setMessage('获取理发师列表失败，请稍后重试')
          return
        }
        setBarbers(data.barbers || [])
        if (data.barbers && data.barbers.length > 0) {
          setSelectedBarberId(data.barbers[0].id)
        }
      } catch (err) {
        console.error(err)
        setMessage('获取理发师列表失败，请检查网络')
      } finally {
        setLoadingBarbers(false)
      }
    }

    fetchBarbers()
  }, [])

  // 根据日期 & 理发师，加载当天已占用的时间格
  useEffect(() => {
    async function fetchAvailability() {
      if (!selectedDate || !selectedBarberId) return
      try {
        setLoadingAvailability(true)
        const res = await fetch(
          `/api/availability?date=${selectedDate}&barberId=${selectedBarberId}`,
        )
        const data = await res.json()
        if (!res.ok) {
          console.error(data)
          setMessage('获取当天预约情况失败')
          return
        }
        setOccupiedSlots(data.occupiedSlots || [])
      } catch (err) {
        console.error(err)
        setMessage('获取当天预约情况失败，请检查网络')
      } finally {
        setLoadingAvailability(false)
      }
    }

    fetchAvailability()
  }, [selectedDate, selectedBarberId])

  const selectedService = services.find((s) => s.id === selectedServiceId)
  const needBlocks = selectedService
    ? Math.max(1, Math.ceil(selectedService.durationMinutes / 30))
    : 1

  // 判断某个时间格是否可用
  const isSlotDisabled = (slot: string, index: number) => {
    // 没选服务 / 没选理发师，都不允许点
    if (!selectedService || !selectedBarberId) return true

    // ⭐ 1）当天：不能约已经过去 / 不够提前的时间
    const todayStr = formatDate(new Date())
    if (selectedDate === todayStr) {
      const now = new Date()
      const [hourStr, minuteStr] = slot.split(':')
      const slotHour = Number(hourStr)
      const slotMinute = Number(minuteStr)

      const slotTime = new Date()
      slotTime.setHours(slotHour, slotMinute, 0, 0)

      const diffMs = slotTime.getTime() - now.getTime()
      const diffMinutes = diffMs / 60000

      // diffMinutes < MIN_ADVANCE_MINUTES: 不满足“需提前预约”规则
      if (diffMinutes < MIN_ADVANCE_MINUTES) {
        return true
      }
    }

    // ⭐ 2）本格已被其它预约占用
    if (occupiedSlots.includes(slot)) return true

    // ⭐ 3）检查后面要占用的连续格子
    for (let k = 0; k < needBlocks; k++) {
      const s = timeSlots[index + k]
      if (!s) {
        // 超出营业时间
        return true
      }
      if (occupiedSlots.includes(s)) {
        return true
      }
    }

    return false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!userName) {
      setMessage('请先填写姓名')
      return
    }

    // ⭐ 手机号校验：不填可以，填了必须是 11 位数字
    const trimmedPhone = phone.trim()
    if (trimmedPhone) {
      const digitsOnly = trimmedPhone.replace(/\s+/g, '')
      if (!/^\d{11}$/.test(digitsOnly)) {
        setMessage('手机号格式不太对，请检查后再提交')
        return
      }
    }

    if (!selectedService || !selectedServiceId) {
      setMessage('请选择服务项目')
      return
    }
    if (!selectedBarberId) {
      setMessage('请选择理发师')
      return
    }
    if (!selectedTimeSlot) {
      setMessage('请选择预约时间')
      return
    }

    // 组合成完整时间：YYYY-MM-DDTHH:MM
    const startTime = `${selectedDate}T${selectedTimeSlot}:00+08:00`

    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          phone: trimmedPhone || undefined,
          shopId: 1,
          barberId: selectedBarberId, // ✅ 用选中的理发师
          serviceId: selectedServiceId,
          startTime,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessage(data?.error || '预约失败，请稍后再试')
        setSuccessInfo(null)
      } else {
        // 找到当前理发师 & 项目名称
        const barber = barbers.find((b) => b.id === selectedBarberId)
        const service = selectedService

        if (barber && service && selectedTimeSlot) {
          setSuccessInfo({
            userName: userName || '客人',
            barberName: barber.name,
            serviceName: service.name,
            price: service.price,
            dateStr: selectedDate,
            timeStr: selectedTimeSlot,
          })
        } else {
          setSuccessInfo(null)
        }

        setMessage(null) // 成功就不用底部那行 message 了
        setUserName('')
        setPhone('')
        setSelectedTimeSlot(null)

        // 重新拉取当天占用情况，让刚预约的时间段自动变灰
        setOccupiedSlots([])
        if (selectedBarberId) {
          const res2 = await fetch(
            `/api/availability?date=${selectedDate}&barberId=${selectedBarberId}`,
          )
          const data2 = await res2.json()
          if (res2.ok) {
            setOccupiedSlots(data2.occupiedSlots || [])
          }
        }
      }
    } catch (err) {
      console.error(err)
      setMessage('网络异常，请稍后再试')
      setSuccessInfo(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 20px',
        backgroundColor: '#000',
        color: '#fff',
      }}
    >
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
        理发预约 – 客人页面（时间格子版）
      </h1>

      {/* 预约成功卡片 */}
      {successInfo && (
        <section
          style={{
            maxWidth: '460px',
            marginBottom: '20px',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.25)',
            background:
              'linear-gradient(135deg, rgba(46,204,113,0.25), rgba(0,0,0,0.8))',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              marginBottom: 6,
            }}
          >
            ✅ 预约已提交成功
          </div>
          <div
            style={{
              fontSize: '13px',
              lineHeight: 1.6,
              opacity: 0.95,
            }}
          >
            <div>
              客人：<strong>{successInfo.userName}</strong>
            </div>
            <div>
              理发师：<strong>{successInfo.barberName}</strong>
            </div>
            <div>
              项目：<strong>{successInfo.serviceName}</strong>
            </div>
            <div>
              时间：
              <strong>
                {successInfo.dateStr} {successInfo.timeStr}
              </strong>
            </div>
            <div>
              预估金额：<strong>¥{successInfo.price}</strong>
            </div>
          </div>
          <p
            style={{
              marginTop: 8,
              fontSize: '12px',
              opacity: 0.8,
              lineHeight: 1.6,
            }}
          >
            请按时到店，如需改时间或取消，可直接电话联系理发店。
            如果需要帮家人 / 朋友再预约一单，可以继续在下面填写。
          </p>

          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            <Link
              href="/"
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.6)',
                fontSize: '12px',
                textDecoration: 'none',
                color: '#fff',
              }}
            >
              返回首页
            </Link>
          </div>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <label>
          姓名：
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            placeholder="请输入姓名"
          />
        </label>

        <label>
          手机号（可选）：
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            placeholder="方便联系就填一下（11 位手机号）"
          />
        </label>

        <label>
          服务项目：
          {loadingServices ? (
            <div style={{ marginTop: '4px' }}>正在加载服务列表…</div>
          ) : services.length === 0 ? (
            <div style={{ marginTop: '4px', color: '#f88' }}>
              暂无服务项目，请先在后台添加
            </div>
          ) : (
            <select
              value={selectedServiceId ?? ''}
              onChange={(e) => setSelectedServiceId(Number(e.target.value))}
              style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}（约 {service.durationMinutes} 分钟，¥
                  {service.price}）
                </option>
              ))}
            </select>
          )}
        </label>

        {/* 理发师选择 */}
        <label>
          理发师：
          {loadingBarbers ? (
            <div style={{ marginTop: '4px' }}>正在加载理发师…</div>
          ) : barbers.length === 0 ? (
            <div style={{ marginTop: '4px', color: '#f88' }}>
              暂无理发师，请先在后台添加
            </div>
          ) : (
            <select
              value={selectedBarberId ?? ''}
              onChange={(e) => setSelectedBarberId(Number(e.target.value))}
              style={{ width: '100%', padding: '8px', marginTop: '4px' }}
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </label>

        {selectedService && (
          <div style={{ fontSize: '13px', opacity: 0.85 }}>
            当前选择：{selectedService.name}，预计耗时{' '}
            {selectedService.durationMinutes} 分钟
            （按 30 分钟一格，会占用 {needBlocks} 格）。
          </div>
        )}

        {/* 日期选择 */}
        <div style={{ marginTop: '8px', fontSize: '14px' }}>
          预约日期（点击选择）：
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}
        >
          {dayItems.map((day) => {
            const isActive = selectedDate === day.dateStr
            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => {
                  setSelectedDate(day.dateStr)
                  setSelectedTimeSlot(null) // 切换日期时清空时间
                }}
                style={{
                  minWidth: '80px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: isActive
                    ? '2px solid #fff'
                    : '1px solid rgba(255,255,255,0.3)',
                  backgroundColor: isActive ? '#fff' : 'transparent',
                  color: isActive ? '#000' : '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <div>{day.weekLabel}</div>
                <div style={{ marginTop: 2 }}>{day.label}</div>
              </button>
            )
          })}
        </div>

        {/* 时间格子 */}
        <div style={{ marginTop: '8px', fontSize: '14px' }}>
          预约时间（点击下方时间格）：
        </div>

        {loadingAvailability ? (
          <div style={{ marginTop: '4px' }}>正在加载当天预约情况…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            {timeSlots.map((slot, index) => {
              const disabled = isSlotDisabled(slot, index)
              const isActive = selectedTimeSlot === slot

              return (
                <button
                  key={slot}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setSelectedTimeSlot(slot)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '6px',
                    border: isActive
                      ? '2px solid #fff'
                      : '1px solid rgba(255,255,255,0.3)',
                    backgroundColor: disabled
                      ? 'rgba(255,255,255,0.06)'
                      : isActive
                      ? '#fff'
                      : 'transparent',
                    color: disabled
                      ? 'rgba(255,255,255,0.35)'
                      : isActive
                      ? '#000'
                      : '#fff',
                    fontSize: '13px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {slot}
                  <br />
                  <span style={{ fontSize: '11px' }}>
                    {disabled ? '不可选' : '空闲'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            !selectedTimeSlot ||
            !selectedServiceId ||
            !selectedBarberId
          }
          style={{
            marginTop: '16px',
            padding: '10px',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          {submitting ? '提交中…' : '提交预约'}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: '16px' }}>
          {message}
        </p>
      )}

      <p style={{ marginTop: '40px', opacity: 0.6, fontSize: '13px' }}>
        * 当前逻辑：每天按 30 分钟切格，根据服务时长自动判断哪些开始时间可用。
        当天需提前 {MIN_ADVANCE_MINUTES} 分钟预约，已被占用或不满足条件的时间段会自动变灰，无法再选。
      </p>
    </main>
  )
}
