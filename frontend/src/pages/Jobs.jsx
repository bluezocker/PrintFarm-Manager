import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, FileText, Edit2, Trash2, Calculator, Receipt, X, ArrowRight } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const STATUS = [
  { value: 'new', label: 'Neu', color: 'bg-gray-100 text-gray-800' },
  { value: 'in_progress', label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800' },
  { value: 'printing', label: 'Druckt', color: 'bg-green-100 text-green-800' },
  { value: 'completed', label: 'Fertig', color: 'bg-purple-100 text-purple-800' },
  { value: 'paid', label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'cancelled', label: 'Storniert', color: 'bg-red-100 text-red-800' },
]

const empty = {
  customer_id: '', title: '', description: '', status: 'new',
  order_date: new Date().toISOString().slice(0, 10), due_date: '',
  quantity: 1, estimated_hours: '', estimated_material_g: '',
  price_net: 0, price_gross: 0, vat_rate: 19, notes: '',
  print_file_name: '',
}

export default function Jobs() {
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [printers, setPrinters] = useState([])
  const [filaments, setFilaments] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [filRows, setFilRows] = useState([])  // Legacy Filament-Reservierungen (falls keine Platten)
  const [plates, setPlates] = useState([])    // Druckplatten: [{ name, duration_hours, filaments:[{filament_id, grams_reserved}] }]
  const [filterStatus, setFilterStatus] = useState('')
  const [calcModal, setCalcModal] = useState(null)
  const [calcConfig, setCalcConfig] = useState({ printer_id: '', filament_id: '' })
  const [defaultVat, setDefaultVat] = useState(19)  // aus Firmendaten

  const load = async () => {
    const url = filterStatus ? `/jobs?status=${filterStatus}` : '/jobs'
    const [j, c, p, f] = await Promise.all([
      api.get(url),
      api.get('/customers'),
      api.get('/printers'),
      api.get('/filaments'),
    ])
    setJobs(j.data)
    setCustomers(c.data)
    setPrinters(p.data)
    setFilaments(f.data)
    // Firmen-MwSt als Default für neue Aufträge
    try {
      const co = await api.get('/company')
      const v = co.data?.default_vat_rate
      if (v !== null && v !== undefined && !isNaN(v)) setDefaultVat(Number(v))
    } catch {}
  }

  useEffect(() => { load() }, [filterStatus])

  // Beim Aufruf via /jobs?edit=123 das passende Modal automatisch öffnen
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId || jobs.length === 0) return
    const job = jobs.find((j) => String(j.id) === String(editId))
    if (job) {
      openEdit(job)
      // URL-Parameter wieder entfernen
      searchParams.delete('edit')
      setSearchParams(searchParams, { replace: true })
    }
  }, [jobs, searchParams])

  const openNew = () => {
    setEditing(null)
    setForm({ ...empty, vat_rate: defaultVat })
    setFilRows([])
    setPlates([{ name: 'Platte 1', duration_hours: 0, filaments: [{ filament_id: '', grams_reserved: 0 }] }])
    setOpen(true)
  }

  const openEdit = (j) => {
    setEditing(j)
    setForm({
      ...empty, ...j,
      estimated_hours: j.estimated_hours ?? '',
      estimated_material_g: j.estimated_material_g ?? '',
      due_date: j.due_date || '',
      order_date: j.order_date || '',
    })
    // Platten aus DB rekonstruieren
    if (j.plates && j.plates.length > 0) {
      setPlates(j.plates.map((p, idx) => ({
        name: p.name || `Platte ${idx + 1}`,
        duration_hours: p.duration_hours || 0,
        filaments: p.filaments && p.filaments.length > 0
          ? p.filaments.map((f) => ({
              filament_id: f.filament_id || '',
              grams_reserved: f.grams_reserved || 0,
            }))
          : [{ filament_id: '', grams_reserved: 0 }],
      })))
      setFilRows([])
    } else {
      // Legacy: keine Platten, alte Filament-Liste
      setPlates([])
      setFilRows(
        (j.reserved_filaments || []).map((r) => ({
          filament_id: r.filament_id || '',
          grams_reserved: r.grams_reserved || 0,
        }))
      )
    }
    setOpen(true)
  }

  // === Platten-Verwaltung ===
  const addPlate = () => setPlates([
    ...plates,
    { name: `Platte ${plates.length + 1}`, duration_hours: 0, filaments: [{ filament_id: '', grams_reserved: 0 }] },
  ])
  const removePlate = (i) => setPlates(plates.filter((_, idx) => idx !== i))
  const updatePlateField = (i, field, value) => {
    const next = [...plates]
    next[i] = { ...next[i], [field]: value }
    setPlates(next)
  }
  const addFilToPlate = (plateIdx) => {
    const next = [...plates]
    next[plateIdx] = {
      ...next[plateIdx],
      filaments: [...next[plateIdx].filaments, { filament_id: '', grams_reserved: 0 }],
    }
    setPlates(next)
  }
  const removeFilFromPlate = (plateIdx, filIdx) => {
    const next = [...plates]
    next[plateIdx] = {
      ...next[plateIdx],
      filaments: next[plateIdx].filaments.filter((_, i) => i !== filIdx),
    }
    setPlates(next)
  }
  const updateFilOfPlate = (plateIdx, filIdx, field, value) => {
    const next = [...plates]
    const fils = [...next[plateIdx].filaments]
    fils[filIdx] = { ...fils[filIdx], [field]: value }
    next[plateIdx] = { ...next[plateIdx], filaments: fils }
    setPlates(next)
  }

  // Aggregate über alle Platten
  const totalDuration = plates.reduce((s, p) => s + (parseFloat(p.duration_hours) || 0), 0)
  const totalGrams = plates.reduce(
    (s, p) => s + p.filaments.reduce((ss, f) => ss + (parseFloat(f.grams_reserved) || 0), 0),
    0,
  )

  // Legacy für alten Block, falls Plates leer (alte Aufträge)
  const addFilRow = () => setFilRows([...filRows, { filament_id: '', grams_reserved: 0 }])
  const removeFilRow = (i) => setFilRows(filRows.filter((_, idx) => idx !== i))
  const updateFilRow = (i, field, value) => {
    const next = [...filRows]
    next[i] = { ...next[i], [field]: value }
    setFilRows(next)
  }
  const totalReserved = filRows.reduce((s, r) => s + (parseFloat(r.grams_reserved) || 0), 0)

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['estimated_hours', 'estimated_material_g'].forEach((k) => {
      if (payload[k] === '') payload[k] = null
      else if (payload[k] != null) payload[k] = Number(payload[k])
    })
    if (!payload.due_date) payload.due_date = null
    if (!payload.order_date) payload.order_date = null
    payload.customer_id = Number(payload.customer_id)
    payload.quantity = Number(payload.quantity)
    payload.price_net = Number(payload.price_net) || 0
    payload.price_gross = Number(payload.price_gross) || 0
    const vatNum = parseFloat(payload.vat_rate)
    payload.vat_rate = isNaN(vatNum) ? defaultVat : vatNum

    // Plates haben Vorrang, sonst Legacy-Filaments
    if (plates.length > 0) {
      const validPlates = plates
        .map((p, idx) => ({
          position: idx + 1,
          name: p.name || `Platte ${idx + 1}`,
          duration_hours: parseFloat(p.duration_hours) || 0,
          filaments: p.filaments
            .filter((f) => f.filament_id && parseFloat(f.grams_reserved) > 0)
            .map((f) => ({
              filament_id: Number(f.filament_id),
              grams_reserved: parseFloat(f.grams_reserved),
            })),
        }))
      payload.plates = validPlates
      // estimated_* werden im Backend aus Plates-Summen gesetzt
      delete payload.estimated_hours
      delete payload.estimated_material_g
    } else {
      const filaments_list = filRows
        .filter((r) => r.filament_id && parseFloat(r.grams_reserved) > 0)
        .map((r) => ({
          filament_id: Number(r.filament_id),
          grams_reserved: parseFloat(r.grams_reserved),
        }))
      if (filaments_list.length > 0) payload.filaments = filaments_list
      else if (editing) payload.filaments = []
    }

    try {
      if (editing) {
        const { customer_id, ...up } = payload
        await api.patch(`/jobs/${editing.id}`, up)
      } else {
        await api.post('/jobs', payload)
      }
      setOpen(false)
      load()
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const remove = async (id) => {
    if (!confirm('Auftrag löschen?')) return
    await api.delete(`/jobs/${id}`)
    load()
  }

  const customerName = (c) => {
    if (!c) return '—'
    return c.customer_type === 'business' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim()
  }

  const statusBadge = (s) => {
    const st = STATUS.find((x) => x.value === s) || STATUS[0]
    return <span className={`badge ${st.color}`}>{st.label}</span>
  }

  // Auto-Brutto berechnen
  const updateNet = (net) => {
    const n = parseFloat(net) || 0
    const gross = n * (1 + (form.vat_rate || 0) / 100)
    setForm({ ...form, price_net: n, price_gross: Math.round(gross * 100) / 100 })
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Druckaufträge</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Auftrag anlegen
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterStatus('')} className={`px-3 py-1 rounded-md text-sm ${!filterStatus ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
          Alle ({jobs.length})
        </button>
        {STATUS.map((s) => (
          <button key={s.value} onClick={() => setFilterStatus(s.value)}
            className={`px-3 py-1 rounded-md text-sm ${filterStatus === s.value ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Nr.</th>
              <th className="p-3 text-left">Titel</th>
              <th className="p-3 text-left">Kunde</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Fällig</th>
              <th className="p-3 text-right">Kalkuliert</th>
              <th className="p-3 text-right">Verkaufspreis</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const diff = j.calculated_price_net && j.price_net
                ? j.price_net - j.calculated_price_net
                : null
              return (
                <tr key={j.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{j.order_number}</td>
                  <td className="p-3 font-medium">
                    {j.title}
                    {j.print_file_name && (
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <span>📄</span>
                        <span className="font-mono">{j.print_file_name}</span>
                        {j.customer_notified_start && (
                          <span className="text-green-600" title="Kunde wurde benachrichtigt">✉️</span>
                        )}
                      </div>
                    )}
                    {j.plates && j.plates.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {j.plates.length} Druckplatte{j.plates.length > 1 ? 'n' : ''}
                      </div>
                    )}
                    {j.reserved_filaments && j.reserved_filaments.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {j.reserved_filaments.slice(0, 6).map((r, i) => (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ background: r.filament?.color_hex || '#999' }}
                            title={`${r.filament?.material || ''} ${r.filament?.color || ''} – ${r.grams_reserved?.toFixed(0)} g`}
                          />
                        ))}
                        <span className="text-xs text-gray-400 ml-1">
                          {j.reserved_filaments.reduce((s, r) => s + (r.grams_reserved || 0), 0).toFixed(0)} g
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">{customerName(j.customer)}</td>
                  <td className="p-3">{statusBadge(j.status)}</td>
                  <td className="p-3 text-gray-600">{j.due_date || '—'}</td>
                  <td className="p-3 text-right">
                    {j.calculated_price_net != null ? (
                      <div>
                        <div className="font-mono">{j.calculated_price_net.toFixed(2)} €</div>
                        {j.calculated_cost_net != null && (
                          <div className="text-xs text-gray-400">Kosten: {j.calculated_cost_net.toFixed(2)} €</div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setCalcModal(j)}
                        className="text-primary-600 hover:text-primary-700 text-xs flex items-center gap-1 ml-auto"
                      >
                        <Calculator className="w-3 h-3" /> berechnen
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-mono">{j.price_gross?.toFixed(2)} €</div>
                    {diff != null && Math.abs(diff) > 0.01 && (
                      <div className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(2)} €
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {j.calculated_price_net != null && (
                      <button onClick={() => setCalcModal(j)} className="text-gray-400 hover:text-primary-600 mr-2" title="Neu berechnen">
                        <Calculator className="w-4 h-4" />
                      </button>
                    )}
                    {j.reserved_filaments && j.reserved_filaments.length > 0 && j.status !== 'completed' && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Auftrag "${j.title}" in Druckhistorie übernehmen und als fertig markieren?`)) return
                          try {
                            await api.post(`/jobs/${j.id}/move-to-history`)
                            load()
                          } catch (e) {
                            alert('Fehler: ' + (e.response?.data?.detail || e.message))
                          }
                        }}
                        className="text-gray-400 hover:text-green-600 mr-2"
                        title="In Druckhistorie übernehmen"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`Rechnung aus "${j.title}" erstellen?`)) return
                        try {
                          const r = await api.post(`/invoices/from-job/${j.id}`)
                          alert(`Rechnung ${r.data.invoice_number} erstellt!`)
                        } catch (e) {
                          alert('Fehler: ' + (e.response?.data?.detail || e.message))
                        }
                      }}
                      className="text-gray-400 hover:text-primary-600 mr-2"
                      title="Rechnung erstellen"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(j)} className="text-gray-400 hover:text-primary-600 mr-2"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => remove(j.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              )
            })}
            {jobs.length === 0 && (
              <tr><td colSpan="8" className="p-8 text-center text-gray-500">Keine Aufträge</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Auftrag bearbeiten' : 'Auftrag anlegen'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Kunde *</label>
              <select className="input" required disabled={!!editing}
                value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— Kunde wählen —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerName(c)} {c.email ? `(${c.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Titel *</label>
              <input className="input" required value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Beschreibung</label>
              <textarea className="input" rows="2" value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stückzahl</label>
              <input type="number" min="1" className="input" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Bestelldatum</label>
              <input type="date" className="input" value={form.order_date}
                onChange={(e) => setForm({ ...form, order_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Liefertermin</label>
              <input type="date" className="input" value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Geschätzte Stunden</label>
              <input type="number" step="0.1"
                className={plates.length > 0 ? "input bg-gray-50" : "input"}
                readOnly={plates.length > 0}
                value={plates.length > 0 ? totalDuration.toFixed(1) : form.estimated_hours}
                onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
              {plates.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">Summe aller Druckplatten</p>
              )}
            </div>
            <div>
              <label className="label">Materialbedarf (g)</label>
              <input type="number" step="0.1" className="input bg-gray-50" readOnly
                value={
                  plates.length > 0
                    ? totalGrams.toFixed(1)
                    : (totalReserved > 0 ? totalReserved.toFixed(1) : (form.estimated_material_g || ''))
                } />
              <p className="text-xs text-gray-500 mt-1">
                {plates.length > 0
                  ? 'Summe aller Filamente in allen Platten'
                  : 'Wird automatisch aus reservierten Filamenten berechnet'}
              </p>
            </div>
            <div>
              <label className="label">Netto (€)</label>
              <input type="number" step="0.01" className="input" value={form.price_net}
                onChange={(e) => updateNet(e.target.value)} />
            </div>
            <div>
              <label className="label">MwSt (%)</label>
              <input type="number" step="0.01" min="0" className="input" value={form.vat_rate}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value)
                  const v = isNaN(parsed) ? 0 : parsed
                  setForm({ ...form, vat_rate: v, price_gross: Math.round((form.price_net * (1 + v/100)) * 100) / 100 })
                }} />
            </div>
            <div className="col-span-2">
              <label className="label">Brutto (€)</label>
              <input type="number" step="0.01" className="input bg-gray-50" readOnly value={form.price_gross} />
            </div>
            <div className="col-span-2 border-t pt-3 mt-2">
              <div className="flex justify-between items-center mb-3">
                <label className="label mb-0">Druckplatten</label>
                <div className="text-xs text-gray-500 flex gap-3">
                  <span>Gesamt-Zeit: <strong>{totalDuration.toFixed(1)} h</strong></span>
                  <span>Gesamt-Material: <strong>{totalGrams.toFixed(1)} g</strong></span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Jede Druckplatte hat eigene Druckzeit und eigene Filamente.
                Filamente werden für die Gesamtsumme reserviert.
              </p>

              {plates.length === 0 && filRows.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-3 text-sm">
                  <p className="text-amber-800">
                    Dieser Auftrag nutzt das alte Format (ohne Platten).
                    Du kannst es zu Platten konvertieren oder das alte Format weiterführen.
                  </p>
                  <button type="button"
                    onClick={() => {
                      setPlates([{
                        name: 'Platte 1',
                        duration_hours: parseFloat(form.estimated_hours) || 0,
                        filaments: filRows.map((r) => ({ ...r })),
                      }])
                      setFilRows([])
                    }}
                    className="mt-2 text-sm text-primary-600 hover:underline">
                    → In Platten-Format umwandeln
                  </button>
                </div>
              )}

              {plates.length === 0 && filRows.length === 0 && (
                <button type="button" onClick={addPlate}
                  className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1 mb-3">
                  <Plus className="w-3 h-3" /> Erste Druckplatte hinzufügen
                </button>
              )}

              <div className="space-y-4">
                {plates.map((plate, pIdx) => {
                  const plateGrams = plate.filaments.reduce(
                    (s, f) => s + (parseFloat(f.grams_reserved) || 0), 0,
                  )
                  return (
                    <div key={pIdx} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <input className="input flex-1 text-sm font-medium"
                          placeholder={`Platte ${pIdx + 1}`}
                          value={plate.name}
                          onChange={(e) => updatePlateField(pIdx, 'name', e.target.value)} />
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.1" min="0" className="input w-20 text-sm"
                            placeholder="h"
                            value={plate.duration_hours}
                            onChange={(e) => updatePlateField(pIdx, 'duration_hours', e.target.value)} />
                          <span className="text-xs text-gray-500">h</span>
                        </div>
                        <span className="text-xs text-gray-500 w-20 text-right">
                          {plateGrams.toFixed(1)} g
                        </span>
                        {plates.length > 1 && (
                          <button type="button" onClick={() => removePlate(pIdx)}
                            className="text-gray-400 hover:text-red-600">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-2 pl-2">
                        {plate.filaments.map((f, fIdx) => {
                          const sel = filaments.find((x) => x.id === Number(f.filament_id))
                          return (
                            <div key={fIdx} className="flex gap-2 items-center">
                              {sel?.color_hex && (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0"
                                  style={{ background: sel.color_hex }} />
                              )}
                              <select className="input flex-1 text-xs" value={f.filament_id}
                                onChange={(e) => updateFilOfPlate(pIdx, fIdx, 'filament_id', e.target.value)}>
                                <option value="">— Filament —</option>
                                {filaments.map((fl) => (
                                  <option key={fl.id} value={fl.id}>
                                    {fl.material} {fl.color} ({fl.manufacturer}) — Rest {fl.remaining_weight?.toFixed(0)}g
                                  </option>
                                ))}
                              </select>
                              <input type="number" step="0.1" min="0" className="input w-20 text-xs"
                                placeholder="g"
                                value={f.grams_reserved}
                                onChange={(e) => updateFilOfPlate(pIdx, fIdx, 'grams_reserved', e.target.value)} />
                              {plate.filaments.length > 1 && (
                                <button type="button" onClick={() => removeFilFromPlate(pIdx, fIdx)}
                                  className="text-gray-400 hover:text-red-600">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button type="button" onClick={() => addFilToPlate(pIdx)}
                        className="text-primary-600 hover:text-primary-700 text-xs flex items-center gap-1 mt-2 ml-2">
                        <Plus className="w-3 h-3" /> Filament zu Platte hinzufügen
                      </button>
                    </div>
                  )
                })}
              </div>

              {plates.length > 0 && (
                <button type="button" onClick={addPlate}
                  className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1 mt-3">
                  <Plus className="w-3 h-3" /> Weitere Druckplatte
                </button>
              )}

              {/* Legacy: alte Aufträge ohne Plates haben noch filRows */}
              {plates.length === 0 && filRows.length > 0 && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs text-gray-500">Bestehende Filament-Reservierungen (altes Format):</p>
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
                          <option value="">— Filament wählen —</option>
                          {filaments.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.material} {f.color} ({f.manufacturer}) — Rest {f.remaining_weight?.toFixed(0)}g
                            </option>
                          ))}
                        </select>
                        <input type="number" step="0.1" min="0" className="input w-24 text-sm"
                          placeholder="g" value={r.grams_reserved}
                          onChange={(e) => updateFilRow(i, 'grams_reserved', e.target.value)} />
                        <button type="button" onClick={() => removeFilRow(i)} className="text-gray-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label className="label">
                Druck-Dateiname
                <span className="text-xs text-gray-500 font-normal ml-2">
                  (für automatische Kunden-Benachrichtigung)
                </span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="z.B. wuerfel.3mf"
                value={form.print_file_name || ''}
                onChange={(e) => setForm({ ...form, print_file_name: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Trag hier den Dateinamen ein, wie er auf dem Drucker erscheint.
                Sobald die Datei gedruckt wird, bekommt der Kunde automatisch eine E-Mail.
              </p>
            </div>
            <div className="col-span-2">
              <label className="label">Notizen</label>
              <textarea className="input" rows="2" value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>

      <CalcDialog
        job={calcModal}
        onClose={() => setCalcModal(null)}
        onSaved={() => { setCalcModal(null); load() }}
        printers={printers}
        filaments={filaments}
      />
    </div>
  )
}

function CalcDialog({ job, onClose, onSaved, printers, filaments }) {
  const [printerId, setPrinterId] = useState('')
  // Multi-Filament Liste
  const [rows, setRows] = useState([{ filament_id: '', grams: 0 }])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (job) {
      setPrinterId(printers[0]?.id || '')
      // Bei Öffnen: eine leere Zeile, vorausgefüllt mit estimated_material_g
      setRows([{ filament_id: '', grams: job.estimated_material_g || 0 }])
      setResult(null)
      setError('')
    }
  }, [job, printers])

  if (!job) return null

  const canCalc = job.estimated_hours

  const totalGrams = rows.reduce((s, r) => s + (parseFloat(r.grams) || 0), 0)

  const addRow = () => setRows([...rows, { filament_id: '', grams: 0 }])
  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i))
  const updateRow = (i, f, v) => {
    const next = [...rows]
    next[i] = { ...next[i], [f]: v }
    setRows(next)
  }

  const calculate = async () => {
    setError('')
    setLoading(true)
    try {
      const usedFilaments = rows
        .filter((r) => r.filament_id && parseFloat(r.grams) > 0)
        .map((r) => ({ filament_id: Number(r.filament_id), grams: parseFloat(r.grams) }))

      const body = { printer_id: Number(printerId) }
      if (usedFilaments.length > 0) {
        body.filaments = usedFilaments
      } else if (rows.some((r) => r.filament_id)) {
        // Erstes ausgewähltes Filament als Single
        const first = rows.find((r) => r.filament_id)
        body.filament_id = Number(first.filament_id)
      }
      const r = await api.post(`/calculation/jobs/${job.id}/calculate`, body)
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={!!job} onClose={onClose} title={`Kalkulation: ${job.title}`} size="lg">
      {!canCalc ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded">
          Bitte zuerst <strong>Geschätzte Stunden</strong> im Auftrag eintragen.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            <div>Druckzeit: <strong>{job.estimated_hours} h</strong></div>
            <div>Stückzahl: <strong>{job.quantity || 1}</strong></div>
            {job.estimated_material_g && (
              <div>Materialschätzung (gesamt): <strong>{job.estimated_material_g} g</strong></div>
            )}
          </div>

          <div>
            <label className="label">Drucker *</label>
            <select className="input" value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
              <option value="">— wählen —</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.hourly_rate ?? 0} €/h)</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0">Filamente</label>
              <span className="text-xs text-gray-500">Summe: <strong>{totalGrams.toFixed(1)} g</strong></span>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const sel = filaments.find((f) => f.id === Number(r.filament_id))
                return (
                  <div key={i} className="flex gap-2 items-center">
                    {sel?.color_hex && (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0"
                        style={{ background: sel.color_hex }} />
                    )}
                    <select className="input flex-1 text-sm" value={r.filament_id}
                      onChange={(e) => updateRow(i, 'filament_id', e.target.value)}>
                      <option value="">— Filament —</option>
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.material} {f.color} {f.purchase_price ? `(${(f.purchase_price/f.spool_weight*1000).toFixed(2)} €/kg)` : '(kein Preis)'}
                        </option>
                      ))}
                    </select>
                    <input type="number" step="0.1" min="0" className="input w-24 text-sm"
                      placeholder="g" value={r.grams}
                      onChange={(e) => updateRow(i, 'grams', e.target.value)} />
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={addRow} className="text-primary-600 hover:text-primary-700 text-sm mt-2 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Weiteres Filament
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}

          <button onClick={calculate} disabled={loading || !printerId} className="btn-primary w-full">
            {loading ? 'Berechne...' : 'Berechnen & im Auftrag speichern'}
          </button>

          {result && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 space-y-2 text-sm">
              {result.details.filaments.length > 1 && (
                <div className="border-b pb-2 mb-2">
                  <p className="text-xs text-gray-600 mb-1">Material-Mix:</p>
                  {result.details.filaments.map((f, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span>{f.name} ({f.grams.toFixed(1)} g)</span>
                      <span className="font-mono">{f.cost.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between">
                <span>Maschinenzeit:</span>
                <span className="font-mono">{result.per_unit.machine_cost.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Strom ({result.details.power_source}):</span>
                <span className="font-mono">{result.per_unit.power_cost.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Material gesamt:</span>
                <span className="font-mono">{result.per_unit.material_cost.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Selbstkosten gesamt:</span>
                <span className="font-mono">{result.total_cost_net.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-primary-700 font-bold text-lg pt-2 border-t">
                <span>Verkaufspreis (+ {result.margin_percent}%):</span>
                <span className="font-mono">{result.calculated_price_net.toFixed(2)} €</span>
              </div>
              <button onClick={onSaved} className="btn-secondary w-full text-sm mt-2">
                Schließen & Liste aktualisieren
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
