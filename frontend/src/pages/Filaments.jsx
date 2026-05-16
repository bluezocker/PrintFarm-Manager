import { useEffect, useState } from 'react'
import { Plus, Package, Edit2, Trash2, ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA (Nylon)', 'PC', 'PVA', 'HIPS', 'Wood', 'PLA+', 'PETG-CF', 'PA-CF']

const emptySpool = {
  material: 'PLA', manufacturer: '', color: '', color_hex: '#000000',
  diameter: 1.75, nozzle_temp: 210, bed_temp: 60,
  spool_weight: 1000, remaining_weight: 1000,
  purchase_price: 0, purchase_date: '', batch_number: '',
  storage_id: '', notes: '',
}

const emptyAddSpool = {
  spool_weight: 1000, remaining_weight: 1000,
  purchase_price: 0, purchase_date: '',
  batch_number: '', storage_id: '', notes: '',
}

function ColorDot({ hex, size = 16 }) {
  return (
    <div
      className="rounded-full border-2 border-gray-200 flex-shrink-0"
      style={{ background: hex || '#aaa', width: size, height: size }}
    />
  )
}

function PercentBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function Filaments() {
  const [groups, setGroups] = useState([])
  const [brands, setBrands] = useState({ suggested: [], custom: [] })
  const [storage, setStorage] = useState([])
  const [expanded, setExpanded] = useState({})

  // Modal-States
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState(emptySpool)
  const [customBrand, setCustomBrand] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editingSpool, setEditingSpool] = useState(null)
  const [editForm, setEditForm] = useState(emptySpool)

  const [addSpoolOpen, setAddSpoolOpen] = useState(false)
  const [addSpoolGroup, setAddSpoolGroup] = useState(null)
  const [addSpoolForm, setAddSpoolForm] = useState(emptyAddSpool)

  const load = async () => {
    const [g, b, s] = await Promise.all([
      api.get('/filaments/grouped'),
      api.get('/filaments/brands'),
      api.get('/storage'),
    ])
    setGroups(g.data)
    setBrands(b.data)
    setStorage(s.data)
  }

  useEffect(() => { load() }, [])

  const allBrands = [...brands.suggested, ...brands.custom].sort()

  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  // === Neue Spule (komplett neuer Typ oder erste Rolle eines Typs) ===
  const openNew = () => {
    setNewForm(emptySpool)
    setCustomBrand('')
    setNewOpen(true)
  }
  const saveNew = async (e) => {
    e.preventDefault()
    const payload = { ...newForm }
    if (payload.manufacturer === '__custom__') {
      payload.manufacturer = customBrand.trim()
    }
    if (!payload.manufacturer) {
      alert('Bitte Hersteller wählen oder eintragen')
      return
    }
    ;['diameter', 'nozzle_temp', 'bed_temp',
      'spool_weight', 'remaining_weight', 'purchase_price'].forEach((k) => {
      payload[k] = parseFloat(payload[k]) || 0
    })
    if (!payload.purchase_date) payload.purchase_date = null
    if (!payload.storage_id) payload.storage_id = null
    else payload.storage_id = Number(payload.storage_id)

    await api.post('/filaments', payload)
    setNewOpen(false)
    load()
  }

  // === Spule innerhalb existierenden Typs hinzufügen ===
  const openAddSpool = (group) => {
    setAddSpoolGroup(group)
    setAddSpoolForm({
      ...emptyAddSpool,
      spool_weight: group.spools[0]?.spool_weight || 1000,
      remaining_weight: group.spools[0]?.spool_weight || 1000,
      purchase_price: group.spools[0]?.purchase_price || 0,
    })
    setAddSpoolOpen(true)
  }
  const saveAddSpool = async (e) => {
    e.preventDefault()
    const payload = { ...addSpoolForm }
    ;['spool_weight', 'remaining_weight', 'purchase_price'].forEach((k) => {
      payload[k] = parseFloat(payload[k]) || 0
    })
    if (!payload.purchase_date) payload.purchase_date = null
    if (!payload.storage_id) payload.storage_id = null
    else payload.storage_id = Number(payload.storage_id)

    const templateId = addSpoolGroup.spools[0].id
    await api.post(`/filaments/${templateId}/add-spool`, payload)
    setAddSpoolOpen(false)
    load()
  }

  // === Einzelne Spule bearbeiten ===
  const openEdit = async (spoolId) => {
    const r = await api.get(`/filaments/${spoolId}`)
    setEditingSpool(r.data)
    setEditForm({
      ...emptySpool, ...r.data,
      purchase_date: r.data.purchase_date || '',
      storage_id: r.data.storage_id || '',
    })
    setEditOpen(true)
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    const payload = { ...editForm }
    ;['diameter', 'nozzle_temp', 'bed_temp',
      'spool_weight', 'remaining_weight', 'purchase_price'].forEach((k) => {
      payload[k] = parseFloat(payload[k]) || 0
    })
    if (!payload.purchase_date) payload.purchase_date = null
    if (!payload.storage_id) payload.storage_id = null
    else payload.storage_id = Number(payload.storage_id)
    await api.patch(`/filaments/${editingSpool.id}`, payload)
    setEditOpen(false)
    load()
  }

  const removeSpool = async (spoolId) => {
    if (!confirm('Diese Rolle wirklich löschen?')) return
    await api.delete(`/filaments/${spoolId}`)
    load()
  }

  const storageName = (id) => storage.find((s) => s.id === id)?.name || '—'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" /> Filamente
          </h1>
          <p className="text-gray-500">Filamentbestand verwalten - mehrere Rollen pro Typ werden zusammengefasst</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Neues Filament
        </button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left w-8"></th>
              <th className="p-3 text-left">Material / Farbe</th>
              <th className="p-3 text-left">Hersteller</th>
              <th className="p-3 text-right">Rollen</th>
              <th className="p-3 text-right">Restbestand</th>
              <th className="p-3 text-left w-40">Füllstand</th>
              <th className="p-3 text-right">Ø Preis/kg</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const open = !!expanded[g.key]
              return (
                <>
                  <tr key={g.key} className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggle(g.key)}>
                    <td className="p-3">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <ColorDot hex={g.color_hex} size={20} />
                        <div>
                          <div className="font-medium">{g.material} {g.color}</div>
                          <div className="text-xs text-gray-500">{g.diameter} mm</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">{g.manufacturer}</td>
                    <td className="p-3 text-right">
                      <span className="font-semibold">{g.spool_count}</span>
                      <span className="text-xs text-gray-500 ml-1">{g.spool_count === 1 ? 'Rolle' : 'Rollen'}</span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {g.total_remaining_g.toFixed(0)} <span className="text-xs text-gray-500">/ {g.total_initial_g.toFixed(0)} g</span>
                    </td>
                    <td className="p-3">
                      <PercentBar value={g.total_remaining_g} max={g.total_initial_g} />
                    </td>
                    <td className="p-3 text-right font-mono">
                      {g.avg_price_per_kg > 0 ? `${g.avg_price_per_kg.toFixed(2)} €` : '—'}
                    </td>
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openAddSpool(g)}
                        className="text-gray-400 hover:text-primary-600"
                        title="Weitere Rolle hinzufügen">
                        <Plus className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  {open && g.spools.map((s) => (
                    <tr key={s.id} className="bg-gray-50/50 text-xs">
                      <td></td>
                      <td className="p-2 pl-12">
                        <span className="text-gray-500">↳ Rolle #{s.id}</span>
                        {s.batch_number && <span className="text-gray-400 ml-2">Charge: {s.batch_number}</span>}
                      </td>
                      <td className="p-2 text-gray-600 flex items-center gap-1">
                        {s.storage_id && (
                          <>
                            <MapPin className="w-3 h-3" />
                            {storageName(s.storage_id)}
                          </>
                        )}
                      </td>
                      <td className="p-2 text-right text-gray-500">{s.purchase_date || '—'}</td>
                      <td className="p-2 text-right font-mono">
                        {s.remaining_weight.toFixed(0)} / {s.spool_weight.toFixed(0)} g
                      </td>
                      <td className="p-2">
                        <PercentBar value={s.remaining_weight} max={s.spool_weight} />
                      </td>
                      <td className="p-2 text-right font-mono text-gray-600">
                        {s.purchase_price > 0 && s.spool_weight > 0
                          ? `${(s.purchase_price / s.spool_weight * 1000).toFixed(2)} €`
                          : '—'}
                      </td>
                      <td className="p-2 text-right">
                        <button onClick={() => openEdit(s.id)} className="text-gray-400 hover:text-primary-600 mr-2">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => removeSpool(s.id)} className="text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
            {groups.length === 0 && (
              <tr><td colSpan="8" className="p-8 text-center text-gray-500">Noch keine Filamente</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Neues Filament Modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Neues Filament anlegen" size="lg">
        <form onSubmit={saveNew} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Material *</label>
              <select className="input" value={newForm.material}
                onChange={(e) => setNewForm({ ...newForm, material: e.target.value })}>
                {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Hersteller *</label>
              <select className="input" value={newForm.manufacturer}
                onChange={(e) => setNewForm({ ...newForm, manufacturer: e.target.value })}>
                <option value="">— wählen —</option>
                {allBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="__custom__">Andere (eintragen)</option>
              </select>
              {newForm.manufacturer === '__custom__' && (
                <input className="input mt-2" placeholder="Eigener Hersteller"
                  value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} />
              )}
            </div>
            <div>
              <label className="label">Farbe</label>
              <input className="input" placeholder="Schwarz, Rot, ..."
                value={newForm.color} onChange={(e) => setNewForm({ ...newForm, color: e.target.value })} />
            </div>
            <div>
              <label className="label">Farbcode</label>
              <div className="flex gap-2">
                <input type="color" className="input h-10 w-16 p-1" value={newForm.color_hex}
                  onChange={(e) => setNewForm({ ...newForm, color_hex: e.target.value })} />
                <input className="input flex-1 font-mono" value={newForm.color_hex}
                  onChange={(e) => setNewForm({ ...newForm, color_hex: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Durchmesser (mm)</label>
              <input type="number" step="0.01" className="input" value={newForm.diameter}
                onChange={(e) => setNewForm({ ...newForm, diameter: e.target.value })} />
            </div>
            <div>
              <label className="label">Lagerort</label>
              <select className="input" value={newForm.storage_id}
                onChange={(e) => setNewForm({ ...newForm, storage_id: e.target.value })}>
                <option value="">— keiner —</option>
                {storage.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Erste Rolle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Spulengewicht (g)</label>
                <input type="number" className="input" value={newForm.spool_weight}
                  onChange={(e) => setNewForm({ ...newForm, spool_weight: e.target.value, remaining_weight: e.target.value })} />
              </div>
              <div>
                <label className="label">Aktueller Rest (g)</label>
                <input type="number" className="input" value={newForm.remaining_weight}
                  onChange={(e) => setNewForm({ ...newForm, remaining_weight: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufpreis (€)</label>
                <input type="number" step="0.01" className="input" value={newForm.purchase_price}
                  onChange={(e) => setNewForm({ ...newForm, purchase_price: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufdatum</label>
                <input type="date" className="input" value={newForm.purchase_date}
                  onChange={(e) => setNewForm({ ...newForm, purchase_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Chargennummer</label>
                <input className="input" value={newForm.batch_number}
                  onChange={(e) => setNewForm({ ...newForm, batch_number: e.target.value })} />
              </div>
            </div>
          </div>

          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">Erweiterte Druckparameter</summary>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="label">Düsentemperatur (°C)</label>
                <input type="number" className="input" value={newForm.nozzle_temp}
                  onChange={(e) => setNewForm({ ...newForm, nozzle_temp: e.target.value })} />
              </div>
              <div>
                <label className="label">Bett (°C)</label>
                <input type="number" className="input" value={newForm.bed_temp}
                  onChange={(e) => setNewForm({ ...newForm, bed_temp: e.target.value })} />
              </div>
            </div>
          </details>

          <div>
            <label className="label">Notizen</label>
            <textarea rows="2" className="input" value={newForm.notes}
              onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setNewOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>

      {/* Add Spool Modal */}
      {addSpoolGroup && (
        <Modal open={addSpoolOpen} onClose={() => setAddSpoolOpen(false)}
          title={`Weitere Rolle: ${addSpoolGroup.material} ${addSpoolGroup.color}`}>
          <form onSubmit={saveAddSpool} className="space-y-4">
            <div className="bg-gray-50 p-3 rounded text-sm">
              <div className="flex items-center gap-2">
                <ColorDot hex={addSpoolGroup.color_hex} size={20} />
                <span><strong>{addSpoolGroup.material}</strong> {addSpoolGroup.color} – {addSpoolGroup.manufacturer}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Bisher {addSpoolGroup.spool_count} Rolle(n) · {addSpoolGroup.total_remaining_g.toFixed(0)}g Restbestand gesamt</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Spulengewicht (g)</label>
                <input type="number" className="input" value={addSpoolForm.spool_weight}
                  onChange={(e) => setAddSpoolForm({
                    ...addSpoolForm,
                    spool_weight: e.target.value,
                    remaining_weight: e.target.value,
                  })} />
              </div>
              <div>
                <label className="label">Aktueller Rest (g)</label>
                <input type="number" className="input" value={addSpoolForm.remaining_weight}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, remaining_weight: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufpreis (€)</label>
                <input type="number" step="0.01" className="input" value={addSpoolForm.purchase_price}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, purchase_price: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufdatum</label>
                <input type="date" className="input" value={addSpoolForm.purchase_date}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, purchase_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Chargennummer</label>
                <input className="input" value={addSpoolForm.batch_number}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, batch_number: e.target.value })} />
              </div>
              <div>
                <label className="label">Lagerort</label>
                <select className="input" value={addSpoolForm.storage_id}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, storage_id: e.target.value })}>
                  <option value="">— keiner —</option>
                  {storage.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Notizen</label>
                <input className="input" value={addSpoolForm.notes}
                  onChange={(e) => setAddSpoolForm({ ...addSpoolForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button type="button" onClick={() => setAddSpoolOpen(false)} className="btn-secondary">Abbrechen</button>
              <button type="submit" className="btn-primary">Spule hinzufügen</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Spool Modal */}
      {editingSpool && (
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Rolle #${editingSpool.id} bearbeiten`} size="lg">
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Material</label>
                <select className="input" value={editForm.material}
                  onChange={(e) => setEditForm({ ...editForm, material: e.target.value })}>
                  {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Hersteller</label>
                <select className="input" value={editForm.manufacturer}
                  onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}>
                  {allBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                  {!allBrands.includes(editForm.manufacturer) && editForm.manufacturer && (
                    <option value={editForm.manufacturer}>{editForm.manufacturer}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="label">Farbe</label>
                <input className="input" value={editForm.color || ''}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} />
              </div>
              <div>
                <label className="label">Farbcode</label>
                <div className="flex gap-2">
                  <input type="color" className="input h-10 w-16 p-1" value={editForm.color_hex || '#000000'}
                    onChange={(e) => setEditForm({ ...editForm, color_hex: e.target.value })} />
                  <input className="input flex-1 font-mono" value={editForm.color_hex || ''}
                    onChange={(e) => setEditForm({ ...editForm, color_hex: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Spulengewicht (g)</label>
                <input type="number" className="input" value={editForm.spool_weight}
                  onChange={(e) => setEditForm({ ...editForm, spool_weight: e.target.value })} />
              </div>
              <div>
                <label className="label">Restmenge (g)</label>
                <input type="number" className="input" value={editForm.remaining_weight}
                  onChange={(e) => setEditForm({ ...editForm, remaining_weight: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufpreis (€)</label>
                <input type="number" step="0.01" className="input" value={editForm.purchase_price}
                  onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaufdatum</label>
                <input type="date" className="input" value={editForm.purchase_date || ''}
                  onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Chargennummer</label>
                <input className="input" value={editForm.batch_number || ''}
                  onChange={(e) => setEditForm({ ...editForm, batch_number: e.target.value })} />
              </div>
              <div>
                <label className="label">Lagerort</label>
                <select className="input" value={editForm.storage_id || ''}
                  onChange={(e) => setEditForm({ ...editForm, storage_id: e.target.value })}>
                  <option value="">— keiner —</option>
                  {storage.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Notizen</label>
                <textarea rows="2" className="input" value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">Abbrechen</button>
              <button type="submit" className="btn-primary">Speichern</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
