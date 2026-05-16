import { useEffect, useState } from 'react'
import { Wrench, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Modal from '../components/Modal'

export default function Maintenance() {
  const [printers, setPrinters] = useState([])
  const [maintenances, setMaintenances] = useState({})  // {printer_id: [maintenance,...]}
  const [open, setOpen] = useState(false)
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    maintenance_type: '',
    description: '',
    technician: '',
    cost: 0,
    next_due_date: '',
  })

  const load = async () => {
    const pr = await api.get('/printers')
    setPrinters(pr.data)
    const map = {}
    await Promise.all(pr.data.map(async (p) => {
      const r = await api.get(`/printers/${p.id}/maintenances`)
      map[p.id] = r.data
    }))
    setMaintenances(map)
  }

  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    if (!payload.next_due_date) delete payload.next_due_date
    await api.post(`/printers/${selectedPrinter}/maintenances`, payload)
    setOpen(false)
    setForm({ ...form, description: '', maintenance_type: '', cost: 0 })
    load()
  }

  const remove = async (id) => {
    if (!confirm('Wartung löschen?')) return
    await api.delete(`/printers/maintenances/${id}`)
    load()
  }

  // Flache, sortierte Liste aller Wartungen
  const all = []
  for (const p of printers) {
    for (const m of maintenances[p.id] || []) {
      all.push({ ...m, printer: p })
    }
  }
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const today = new Date().toISOString().slice(0, 10)
  const overdue = all.filter((m) => m.next_due_date && m.next_due_date < today)
  const upcoming = all.filter((m) => {
    if (!m.next_due_date || m.next_due_date < today) return false
    const diff = (new Date(m.next_due_date) - new Date(today)) / (1000 * 60 * 60 * 24)
    return diff <= 30
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6" /> Wartung
          </h1>
          <p className="text-gray-500">Alle Wartungen aller Drucker auf einen Blick</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Wartung eintragen
        </button>
      </div>

      {(overdue.length > 0 || upcoming.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {overdue.length > 0 && (
            <div className="card bg-red-50 border-red-200">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-semibold">Überfällig ({overdue.length})</h3>
              </div>
              <ul className="text-sm space-y-1">
                {overdue.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <Link to={`/printers/${m.printer.id}`} className="hover:underline">
                      {m.printer.name}: {m.maintenance_type || 'Wartung'}
                    </Link>
                    <span className="text-red-700">{m.next_due_date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="card bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 text-amber-800 mb-2">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-semibold">Demnächst fällig ({upcoming.length})</h3>
              </div>
              <ul className="text-sm space-y-1">
                {upcoming.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <Link to={`/printers/${m.printer.id}`} className="hover:underline">
                      {m.printer.name}: {m.maintenance_type || 'Wartung'}
                    </Link>
                    <span className="text-amber-700">{m.next_due_date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Drucker</th>
              <th className="p-3 text-left">Typ</th>
              <th className="p-3 text-left">Beschreibung</th>
              <th className="p-3 text-left">Techniker</th>
              <th className="p-3 text-right">Kosten</th>
              <th className="p-3 text-left">Nächste</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {all.map((m) => (
              <tr key={m.id} className="border-t hover:bg-gray-50">
                <td className="p-3 text-gray-600">{m.date}</td>
                <td className="p-3">
                  <Link to={`/printers/${m.printer.id}`} className="font-medium hover:text-primary-600">
                    {m.printer.name}
                  </Link>
                </td>
                <td className="p-3">{m.maintenance_type || '—'}</td>
                <td className="p-3">{m.description}</td>
                <td className="p-3 text-gray-600">{m.technician || '—'}</td>
                <td className="p-3 text-right font-mono">{m.cost?.toFixed(2)} €</td>
                <td className="p-3">
                  {m.next_due_date ? (
                    <span className={m.next_due_date < today ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      {m.next_due_date}
                    </span>
                  ) : '—'}
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(m.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {all.length === 0 && (
              <tr><td colSpan="8" className="p-8 text-center text-gray-500">Noch keine Wartungseinträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Wartung eintragen">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Drucker *</label>
            <select className="input" required value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}>
              <option value="">— wählen —</option>
              {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Datum *</label>
              <input type="date" className="input" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Typ</label>
              <input className="input" placeholder="Düsenwechsel..." value={form.maintenance_type}
                onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Beschreibung *</label>
            <textarea className="input" rows="3" required value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Techniker</label>
              <input className="input" value={form.technician}
                onChange={(e) => setForm({ ...form, technician: e.target.value })} />
            </div>
            <div>
              <label className="label">Kosten (€)</label>
              <input type="number" step="0.01" className="input" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Nächste Wartung</label>
              <input type="date" className="input" value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
