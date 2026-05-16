import { useEffect, useState } from 'react'
import { Zap, Activity, RefreshCw } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '../services/api'

export default function Power() {
  const [printers, setPrinters] = useState([])
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState(null)
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/printers').then((r) => {
      const withTuya = r.data.filter((p) => p.tuya_device_id)
      setPrinters(withTuya)
      if (withTuya.length > 0) setSelected(withTuya[0].id)
    })
  }, [])

  const loadData = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const [s, h] = await Promise.all([
        api.get(`/power/${selected}/summary`),
        api.get(`/power/${selected}/history?hours=${hours}`),
      ])
      setSummary(s.data)
      setHistory(h.data)
    } finally {
      setLoading(false)
    }
  }

  const fetchCurrent = async () => {
    if (!selected) return
    try {
      const r = await api.get(`/power/${selected}/current`)
      setCurrent(r.data)
      loadData()
    } catch (e) {
      alert('Tuya-Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  useEffect(() => { loadData() }, [selected, hours])

  const chartData = history.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    power: h.power_w || 0,
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Stromverbrauch</h1>

      {printers.length === 0 ? (
        <div className="card text-center py-12">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Keine Drucker mit Tuya-Steckdose konfiguriert.</p>
          <p className="text-xs text-gray-400 mt-2">Hinterlege bei einem Drucker die Tuya Device ID.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-6 flex-wrap items-center">
            <select className="input max-w-xs" value={selected || ''} onChange={(e) => setSelected(Number(e.target.value))}>
              {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input max-w-xs" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value="1">Letzte Stunde</option>
              <option value="24">Letzte 24 Stunden</option>
              <option value="168">Letzte 7 Tage</option>
            </select>
            <button onClick={fetchCurrent} className="btn-primary flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Live-Daten abrufen
            </button>
          </div>

          {/* Aktuelle Werte */}
          {current && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="card">
                <p className="text-xs text-gray-500">Aktuelle Leistung</p>
                <p className="text-2xl font-bold mt-1">{current.power_w?.toFixed(1) || '—'} W</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500">Spannung</p>
                <p className="text-2xl font-bold mt-1">{current.voltage_v?.toFixed(0) || '—'} V</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500">Strom</p>
                <p className="text-2xl font-bold mt-1">{current.current_ma ? `${(current.current_ma / 1000).toFixed(2)} A` : '—'}</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500">Steckdose</p>
                <p className="text-2xl font-bold mt-1">{current.is_on ? '⚡ AN' : '○ AUS'}</p>
              </div>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <Activity className="w-4 h-4" /> Heute
                </div>
                <p className="text-2xl font-bold">{summary.today_kwh?.toFixed(3) || '0.000'} kWh</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <Activity className="w-4 h-4" /> Diesen Monat
                </div>
                <p className="text-2xl font-bold">{summary.month_kwh?.toFixed(2) || '0.00'} kWh</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <Activity className="w-4 h-4" /> Zählerstand
                </div>
                <p className="text-2xl font-bold">{summary.total_kwh?.toFixed(2) || '—'} kWh</p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="card">
            <h2 className="font-semibold mb-4">Leistungsverlauf</h2>
            {chartData.length === 0 ? (
              <p className="text-gray-500 text-sm py-12 text-center">
                Noch keine Daten. Klicke auf "Live-Daten abrufen" um zu beginnen.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} label={{ value: 'Watt', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="power" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  )
}
