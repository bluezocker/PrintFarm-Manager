import { useEffect, useState } from 'react'
import { Plus, CheckCircle, XCircle, Clock, Calculator, X } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

export default function History() {
  const [entries, setEntries] = useState([])
  const [printers, setPrinters] = useState([])
  const [filaments, setFilaments] = useState([])
  const [jobs, setJobs] = useState([])
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(30)
  const [filterPrinter, setFilterPrinter] = useState('')

  const empty = {
    printer_id: '', job_id: '',
    job_name: '', file_name: '',
    start_time: '', end_time: '', duration_minutes: '',
    power_used_kwh: '', status: 'success', layer_count: '', notes: '',
  }
  const [form, setForm] = useState(empty)
  // Filament-Verbrauch als Liste (Multi-Color-fähig)
  const [filRows, setFilRows] = useState([{ filament_id: '', grams_used: '' }])
  const [costEntry, setCostEntry] = useState(null)
  const [costResult, setCostResult] = useState(null)

  const load = async () => {
    const params = new URLSearchParams({ days: String(days) })
    if (filterPrinter) params.append('printer_id', filterPrinter)
    const [h, p, f, j] = await Promise.all([
      api.get(`/history?${params}`),
      api.get('/printers'),
      api.get('/filaments'),
      api.get('/jobs'),
    ])
    setEntries(h.data)
    setPrinters(p.data)
    setFilaments(f.data)
    setJobs(j.data)
  }

  useEffect(() => { load() }, [days, filterPrinter])

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['duration_minutes', 'power_used_kwh', 'layer_count'].forEach((k) => {
      if (payload[k] === '') payload[k] = null
      else if (payload[k] != null) payload[k] = Number(payload[k])
    })
    payload.printer_id = Number(payload.printer_id)
    if (!payload.job_id) payload.job_id = null
    else payload.job_id = Number(payload.job_id)
    if (!payload.start_time) payload.start_time = null
    if (!payload.end_time) payload.end_time = null

    // Multi-Filament Liste zusammenbauen
    const filaments = filRows
      .filter((r) => r.filament_id && parseFloat(r.grams_used) > 0)
      .map((r) => ({
        filament_id: Number(r.filament_id),
        grams_used: parseFloat(r.grams_used),
      }))
    if (filaments.length > 0) {
      payload.filaments = filaments
    }

    await api.post('/history', payload)
    setOpen(false)
    setForm(empty)
    setFilRows([{ filament_id: '', grams_used: '' }])
    load()
  }

  const addFilRow = () => setFilRows([...filRows, { filament_id: '', grams_used: '' }])
  const removeFilRow = (i) => setFilRows(filRows.filter((_, idx) => idx !== i))
  const updateFilRow = (i, field, value) => {
    const next = [...filRows]
    next[i] = { ...next[i], [field]: value }
    setFilRows(next)
  }
  const totalRowGrams = filRows.reduce((s, r) => s + (parseFloat(r.grams_used) || 0), 0)

  const remove = async (id) => {
    if (!confirm('Eintrag löschen?')) return
    await api.delete(`/history/${id}`)
    load()
  }

  const statusIcon = (s) => {
    if (s === 'success') return <CheckCircle className="w-4 h-4 text-green-600" />
    if (s === 'failed') return <XCircle className="w-4 h-4 text-red-600" />
    return <Clock className="w-4 h-4 text-yellow-600" />
  }

  const printerName = (id) => printers.find((p) => p.id === id)?.name || '—'
  const filamentName = (id) => {
    const f = filaments.find((x) => x.id === id)
    return f ? `${f.material} ${f.color || ''}`.trim() : null
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Druckhistorie</h1>

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <select className="input max-w-xs" value={filterPrinter} onChange={(e) => setFilterPrinter(e.target.value)}>
          <option value="">Alle Drucker</option>
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input max-w-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="7">Letzte 7 Tage</option>
          <option value="30">Letzte 30 Tage</option>
          <option value="90">Letzte 90 Tage</option>
          <option value="365">Letztes Jahr</option>
        </select>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2 ml-auto">
          <Plus className="w-4 h-4" /> Eintrag hinzufügen
        </button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Drucker</th>
              <th className="p-3 text-left">Job</th>
              <th className="p-3 text-left">Filament</th>
              <th className="p-3 text-left">Start</th>
              <th className="p-3 text-right">Dauer</th>
              <th className="p-3 text-right">Material</th>
              <th className="p-3 text-right">kWh</th>
              <th className="p-3 text-right">Kosten</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{statusIcon(e.status)}</td>
                <td className="p-3">{printerName(e.printer_id)}</td>
                <td className="p-3 font-medium">{e.job_name}</td>
                <td className="p-3 text-gray-600">
                  {e.filament_usage && e.filament_usage.length > 0 ? (
                    <div className="flex items-center gap-1">
                      {e.filament_usage.slice(0, 5).map((u, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ background: u.filament?.color_hex || '#aaa' }}
                          title={`${u.filament ? u.filament.material + ' ' + (u.filament.color || '') : 'Filament gelöscht'} – ${u.grams_used?.toFixed(1)} g`}
                        />
                      ))}
                      {e.filament_usage.length > 5 && (
                        <span className="text-xs text-gray-400 ml-1">+{e.filament_usage.length - 5}</span>
                      )}
                      <span className="text-xs ml-1">
                        {e.filament_usage.length === 1
                          ? filamentName(e.filament_usage[0].filament_id) || '—'
                          : `${e.filament_usage.length} Farben`}
                      </span>
                    </div>
                  ) : (
                    filamentName(e.filament_id) || '—'
                  )}
                </td>
                <td className="p-3 text-gray-600 text-xs">
                  {e.start_time ? new Date(e.start_time).toLocaleString('de-DE') : '—'}
                </td>
                <td className="p-3 text-right">
                  {e.duration_minutes ? `${Math.floor(e.duration_minutes / 60)}h ${e.duration_minutes % 60}m` : '—'}
                </td>
                <td className="p-3 text-right">{e.material_used_g ? `${e.material_used_g.toFixed(1)} g` : '—'}</td>
                <td className="p-3 text-right">{e.power_used_kwh ? e.power_used_kwh.toFixed(2) : '—'}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={async () => {
                      try {
                        const r = await api.get(`/calculation/history/${e.id}/cost`)
                        setCostEntry(e)
                        setCostResult(r.data)
                      } catch (err) {
                        alert(err.response?.data?.detail || 'Berechnung nicht möglich')
                      }
                    }}
                    className="text-primary-600 hover:text-primary-700 text-xs flex items-center gap-1 ml-auto"
                    title="Kosten berechnen"
                  >
                    <Calculator className="w-3 h-3" /> Kosten
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(e.id)} className="text-gray-400 hover:text-red-600 text-xs">Löschen</button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan="10" className="p-8 text-center text-gray-500">Keine Einträge im Zeitraum.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Druckhistorie hinzufügen" size="lg">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Drucker *</label>
              <select className="input" required value={form.printer_id}
                onChange={(e) => setForm({ ...form, printer_id: e.target.value })}>
                <option value="">— wählen —</option>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="success">Erfolgreich</option>
                <option value="failed">Fehlgeschlagen</option>
                <option value="cancelled">Abgebrochen</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Job-Name *</label>
              <input className="input" required value={form.job_name}
                onChange={(e) => setForm({ ...form, job_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Dateiname</label>
              <input className="input" value={form.file_name}
                onChange={(e) => setForm({ ...form, file_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Layer-Anzahl</label>
              <input type="number" className="input" value={form.layer_count}
                onChange={(e) => setForm({ ...form, layer_count: e.target.value })} />
            </div>
            <div>
              <label className="label">Kundenauftrag</label>
              <select className="input" value={form.job_id}
                onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
                <option value="">— keiner —</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.order_number} - {j.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start</label>
              <input type="datetime-local" className="input" value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <label className="label">Ende</label>
              <input type="datetime-local" className="input" value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div>
              <label className="label">Dauer (Min)</label>
              <input type="number" className="input" value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
            </div>
            <div>
              <label className="label">Strom (kWh)</label>
              <input type="number" step="0.001" className="input" value={form.power_used_kwh}
                onChange={(e) => setForm({ ...form, power_used_kwh: e.target.value })} />
            </div>
            <div className="col-span-2 border-t pt-3 mt-2">
              <div className="flex justify-between items-center mb-2">
                <label className="label mb-0">Verbrauchte Filamente</label>
                <span className="text-xs text-gray-500">Summe: <strong>{totalRowGrams.toFixed(1)} g</strong></span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Filament-Restbestände werden automatisch reduziert
              </p>
              <div className="space-y-2">
                {filRows.map((r, i) => {
                  const sel = filaments.find((f) => f.id === Number(r.filament_id))
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      {sel?.color_hex && (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0"
                          style={{ background: sel.color_hex }} />
                      )}
                      <select className="input flex-1 text-sm" value={r.filament_id}
                        onChange={(e) => updateFilRow(i, 'filament_id', e.target.value)}>
                        <option value="">— Filament —</option>
                        {filaments.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.material} {f.color} ({f.manufacturer}) — Rest {f.remaining_weight?.toFixed(0)}g
                          </option>
                        ))}
                      </select>
                      <input type="number" step="0.1" min="0" className="input w-24 text-sm"
                        placeholder="g" value={r.grams_used}
                        onChange={(e) => updateFilRow(i, 'grams_used', e.target.value)} />
                      {filRows.length > 1 && (
                        <button type="button" onClick={() => removeFilRow(i)} className="text-gray-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={addFilRow}
                className="text-primary-600 hover:text-primary-700 text-sm mt-2 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Weiteres Filament
              </button>
            </div>
            <div className="col-span-2">
              <label className="label">Notizen</label>
              <textarea className="input" rows="2" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!costEntry}
        onClose={() => { setCostEntry(null); setCostResult(null) }}
        title="Kosten dieses Drucks"
      >
        {costResult && (
          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 p-3 rounded text-xs">
              <div><strong>{costEntry?.job_name}</strong></div>
              <div>{costResult.duration_hours} h · {costResult.material_g} g · {costResult.details.kwh_used} kWh ({costResult.details.power_source})</div>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="border-b">
                  <td className="py-2">Maschinenzeit ({costResult.details.hourly_rate.toFixed(2)} €/h)</td>
                  <td className="py-2 text-right font-mono">{costResult.per_unit.machine_cost.toFixed(2)} €</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Strom ({costResult.details.power_price_kwh.toFixed(2)} €/kWh)</td>
                  <td className="py-2 text-right font-mono">{costResult.per_unit.power_cost.toFixed(2)} €</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    Material
                    {costResult.details.filaments && costResult.details.filaments.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        {costResult.details.filaments.map((f, i) => (
                          <div key={i}>
                            {f.name} – {f.grams.toFixed(1)} g × {f.price_per_kg} €/kg = {f.cost.toFixed(2)} €
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">{costResult.per_unit.material_cost.toFixed(2)} €</td>
                </tr>
                <tr className="bg-primary-50 font-bold">
                  <td className="py-3 px-2">Selbstkosten</td>
                  <td className="py-3 px-2 text-right font-mono text-primary-700">
                    {costResult.per_unit.total_cost.toFixed(2)} €
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="text-xs text-gray-500 italic">
              Zum Vergleich – Verkaufspreis mit {costResult.margin_percent}% Marge: <strong>{costResult.calculated_price_net.toFixed(2)} €</strong>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
