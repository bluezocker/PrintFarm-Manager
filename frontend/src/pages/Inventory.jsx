import { useEffect, useState } from 'react'
import { Plus, Package, Edit2, Trash2, AlertTriangle, Wrench, Droplet, Box } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const CATEGORIES = [
  { value: 'spare_part',  label: 'Ersatzteil',         icon: Wrench,  color: 'text-blue-600' },
  { value: 'tool',        label: 'Werkzeug',           icon: Wrench,  color: 'text-purple-600' },
  { value: 'consumable',  label: 'Verbrauchsmaterial', icon: Droplet, color: 'text-amber-600' },
  { value: 'accessory',   label: 'Zubehör',            icon: Box,     color: 'text-green-600' },
]

const empty = {
  name: '', category: 'spare_part', description: '', manufacturer: '', part_number: '',
  quantity: 0, unit: 'Stk', minimum_stock: 0,
  purchase_price: 0, supplier: '', purchase_date: '',
  location: '', printer_compat: '', notes: '',
}

function StatCard({ label, value, color = 'text-green-500', sub }) {
  return (
    <div className="card">
      <div className="text-center">
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function Inventory() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [filterCat, setFilterCat] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  const load = async () => {
    const params = new URLSearchParams()
    if (filterCat) params.append('category', filterCat)
    if (lowStockOnly) params.append('low_stock_only', 'true')
    const [i, s] = await Promise.all([
      api.get(`/inventory${params.toString() ? '?' + params : ''}`),
      api.get('/inventory/stats'),
    ])
    setItems(i.data)
    setStats(s.data)
  }

  useEffect(() => { load() }, [filterCat, lowStockOnly])

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true) }
  const openEdit = (it) => {
    setEditing(it)
    setForm({ ...empty, ...it, purchase_date: it.purchase_date || '' })
    setOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['quantity', 'minimum_stock', 'purchase_price'].forEach((k) => {
      payload[k] = parseFloat(payload[k]) || 0
    })
    if (!payload.purchase_date) payload.purchase_date = null
    if (editing) await api.patch(`/inventory/${editing.id}`, payload)
    else await api.post('/inventory', payload)
    setOpen(false)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Artikel löschen?')) return
    await api.delete(`/inventory/${id}`)
    load()
  }

  const catInfo = (cat) => CATEGORIES.find((c) => c.value === cat) || CATEGORIES[0]

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventar</h1>
          <p className="text-gray-500">Ersatzteile, Zubehör & Anschaffungskosten verwalten</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Artikel hinzufügen
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Artikel" value={stats.total_items} />
          <StatCard label="Gesamtmenge" value={stats.total_quantity} color="text-blue-500" />
          <StatCard label="Gesamtwert" value={`${stats.total_value.toFixed(2)}€`} color="text-green-500" />
          <StatCard label="Drucker" value={stats.printer_count} color="text-purple-500" />
        </div>
      )}

      {stats?.low_stock_count > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">
            <strong>{stats.low_stock_count}</strong> Artikel mit niedrigem Bestand.
            <button onClick={() => setLowStockOnly(!lowStockOnly)} className="ml-2 underline">
              {lowStockOnly ? 'Alle zeigen' : 'Anzeigen'}
            </button>
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterCat('')} className={`px-3 py-1 rounded text-sm ${!filterCat ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
          Alle
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.value} onClick={() => setFilterCat(c.value)}
            className={`px-3 py-1 rounded text-sm ${filterCat === c.value ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Kategorie</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Hersteller / Art.-Nr.</th>
              <th className="p-3 text-right">Bestand</th>
              <th className="p-3 text-right">Stückpreis</th>
              <th className="p-3 text-right">Gesamtwert</th>
              <th className="p-3 text-left">Lagerort</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const info = catInfo(it.category)
              const Icon = info.icon
              const isLow = it.minimum_stock > 0 && it.quantity <= it.minimum_stock
              return (
                <tr key={it.id} className={`border-t hover:bg-gray-50 ${isLow ? 'bg-amber-50/30' : ''}`}>
                  <td className="p-3">
                    <Icon className={`w-4 h-4 ${info.color}`} title={info.label} />
                  </td>
                  <td className="p-3 font-medium">{it.name}</td>
                  <td className="p-3 text-gray-600 text-xs">
                    {it.manufacturer && <div>{it.manufacturer}</div>}
                    {it.part_number && <div className="font-mono">{it.part_number}</div>}
                  </td>
                  <td className="p-3 text-right">
                    <span className={isLow ? 'text-amber-700 font-medium' : ''}>
                      {it.quantity} {it.unit}
                    </span>
                    {isLow && <div className="text-xs text-amber-600">⚠ niedrig</div>}
                  </td>
                  <td className="p-3 text-right text-gray-600">{it.purchase_price?.toFixed(2)} €</td>
                  <td className="p-3 text-right font-mono">{(it.quantity * it.purchase_price).toFixed(2)} €</td>
                  <td className="p-3 text-gray-600">{it.location || '—'}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => openEdit(it)} className="text-gray-400 hover:text-primary-600 mr-2">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(it.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr><td colSpan="8" className="p-8 text-center text-gray-500">Noch keine Artikel im Inventar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Artikel bearbeiten' : 'Artikel hinzufügen'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Name *</label>
              <input className="input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Kategorie</label>
              <select className="input" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Hersteller</label>
              <input className="input" value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            </div>
            <div>
              <label className="label">Artikelnummer</label>
              <input className="input font-mono" value={form.part_number}
                onChange={(e) => setForm({ ...form, part_number: e.target.value })} />
            </div>
            <div>
              <label className="label">Lieferant</label>
              <input className="input" value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div>
              <label className="label">Bestand *</label>
              <input type="number" step="0.01" className="input" required value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Einheit</label>
              <input className="input" placeholder="Stk, ml, g, l..." value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="label">Mindestbestand</label>
              <input type="number" step="0.01" className="input" value={form.minimum_stock}
                onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">Warnung wenn darunter</p>
            </div>
            <div>
              <label className="label">Stückpreis (€)</label>
              <input type="number" step="0.01" className="input" value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
            </div>
            <div>
              <label className="label">Kaufdatum</label>
              <input type="date" className="input" value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Lagerort</label>
              <input className="input" placeholder="Regal A, Schublade 3..." value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Beschreibung</label>
              <textarea rows="2" className="input" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Notizen</label>
              <textarea rows="2" className="input" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
