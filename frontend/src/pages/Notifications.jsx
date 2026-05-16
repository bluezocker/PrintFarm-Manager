import { useEffect, useState } from 'react'
import { Bell, Save } from 'lucide-react'
import api from '../services/api'

const EVENTS = [
  { key: 'on_print_success',    label: 'Druck erfolgreich beendet',      group: 'end' },
  { key: 'on_print_failed',     label: 'Druck fehlgeschlagen',           group: 'end' },
  { key: 'on_print_cancelled',  label: 'Druck abgebrochen',              group: 'end' },
  { key: 'on_print_started',    label: 'Druck gestartet',                group: 'mid' },
  { key: 'on_progress_50',      label: '50% Fortschritt erreicht',       group: 'mid' },
  { key: 'on_filament_change',  label: 'Filamentwechsel erforderlich',   group: 'mid' },
  { key: 'on_pause',            label: 'Druck pausiert',                 group: 'mid' },
  { key: 'on_error',            label: 'Drucker meldet Fehler',          group: 'other' },
  { key: 'on_maintenance_due',  label: 'Wartung fällig',                 group: 'other' },
]

export default function Notifications() {
  const [form, setForm] = useState(null)
  const [printers, setPrinters] = useState([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/notifications/me'),
      api.get('/printers'),
    ]).then(([n, p]) => {
      setForm(n.data)
      setPrinters(p.data)
    })
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      const r = await api.put('/notifications/me', form)
      setForm(r.data)
      setMsg('Gespeichert ✓')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  if (!form) return <div>Lade...</div>

  const selectedPrinterIds = (form.printer_filter || '').split(',').filter(Boolean).map(Number)

  const togglePrinter = (id) => {
    const cur = new Set(selectedPrinterIds)
    if (cur.has(id)) cur.delete(id); else cur.add(id)
    setForm({ ...form, printer_filter: [...cur].join(',') })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Bell className="w-6 h-6" /> Meine E-Mail-Benachrichtigungen
      </h1>
      <p className="text-gray-500 mb-6">Welche Druck-Events sollst du per E-Mail bekommen?</p>

      <form onSubmit={save} className="space-y-6 max-w-2xl">
        <div className="card">
          <h2 className="font-semibold mb-3">Druckende</h2>
          <div className="space-y-2">
            {EVENTS.filter((e) => e.group === 'end').map((e) => (
              <label key={e.key} className="flex items-center gap-3">
                <input type="checkbox" checked={form[e.key]}
                  onChange={(ev) => setForm({ ...form, [e.key]: ev.target.checked })} />
                <span>{e.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Zwischenstatus</h2>
          <div className="space-y-2">
            {EVENTS.filter((e) => e.group === 'mid').map((e) => (
              <label key={e.key} className="flex items-center gap-3">
                <input type="checkbox" checked={form[e.key]}
                  onChange={(ev) => setForm({ ...form, [e.key]: ev.target.checked })} />
                <span>{e.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Sonstiges</h2>
          <div className="space-y-2">
            {EVENTS.filter((e) => e.group === 'other').map((e) => (
              <label key={e.key} className="flex items-center gap-3">
                <input type="checkbox" checked={form[e.key]}
                  onChange={(ev) => setForm({ ...form, [e.key]: ev.target.checked })} />
                <span>{e.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Drucker-Filter</h2>
          <p className="text-sm text-gray-500 mb-3">
            Wähle, für welche Drucker du Benachrichtigungen bekommen willst.
            Wenn nichts ausgewählt = alle Drucker.
          </p>
          <div className="space-y-2">
            {printers.map((p) => (
              <label key={p.id} className="flex items-center gap-3">
                <input type="checkbox"
                  checked={selectedPrinterIds.includes(p.id)}
                  onChange={() => togglePrinter(p.id)} />
                <span>{p.name} <span className="text-xs text-gray-500">({p.brand} {p.model})</span></span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> Speichern
          </button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      </form>
    </div>
  )
}
