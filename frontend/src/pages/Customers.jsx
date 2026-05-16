import { useEffect, useState } from 'react'
import { Plus, User, Building, Edit2, Trash2, Mail, Phone } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const empty = {
  customer_type: 'private', customer_number: '', company_name: '', first_name: '', last_name: '',
  street: '', zip_code: '', city: '', country: 'Deutschland',
  email: '', phone: '', vat_id: '', notes: '',
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [search, setSearch] = useState('')

  const load = () => api.get('/customers').then((r) => setCustomers(r.data))
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true) }
  const openEdit = (c) => { setEditing(c); setForm({ ...empty, ...c }); setOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    if (editing) await api.patch(`/customers/${editing.id}`, form)
    else await api.post('/customers', form)
    setOpen(false)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Kunde mit allen Aufträgen löschen?')) return
    await api.delete(`/customers/${id}`)
    load()
  }

  const displayName = (c) =>
    c.customer_type === 'business'
      ? c.company_name || `${c.first_name} ${c.last_name}`.trim()
      : `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || 'Unbenannt'

  const filtered = customers.filter((c) => {
    const s = search.toLowerCase()
    return !s || displayName(c).toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s)
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Kunden</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Kunde anlegen
        </button>
      </div>

      <input
        type="search"
        placeholder="Suche..."
        className="input mb-4 max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Typ</th>
              <th className="p-3 text-left">Kunden-Nr.</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Kontakt</th>
              <th className="p-3 text-left">Ort</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="p-3">
                  {c.customer_type === 'business' ? (
                    <Building className="w-4 h-4 text-purple-600" />
                  ) : (
                    <User className="w-4 h-4 text-blue-600" />
                  )}
                </td>
                <td className="p-3 font-mono text-xs text-gray-600">{c.customer_number || '—'}</td>
                <td className="p-3 font-medium">{displayName(c)}</td>
                <td className="p-3 text-gray-600">
                  {c.email && <div className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{c.email}</div>}
                  {c.phone && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{c.phone}</div>}
                </td>
                <td className="p-3 text-gray-600">{[c.zip_code, c.city].filter(Boolean).join(' ')}</td>
                <td className="p-3 text-right">
                  <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-primary-600 mr-2"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" className="p-8 text-center text-gray-500">Keine Kunden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Kunde bearbeiten' : 'Kunde anlegen'} size="lg">
        <form onSubmit={save} className="space-y-4">
          {editing && (
            <div>
              <label className="label">Kundennummer</label>
              <input className="input font-mono" value={form.customer_number || ''}
                onChange={(e) => setForm({ ...form, customer_number: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">Bei neuen Kunden wird automatisch K-XXXX vergeben.</p>
            </div>
          )}

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.customer_type === 'private'}
                onChange={() => setForm({ ...form, customer_type: 'private' })} />
              Privatkunde
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.customer_type === 'business'}
                onChange={() => setForm({ ...form, customer_type: 'business' })} />
              Geschäftskunde
            </label>
          </div>

          {form.customer_type === 'business' && (
            <div>
              <label className="label">Firmenname *</label>
              <input className="input" required value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Vorname{form.customer_type === 'private' ? ' *' : ''}</label>
              <input className="input" required={form.customer_type === 'private'} value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nachname{form.customer_type === 'private' ? ' *' : ''}</label>
              <input className="input" required={form.customer_type === 'private'} value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Straße</label>
              <input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
            </div>
            <div>
              <label className="label">PLZ</label>
              <input className="input" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
            </div>
            <div>
              <label className="label">Ort</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="label">Land</label>
              <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div>
              <label className="label">USt-ID</label>
              <input className="input" placeholder="nur Geschäftskunden" value={form.vat_id}
                onChange={(e) => setForm({ ...form, vat_id: e.target.value })} />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Telefon</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Notizen</label>
            <textarea className="input" rows="2" value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
