import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, AlertCircle } from 'lucide-react'
import api from '../services/api'

const STATUS_COLORS = {
  new: 'bg-gray-100 text-gray-800 border-gray-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  printing: 'bg-green-100 text-green-800 border-green-300',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  completed: 'bg-purple-100 text-purple-800 border-purple-300',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
}

const STATUS_LABELS = {
  new: 'Neu', in_progress: 'In Bearbeitung', printing: 'Druckt',
  paused: 'Pausiert', completed: 'Fertig', paid: 'Bezahlt', cancelled: 'Storniert',
}

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear()
      && d1.getMonth() === d2.getMonth()
      && d1.getDate() === d2.getDate()
}

function isPast(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d < today
}

function getMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const start = new Date(firstOfMonth)
  const dayOfWeek = firstOfMonth.getDay()
  const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
  start.setDate(firstOfMonth.getDate() - daysToMonday)
  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

function getWeekDays(date) {
  const day = date.getDay()
  const daysToMonday = (day === 0 ? 6 : day - 1)
  const monday = new Date(date)
  monday.setDate(date.getDate() - daysToMonday)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d)
  }
  return days
}

export default function Calendar() {
  const navigate = useNavigate()
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [draggedJob, setDraggedJob] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  const visibleRange = useMemo(() => {
    if (view === 'week') {
      const days = getWeekDays(cursor)
      return { from: days[0], to: days[6], days }
    }
    const grid = getMonthGrid(cursor.getFullYear(), cursor.getMonth())
    return { from: grid[0], to: grid[41], days: grid }
  }, [view, cursor])

  const jobsByDate = useMemo(() => {
    const map = {}
    const unscheduled = []
    for (const j of jobs) {
      if (!j.due_date) {
        unscheduled.push(j)
        continue
      }
      if (!map[j.due_date]) map[j.due_date] = []
      map[j.due_date].push(j)
    }
    return { byDate: map, unscheduled }
  }, [jobs])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const fromStr = formatDateKey(visibleRange.from)
      const toStr = formatDateKey(visibleRange.to)
      const r = await api.get(`/jobs/calendar?from_date=${fromStr}&to_date=${toStr}`)
      setJobs(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [view, cursor])

  const goPrev = () => {
    const next = new Date(cursor)
    if (view === 'week') next.setDate(next.getDate() - 7)
    else next.setMonth(next.getMonth() - 1)
    setCursor(next)
  }
  const goNext = () => {
    const next = new Date(cursor)
    if (view === 'week') next.setDate(next.getDate() + 7)
    else next.setMonth(next.getMonth() + 1)
    setCursor(next)
  }
  const goToday = () => setCursor(new Date())

  const onDragStart = (e, job) => {
    setDraggedJob(job)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', String(job.id)) } catch (_) {}
  }
  const onDragEnd = () => {
    setDraggedJob(null)
    setDropTarget(null)
  }
  const onDragOver = (e, dateKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== dateKey) setDropTarget(dateKey)
  }
  const onDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTarget(null)
  }
  const onDrop = async (e, dateKey) => {
    e.preventDefault()
    if (!draggedJob) return
    if (draggedJob.due_date === dateKey) {
      setDraggedJob(null); setDropTarget(null); return
    }
    const oldDate = draggedJob.due_date
    setJobs(prev => prev.map(j => j.id === draggedJob.id ? { ...j, due_date: dateKey } : j))
    setDraggedJob(null); setDropTarget(null)
    try {
      await api.patch(`/jobs/${draggedJob.id}/due-date`, { due_date: dateKey })
    } catch (err) {
      setJobs(prev => prev.map(j => j.id === draggedJob.id ? { ...j, due_date: oldDate } : j))
      setError(err.response?.data?.detail || 'Konnte Datum nicht speichern')
    }
  }
  const onDropUnschedule = async (e) => {
    e.preventDefault()
    if (!draggedJob) return
    const oldDate = draggedJob.due_date
    setJobs(prev => prev.map(j => j.id === draggedJob.id ? { ...j, due_date: null } : j))
    setDraggedJob(null); setDropTarget(null)
    try {
      await api.patch(`/jobs/${draggedJob.id}/due-date`, { due_date: null })
    } catch (err) {
      setJobs(prev => prev.map(j => j.id === draggedJob.id ? { ...j, due_date: oldDate } : j))
      setError(err.response?.data?.detail || 'Konnte nicht entfernen')
    }
  }

  const headerTitle = view === 'week'
    ? `${visibleRange.from.getDate()}. ${MONTHS_DE[visibleRange.from.getMonth()]} – ${visibleRange.to.getDate()}. ${MONTHS_DE[visibleRange.to.getMonth()]} ${visibleRange.to.getFullYear()}`
    : `${MONTHS_DE[cursor.getMonth()]} ${cursor.getFullYear()}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalIcon className="w-6 h-6" /> Kalender
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Aufträge per Drag &amp; Drop verschieben um den Liefertermin zu ändern.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setView('month')}
            className={`px-3 py-1.5 rounded text-sm ${view === 'month' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>Monat</button>
          <button onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded text-sm ${view === 'week' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>Woche</button>
          <div className="border-l h-6 mx-1"></div>
          <button onClick={goToday} className="px-3 py-1.5 rounded text-sm bg-gray-100 hover:bg-gray-200">Heute</button>
          <button onClick={goPrev} className="p-2 rounded hover:bg-gray-100" title="Zurück">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goNext} className="p-2 rounded hover:bg-gray-100" title="Vor">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">{headerTitle}</h2>
        {loading && <span className="text-xs text-gray-500">Lade...</span>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="card !p-0 overflow-hidden">
          {view === 'month' ? (
            <MonthView
              days={visibleRange.days}
              currentMonth={cursor.getMonth()}
              jobsByDate={jobsByDate.byDate}
              onJobClick={(id) => navigate(`/jobs?edit=${id}`)}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              dropTarget={dropTarget} draggedJob={draggedJob}
            />
          ) : (
            <WeekView
              days={visibleRange.days}
              jobsByDate={jobsByDate.byDate}
              onJobClick={(id) => navigate(`/jobs?edit=${id}`)}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              dropTarget={dropTarget} draggedJob={draggedJob}
            />
          )}
        </div>

        <UnscheduledPanel
          jobs={jobsByDate.unscheduled}
          onJobClick={(id) => navigate(`/jobs?edit=${id}`)}
          onDragStart={onDragStart} onDragEnd={onDragEnd}
          onDrop={onDropUnschedule} draggedJob={draggedJob}
        />
      </div>

      <Legend />
    </div>
  )
}

function MonthView({ days, currentMonth, jobsByDate, onJobClick, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, dropTarget, draggedJob }) {
  return (
    <div>
      <div className="grid grid-cols-7 bg-gray-50 border-b">
        {WEEKDAYS_DE.map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-medium text-gray-600 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const dateKey = formatDateKey(day)
          const isCurrentMonth = day.getMonth() === currentMonth
          const isToday = isSameDay(day, new Date())
          const dayJobs = jobsByDate[dateKey] || []
          const isDropTarget = dropTarget === dateKey
          return (
            <div key={dateKey}
              onDragOver={(e) => onDragOver(e, dateKey)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, dateKey)}
              className={`min-h-[110px] border-r border-b p-1.5 relative ${
                !isCurrentMonth ? 'bg-gray-50/50' : 'bg-white'
              } ${isDropTarget && draggedJob ? 'bg-primary-50 ring-2 ring-primary-400 ring-inset' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${
                  isToday
                    ? 'bg-primary-600 text-white px-1.5 py-0.5 rounded-full'
                    : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                }`}>{day.getDate()}</span>
                {dayJobs.length > 0 && (
                  <span className="text-[10px] text-gray-500">{dayJobs.length}</span>
                )}
              </div>
              <div className="space-y-1">
                {dayJobs.slice(0, 4).map((job) => (
                  <JobChip key={job.id} job={job}
                    onClick={() => onJobClick(job.id)}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))}
                {dayJobs.length > 4 && (
                  <div className="text-[10px] text-gray-500 px-1">+{dayJobs.length - 4} mehr</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ days, jobsByDate, onJobClick, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, dropTarget, draggedJob }) {
  return (
    <div>
      <div className="grid grid-cols-7 bg-gray-50 border-b">
        {days.map((day) => {
          const isToday = isSameDay(day, new Date())
          return (
            <div key={formatDateKey(day)} className="px-2 py-2 text-center border-r last:border-r-0">
              <div className="text-xs text-gray-600">{WEEKDAYS_DE[(day.getDay() + 6) % 7]}</div>
              <div className={`text-sm font-semibold mt-0.5 ${
                isToday ? 'bg-primary-600 text-white inline-flex w-7 h-7 items-center justify-center rounded-full' : ''
              }`}>{day.getDate()}</div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateKey = formatDateKey(day)
          const dayJobs = jobsByDate[dateKey] || []
          const isDropTarget = dropTarget === dateKey
          return (
            <div key={dateKey}
              onDragOver={(e) => onDragOver(e, dateKey)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, dateKey)}
              className={`min-h-[400px] border-r last:border-r-0 p-2 space-y-1.5 ${
                isDropTarget && draggedJob ? 'bg-primary-50 ring-2 ring-primary-400 ring-inset' : ''
              }`}
            >
              {dayJobs.length === 0 && draggedJob && (
                <div className="text-xs text-gray-300 text-center mt-4">Hier ablegen</div>
              )}
              {dayJobs.map((job) => (
                <JobChip key={job.id} job={job}
                  onClick={() => onJobClick(job.id)}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} detailed />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JobChip({ job, onClick, onDragStart, onDragEnd, detailed = false }) {
  const colorCls = STATUS_COLORS[job.status] || STATUS_COLORS.new
  const overdue = job.due_date && isPast(job.due_date) && !['completed', 'paid', 'cancelled'].includes(job.status)
  return (
    <div draggable
      onDragStart={(e) => onDragStart(e, job)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`cursor-pointer rounded border text-xs px-1.5 py-1 truncate hover:shadow ${colorCls} ${overdue ? 'ring-1 ring-red-500' : ''}`}
      title={`${job.order_number || ''} ${job.title}${job.customer_name ? ` (${job.customer_name})` : ''}`}
    >
      {detailed ? (
        <>
          <div className="font-medium truncate">{job.title}</div>
          {job.order_number && (
            <div className="text-[10px] opacity-75 truncate">{job.order_number}</div>
          )}
          {job.customer_name && (
            <div className="text-[10px] opacity-75 truncate">{job.customer_name}</div>
          )}
          {job.estimated_hours != null && job.estimated_hours > 0 && (
            <div className="text-[10px] opacity-75 flex items-center gap-0.5 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              {job.estimated_hours}h
            </div>
          )}
        </>
      ) : (
        <div className="truncate">
          {overdue && '⚠ '}{job.title}
        </div>
      )}
    </div>
  )
}

function UnscheduledPanel({ jobs, onJobClick, onDragStart, onDragEnd, onDrop, draggedJob }) {
  const [isOver, setIsOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (draggedJob && !isOver) setIsOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        setIsOver(false)
      }}
      onDrop={(e) => { setIsOver(false); onDrop(e) }}
      className={`card !p-3 h-fit lg:sticky lg:top-4 ${
        isOver && draggedJob ? 'ring-2 ring-primary-400 bg-primary-50' : ''
      }`}
    >
      <h3 className="font-semibold text-sm mb-1">Ohne Liefertermin</h3>
      <p className="text-xs text-gray-500 mb-3">
        {draggedJob ? 'Hier ablegen um Termin zu entfernen' : `${jobs.length} Aufträge`}
      </p>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {jobs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Keine Aufträge</p>
        ) : (
          jobs.map((j) => (
            <JobChip key={j.id} job={j}
              onClick={() => onJobClick(j.id)}
              onDragStart={onDragStart} onDragEnd={onDragEnd} detailed />
          ))
        )}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-4 card">
      <h3 className="font-medium text-sm mb-2">Status</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <span key={k} className={`text-xs px-2 py-1 rounded border ${STATUS_COLORS[k]}`}>
            {label}
          </span>
        ))}
        <span className="text-xs px-2 py-1 rounded border bg-white text-red-700 border-red-500">
          ⚠ Überfällig
        </span>
      </div>
    </div>
  )
}
