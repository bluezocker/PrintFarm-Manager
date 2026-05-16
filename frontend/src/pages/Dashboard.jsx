import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Printer, FileText, Receipt, Package, Wrench, AlertCircle,
  TrendingUp, CheckCircle, XCircle, Clock, Boxes, Euro,
  Activity, ArrowRight,
} from 'lucide-react'
import api from '../services/api'

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-lg border border-gray-200 p-5 ${className}`}>{children}</div>
}

function StatBox({ icon: Icon, label, value, sublabel, color = 'blue', to }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    green:  'bg-green-50 text-green-600 border-green-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
    red:    'bg-red-50 text-red-600 border-red-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    gray:   'bg-gray-50 text-gray-600 border-gray-100',
  }
  const content = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sublabel && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
      </div>
      <div className={`p-2.5 rounded-lg ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  )
  if (to) {
    return <Link to={to} className="block bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">{content}</Link>
  }
  return <Card>{content}</Card>
}

function MinuteFormat({ minutes }) {
  if (!minutes && minutes !== 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        const [d, a] = await Promise.all([
          api.get('/dashboard/overview'),
          api.get('/dashboard/recent-activity?limit=8'),
        ])
        if (mounted) {
          setData(d.data)
          setActivity(a.data)
          setError(null)
        }
      } catch (e) {
        console.error('Dashboard-Fehler:', e)
        if (mounted) setError(e.response?.data?.detail || e.message || 'Fehler beim Laden')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)  // alle 30s
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (loading) return <div className="text-gray-500">Lade Dashboard...</div>

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-800 mb-2">Dashboard konnte nicht geladen werden</h2>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    )
  }

  if (!data) return <div className="text-gray-500">Keine Daten</div>

  // Defensive Defaults für alle Felder - falls API mal was nicht zurückgibt,
  // crasht das Dashboard nicht mehr
  const printers = data.printers || { total: 0, printing: 0, idle: 0, error: 0, offline: 0, active_jobs: [] }
  const jobs = data.jobs || { total_open: 0, overdue: 0, due_soon: 0, completed_30d: 0 }
  const invoices = data.invoices || { sent_open: 0, overdue: 0, outstanding: 0, paid_30d_revenue: 0 }
  const filaments = data.filaments || { total_spools: 0, total_remaining_kg: 0, low_spools: [] }
  const inventory = data.inventory || { low_stock_count: 0, items: [] }
  const maintenance = data.maintenance || { upcoming_count: 0, overdue_count: 0, items: [] }
  const history = data.history || { success_count: 0, failed_count: 0, success_rate: 100, total_hours: 0, total_material_kg: 0 }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm">Übersicht über deinen Druckbetrieb</p>
        </div>
        <p className="text-xs text-gray-400">Aktualisiert sich alle 30 Sekunden</p>
      </div>

      {/* KPI-Reihe oben */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatBox
          icon={Printer}
          label="Drucker"
          value={`${printers.printing} / ${printers.total}`}
          sublabel={`${printers.printing} drucken, ${printers.idle} idle`}
          color={printers.printing > 0 ? 'green' : 'gray'}
          to="/printers"
        />
        <StatBox
          icon={FileText}
          label="Offene Aufträge"
          value={jobs.total_open}
          sublabel={jobs.overdue > 0 ? `${jobs.overdue} überfällig!` : `${jobs.due_soon} bald fällig`}
          color={jobs.overdue > 0 ? 'red' : 'blue'}
          to="/jobs"
        />
        <StatBox
          icon={Euro}
          label="Offene Rechnungen"
          value={`${invoices.outstanding.toFixed(0)} €`}
          sublabel={invoices.overdue > 0 ? `${invoices.overdue} überfällig` : `${invoices.sent_open} versendet`}
          color={invoices.overdue > 0 ? 'amber' : 'purple'}
          to="/invoices"
        />
        <StatBox
          icon={TrendingUp}
          label="Umsatz 30 Tage"
          value={`${invoices.paid_30d_revenue.toFixed(0)} €`}
          sublabel={`${jobs.completed_30d} Aufträge abgeschlossen`}
          color="green"
        />
      </div>

      {/* Zweite KPI-Reihe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatBox
          icon={Package}
          label="Filamente"
          value={`${filaments.total_remaining_kg} kg`}
          sublabel={`${filaments.total_spools} Rollen im Bestand`}
          color="blue"
          to="/filaments"
        />
        <StatBox
          icon={CheckCircle}
          label="Erfolgsquote 30T"
          value={`${history.success_rate}%`}
          sublabel={`${history.success_count} ok, ${history.failed_count} fehler`}
          color={history.success_rate > 90 ? 'green' : 'amber'}
          to="/statistics"
        />
        <StatBox
          icon={Clock}
          label="Druckzeit 30T"
          value={`${history.total_hours} h`}
          sublabel={`${history.total_material_kg} kg Material`}
          color="purple"
        />
        <StatBox
          icon={Wrench}
          label="Wartungen"
          value={maintenance.upcoming_count}
          sublabel={maintenance.overdue_count > 0 ? `${maintenance.overdue_count} überfällig!` : 'in 30 Tagen fällig'}
          color={maintenance.overdue_count > 0 ? 'red' : 'gray'}
          to="/maintenance"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aktive Drucke (linke 2/3) */}
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-600" />
              Aktive Drucke
            </h2>
            <Link to="/printers" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              Alle anzeigen <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {printers.active_jobs.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Aktuell keine aktiven Drucke</p>
          ) : (
            <div className="space-y-3">
              {printers.active_jobs.map((p) => (
                <Link
                  key={p.id}
                  to={`/printers/${p.id}`}
                  className="block border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-500 truncate max-w-md">
                        {p.current_job_name || 'Unbenannt'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{(p.progress || 0).toFixed(1)}%</p>
                      <p className="text-xs text-gray-500">
                        <MinuteFormat minutes={p.remaining_time} /> übrig
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${p.progress || 0}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Niedriger Bestand (rechte 1/3) */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Niedriger Bestand
            </h2>
          </div>

          {filaments.low_spools.length === 0 && inventory.low_stock_count === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Alle Bestände okay ✓</p>
          ) : (
            <div className="space-y-3">
              {filaments.low_spools.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Filamente</p>
                  {filaments.low_spools.slice(0, 5).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-3 h-3 rounded-full border flex-shrink-0"
                        style={{ background: f.color_hex || '#aaa' }}
                      />
                      <span className="text-xs flex-1 truncate">
                        {f.material} {f.color}
                      </span>
                      <span className="text-xs font-mono text-amber-700">
                        {f.remaining_weight.toFixed(0)}g
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {inventory.items.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Inventar</p>
                  {inventory.items.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 mb-1.5">
                      <Boxes className="w-3 h-3 text-gray-400" />
                      <span className="text-xs flex-1 truncate">{item.name}</span>
                      <span className="text-xs font-mono text-amber-700">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Untere Reihe: Aktivität + Wartungen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">Letzte Aktivität</h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Keine Aktivität</p>
          ) : (
            <div className="space-y-2">
              {activity.map((a, i) => {
                const Icon = a.type === 'print' ? Activity
                  : a.type === 'job' ? FileText : Receipt
                const linkTo = a.type === 'print' ? '/history'
                  : a.type === 'job' ? '/jobs' : '/invoices'
                return (
                  <Link key={i} to={linkTo}
                    className="flex items-center gap-3 py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.subtitle}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {a.timestamp ? new Date(a.timestamp).toLocaleString('de-DE', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      }) : ''}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Wrench className="w-5 h-5 text-gray-600" />
              Anstehende Wartungen
            </h2>
            <Link to="/maintenance" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              Alle <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {maintenance.items.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Keine fälligen Wartungen ✓</p>
          ) : (
            <div className="space-y-2">
              {maintenance.items.slice(0, 6).map((m) => (
                <div key={m.id}
                  className={`flex items-center justify-between p-2 rounded ${m.overdue ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-medium">{m.printer_name || 'Drucker'}</p>
                    <p className="text-xs text-gray-500">{m.maintenance_type || 'Wartung'}</p>
                  </div>
                  <span className={`text-xs font-mono ${m.overdue ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
                    {m.next_due_date}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
