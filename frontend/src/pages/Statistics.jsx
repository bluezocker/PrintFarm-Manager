import { useEffect, useState } from 'react'
import { BarChart3, Printer, Clock, Package, CheckCircle, XCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../services/api'

function StatCard({ icon: Icon, label, value, hint, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    green:   'bg-green-50 text-green-600',
    red:     'bg-red-50 text-red-600',
    yellow:  'bg-yellow-50 text-yellow-600',
    purple:  'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

export default function Statistics() {
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState(null)
  const [entries, setEntries] = useState([])
  const [printers, setPrinters] = useState([])

  useEffect(() => {
    api.get(`/history/stats?days=${days}`).then((r) => setStats(r.data))
    api.get(`/history?days=${days}`).then((r) => setEntries(r.data))
    api.get('/printers').then((r) => setPrinters(r.data))
  }, [days])

  // Drucker-Statistik
  const byPrinter = printers.map((p) => {
    const eList = entries.filter((e) => e.printer_id === p.id)
    return {
      name: p.name,
      Drucke: eList.length,
      Stunden: Math.round(eList.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60),
      Material: Math.round(eList.reduce((s, e) => s + (e.material_used_g || 0), 0)),
    }
  }).filter((p) => p.Drucke > 0)

  // Erfolgs-Ratio
  const successData = stats ? [
    { name: 'Erfolgreich', value: stats.success_count, color: '#10b981' },
    { name: 'Fehlgeschlagen', value: stats.failed_count, color: '#ef4444' },
    { name: 'Abgebrochen', value: stats.total_prints - stats.success_count - stats.failed_count, color: '#9ca3af' },
  ].filter((d) => d.value > 0) : []

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <BarChart3 className="w-6 h-6" /> Statistik
      </h1>
      <p className="text-gray-500 mb-6">Auswertung deiner Druckaktivitäten</p>

      <select className="input max-w-xs mb-6" value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value="7">Letzte 7 Tage</option>
        <option value="30">Letzte 30 Tage</option>
        <option value="90">Letzte 90 Tage</option>
        <option value="365">Letztes Jahr</option>
      </select>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Printer} label="Drucke gesamt" value={stats.total_prints} color="primary" />
          <StatCard icon={CheckCircle} label="Erfolgsquote" value={`${stats.success_rate.toFixed(1)}%`}
            hint={`${stats.success_count} ok · ${stats.failed_count} fail`} color="green" />
          <StatCard icon={Clock} label="Druckzeit" value={`${stats.total_hours} h`} color="purple" />
          <StatCard icon={Package} label="Material" value={`${(stats.total_material_g / 1000).toFixed(2)} kg`} color="yellow" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-4">Drucker-Auslastung</h2>
          {byPrinter.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Keine Daten im Zeitraum.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byPrinter}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Drucke" fill="#3b82f6" />
                <Bar dataKey="Stunden" fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Erfolgsverteilung</h2>
          {successData.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Keine Daten im Zeitraum.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={successData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={100} label={(d) => `${d.name}: ${d.value}`}>
                  {successData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
