import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'work' | 'shortBreak' | 'longBreak'

interface Settings {
  work: number
  shortBreak: number
  longBreak: number
  round: number        // pomodoros before long break
  dailyGoal: number    // daily pomodoro goal
  sound: boolean
  notifications: boolean
}

interface Task {
  id: number
  text: string
  done: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULTS: Settings = {
  work: 25, shortBreak: 5, longBreak: 15,
  round: 6, dailyGoal: 10,
  sound: true, notifications: false,
}

const LABEL: Record<Mode, string> = {
  work: 'Фокус', shortBreak: 'Перерыв', longBreak: 'Большой перерыв',
}

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4'
const FADE_SEC = 0.5
const CORAL = '#FF6355'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function beep(): void {
  try {
    const ctx = new AudioContext()
    // Three-tone pleasant chime
    for (const [delay, freq, vol] of [
      [0, 523, 0.35], [0.18, 659, 0.28], [0.36, 784, 0.22], [0.54, 1047, 0.3],
    ] as [number, number, number][]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + delay)
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 1.4)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 1.5)
    }
  } catch { /* silent */ }
}

function sendNotification(title: string, body: string): void {
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  } catch { /* silent */ }
}

// ─── Number row for settings ──────────────────────────────────────────────────

function NumRow({
  label, value, min, max, onChange,
}: {
  label: string; value: number; min: number; max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid #F5F5F5',
    }}>
      <span style={{ fontSize: 15, color: '#1A1A1A' }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#F2F2F2', borderRadius: 10, overflow: 'hidden',
        minWidth: 110,
      }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#444', fontSize: 13, padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >◄</button>
        <span style={{
          flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 600,
          color: '#000', minWidth: 28,
        }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#444', fontSize: 13, padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >►</button>
      </div>
    </div>
  )
}

// ─── Toggle row for settings ──────────────────────────────────────────────────

function ToggleRow({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: () => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid #F5F5F5',
    }}>
      <span style={{ fontSize: 15, color: '#1A1A1A' }}>{label}</span>
      <button
        onClick={onChange}
        style={{
          width: 54, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
          background: value ? CORAL : '#CCCCCC',
          position: 'relative', transition: 'background .22s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', width: 24, height: 24, borderRadius: '50%',
          background: '#FFF', top: 3, left: value ? 27 : 3,
          transition: 'left .22s', boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
        }} />
      </button>
    </div>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  settings, onSave, onClose,
}: {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}) {
  const [d, setD] = useState({ ...settings })

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setD(prev => ({ ...prev, [k]: v }))

  const handleReset = () => {
    setD({ ...DEFAULTS })
  }

  const handleNotificationsToggle = () => {
    if (!d.notifications && Notification.permission !== 'granted') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') set('notifications', true)
      })
    } else {
      set('notifications', !d.notifications)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 20, width: '92%', maxWidth: 400,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 70px rgba(0,0,0,0.18)',
          fontFamily: "'Inter', sans-serif",
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '22px 24px 18px',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#000', margin: 0 }}>Настройки</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 24, color: '#888', lineHeight: 1, padding: 4,
            }}
          >×</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          <NumRow label='«Помидор», мин.'          value={d.work}       min={1}  max={60} onChange={v => set('work', v)} />
          <NumRow label='Маленький перерыв, мин.'  value={d.shortBreak} min={1}  max={30} onChange={v => set('shortBreak', v)} />
          <NumRow label='Большой перерыв, мин.'    value={d.longBreak}  min={1}  max={60} onChange={v => set('longBreak', v)} />
          <NumRow label='«Помидорный» раунд'       value={d.round}      min={2}  max={12} onChange={v => set('round', v)} />
          <NumRow label='Число «помидоров» в день' value={d.dailyGoal}  min={1}  max={30} onChange={v => set('dailyGoal', v)} />
          <ToggleRow label='Звук таймера'            value={d.sound}         onChange={() => set('sound', !d.sound)} />
          <ToggleRow label='Уведомления в браузере'  value={d.notifications} onChange={handleNotificationsToggle} />
          <div style={{ height: 8 }} />
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #F0F0F0', padding: '14px 24px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}>
            <button
              onClick={handleReset}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: CORAL, fontSize: 15, fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                padding: 0,
              }}
            >Сбросить настройки</button>
            <button
              onClick={() => { onSave(d); onClose() }}
              style={{
                background: '#000', color: '#FFF', border: 'none',
                borderRadius: 100, padding: '10px 24px',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: "'Inter', sans-serif", letterSpacing: '.04em',
              }}
            >Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const videoRafRef = useRef<number>(0)

  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [mode, setMode]         = useState<Mode>('work')
  const [timeLeft, setTimeLeft] = useState(DEFAULTS.work * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [completed, setCompleted] = useState(0)     // this cycle
  const [dailyCount, setDailyCount] = useState(0)   // today total
  const [showSettings, setShowSettings] = useState(false)
  const [flash, setFlash] = useState(false)

  // Task name + list
  const [taskName, setTaskName] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')

  const totalTime = useMemo(() => settings[mode] * 60, [settings, mode])
  const progress  = totalTime > 0 ? timeLeft / totalTime : 0

  // ── Video fade loop ──
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const tick = () => {
      const { currentTime, duration } = video
      if (duration > 0) {
        if (currentTime < FADE_SEC) {
          video.style.opacity = String(currentTime / FADE_SEC)
        } else if (currentTime > duration - FADE_SEC) {
          video.style.opacity = String((duration - currentTime) / FADE_SEC)
        } else {
          video.style.opacity = '1'
        }
      }
      videoRafRef.current = requestAnimationFrame(tick)
    }
    const handleEnded = () => {
      video.style.opacity = '0'
      setTimeout(() => { video.currentTime = 0; video.play().catch(() => {}) }, 100)
    }
    video.addEventListener('ended', handleEnded)
    video.play().catch(() => {})
    videoRafRef.current = requestAnimationFrame(tick)
    return () => { video.removeEventListener('ended', handleEnded); cancelAnimationFrame(videoRafRef.current) }
  }, [])

  // ── Completion callback ──
  const onComplete = useRef<() => void>(() => {})
  useEffect(() => {
    onComplete.current = () => {
      if (settings.sound) beep()
      setFlash(true)
      setTimeout(() => setFlash(false), 2200)

      if (mode === 'work') {
        const next = completed + 1
        setDailyCount(c => c + 1)
        if (next >= settings.round) {
          setCompleted(0); setMode('longBreak'); setTimeLeft(settings.longBreak * 60)
          if (settings.notifications) sendNotification('Большой перерыв!', 'Вы прошли полный раунд. Отдохните.')
        } else {
          setCompleted(next); setMode('shortBreak'); setTimeLeft(settings.shortBreak * 60)
          if (settings.notifications) sendNotification('Перерыв!', 'Помидор завершён. Небольшой отдых.')
        }
      } else {
        setMode('work'); setTimeLeft(settings.work * 60)
        if (settings.notifications) sendNotification('Время работать!', 'Перерыв окончен. Вперёд!')
      }
    }
  }, [mode, completed, settings])

  // ── Timer tick ──
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  useEffect(() => {
    if (timeLeft === 0 && isRunning) { setIsRunning(false); onComplete.current() }
  }, [timeLeft, isRunning])

  // ── Tab title ──
  useEffect(() => {
    document.title = `${fmt(timeLeft)} · ${LABEL[mode]} — Pomodoro Lite`
  }, [timeLeft, mode])

  const changeMode = useCallback((m: Mode) => {
    setMode(m); setTimeLeft(settings[m] * 60); setIsRunning(false)
  }, [settings])

  const reset = useCallback(() => {
    setIsRunning(false); setTimeLeft(settings[mode] * 60)
  }, [settings, mode])

  const applySettings = useCallback((s: Settings) => {
    setSettings(s); setTimeLeft(s[mode] * 60); setIsRunning(false)
  }, [mode])

  // ── Tasks ──
  const addTask = () => {
    const text = newTask.trim()
    if (!text) return
    setTasks(prev => [...prev, { id: Date.now(), text, done: false }])
    setNewTask('')
  }
  const toggleTask = (id: number) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const deleteTask = (id: number) =>
    setTasks(prev => prev.filter(t => t.id !== id))

  const MODES: Mode[] = ['work', 'shortBreak', 'longBreak']

  const statusText =
    mode === 'work'
      ? `Сессия ${completed + 1} из ${settings.round} · ${dailyCount}/${settings.dailyGoal} сегодня`
      : mode === 'shortBreak'
      ? `Перерыв · ${dailyCount}/${settings.dailyGoal} сегодня`
      : `Большой перерыв · ${dailyCount}/${settings.dailyGoal} сегодня`

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">

      {/* ── Video ── */}
      <div className="absolute z-0" style={{ top: '300px', right: 0, bottom: 0, left: 0 }}>
        <video ref={videoRef} src={VIDEO_URL} muted playsInline preload="auto"
          className="h-full w-full object-cover" style={{ opacity: 0 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      </div>

      {/* ── Page ── */}
      <div
        className="relative z-10 flex flex-col items-center px-6"
        style={{ paddingTop: '3rem', paddingBottom: '4rem', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}
      >

        {/* Top bar: logo + settings */}
        <div style={{
          width: '100%', maxWidth: 480,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '2.5rem',
        }}>
          <span style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 34, color: '#000', letterSpacing: '-0.8px',
            marginLeft: '-4px',
          }}>
            Pomodoro Lite
          </span>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              background: 'none', border: '1px solid #E5E5E5', borderRadius: '50%',
              width: 38, height: 38, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#666', transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.color = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#666' }}
            title="Настройки"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>

        {/* Task name */}
        <input
          type="text"
          value={taskName}
          onChange={e => setTaskName(e.target.value)}
          placeholder="Над чем работаем?"
          className="animate-fade-rise"
          style={{
            background: 'none', border: 'none',
            borderBottom: `1px solid ${taskName ? '#C8C8C8' : '#E8E8E8'}`,
            textAlign: 'center', width: '100%', maxWidth: 360,
            fontSize: 15, color: '#000',
            fontFamily: "'Inter', sans-serif",
            padding: '6px 0', outline: 'none',
            marginBottom: '2.5rem',
            transition: 'border-color .2s',
          }}
        />

        {/* Mode selector */}
        <div className="animate-fade-rise flex items-center" style={{ marginBottom: '1.5rem' }}>
          {MODES.map((m, idx) => (
            <Fragment key={m}>
              {idx > 0 && <span style={{ color: '#D0D0D0', padding: '0 8px', fontSize: 13 }}>·</span>}
              <button
                onClick={() => changeMode(m)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontFamily: "'Inter', sans-serif",
                  color: mode === m ? '#777' : '#ABABAB',
                  fontWeight: mode === m ? 600 : 400,
                  transition: 'color .2s', padding: '2px 0',
                }}
              >{LABEL[m]}</button>
            </Fragment>
          ))}
        </div>

        {/* Time display */}
        <div
          className="animate-fade-rise"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 'clamp(88px, 16vw, 180px)',
            fontWeight: 400, lineHeight: 0.88,
            letterSpacing: '-4px',
            color: flash ? '#ABABAB' : '#000',
            transition: 'color .4s ease',
            marginBottom: '2rem',
            userSelect: 'none',
          }}
        >{fmt(timeLeft)}</div>

        {/* Progress line */}
        <div style={{
          width: 220, height: 1, background: '#EBEBEB',
          position: 'relative', marginBottom: '1.8rem',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${progress * 100}%`,
            background: flash ? CORAL : '#000',
            transition: 'width 0.95s linear, background .3s',
          }} />
        </div>

        {/* Session dots */}
        <div className="animate-fade-rise-delay flex items-center gap-2" style={{ marginBottom: '2rem' }}>
          {Array.from({ length: Math.min(settings.round, 10) }, (_, n) => (
            <div key={n} style={{
              height: 3, borderRadius: 2,
              width: n < completed ? 22 : 7,
              background: n < completed ? '#000' : n === completed && mode === 'work' ? '#C0C0C0' : '#E8E8E8',
              transition: 'all .4s ease',
            }} />
          ))}
        </div>

        {/* Controls */}
        <div className="animate-fade-rise-delay flex items-center gap-5" style={{ marginBottom: '1.5rem' }}>
          <button
            onClick={reset}
            title="Сбросить"
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'none', border: '1px solid #E5E5E5',
              color: '#888', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.color = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#888' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>

          <button
            onClick={() => setIsRunning(r => !r)}
            aria-label={isRunning ? 'Pause' : 'Start'}
            className="transition-transform hover:scale-[1.05]"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#000', border: 'none', color: '#FFF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
            }}
          >
            {isRunning
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>

          {/* Skip to next mode */}
          <button
            onClick={() => {
              const next: Mode = mode === 'work'
                ? (completed + 1 >= settings.round ? 'longBreak' : 'shortBreak')
                : 'work'
              changeMode(next)
            }}
            title="Пропустить"
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'none', border: '1px solid #E5E5E5',
              color: '#888', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.color = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E5'; e.currentTarget.style.color = '#888' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4l10 8-10 8V4z"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>

        {/* Status */}
        <div
          className="animate-fade-rise-delay-2"
          style={{
            fontSize: 11, color: '#777',
            letterSpacing: '.08em', textTransform: 'uppercase',
            fontFamily: "'Inter', sans-serif",
            marginBottom: '1.2rem',
          }}
        >{statusText}</div>

        {/* ── Task list ── */}
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'rgba(255,255,255,0.22)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderRadius: 16,
          padding: '16px 18px',
          border: '1px solid rgba(255,255,255,0.22)',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
            color: '#777', marginBottom: '0.85rem', fontFamily: "'Inter', sans-serif",
          }}>Задачи</div>

          {/* Add task */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '0.85rem' }}>
            <input
              type="text"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask() }}
              placeholder="Добавить задачу..."
              style={{
                flex: 1, background: '#FFF',
                border: '1px solid #E2E0DC', borderRadius: 10,
                padding: '10px 14px', fontSize: 14, color: '#000',
                fontFamily: "'Inter', sans-serif", outline: 'none',
                transition: 'border-color .2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#B0ADA8' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E2E0DC' }}
            />
            <button
              onClick={addTask}
              style={{
                width: 40, height: 40, borderRadius: 10,
                background: '#000', border: 'none', color: '#FFF',
                cursor: 'pointer', fontSize: 20, fontWeight: 300,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >+</button>
          </div>

          {/* Task items */}
          {tasks.length === 0 && (
            <p style={{ fontSize: 13, color: '#8C8A87', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: '0.6rem 0 0.2rem' }}>
              Список задач пуст
            </p>
          )}
          {tasks.map(task => (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid #E6E4E0',
            }}>
              <button
                onClick={() => toggleTask(task.id)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${task.done ? '#000' : '#D0D0D0'}`,
                  background: task.done ? '#000' : 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s',
                }}
              >
                {task.done && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 6l3 3 5-5"/>
                  </svg>
                )}
              </button>
              <span style={{
                flex: 1, fontSize: 14, color: task.done ? '#C8C8C8' : '#000',
                textDecoration: task.done ? 'line-through' : 'none',
                fontFamily: "'Inter', sans-serif", transition: 'all .2s',
              }}>{task.text}</span>
              <button
                onClick={() => deleteTask(task.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#C8C8C8', fontSize: 18, lineHeight: 1, padding: '0 4px',
                  transition: 'color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#888' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#C8C8C8' }}
              >×</button>
            </div>
          ))}
        </div>

      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={applySettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
