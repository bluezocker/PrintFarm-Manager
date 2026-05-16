import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Modal from '../components/Modal'

export default function Storage() {
  const [storage, setStorage] = useState([])
  const [filaments, setFilaments] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', is_dry_box: 0 })

  const load = async () => {
    const [s, f] = await Promise.all([api.get('/storage'), api.get('/filaments')])
    setStorage(s.data)
    setFilaments(f.data)
  }

  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    await api.post('/storage', form)
    setForm({ name: '', description: '', is_dry_box: 0 })
    setOpen(false)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Lagerort löschen? Filamente verlieren die Zuordnung.')) return
    await api.delete(`/storage/${id}`)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6" /> Lagerorte
          </h1>
          <p className="text-gray-500">Regale, Trockenboxen und andere Lagerplätze</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Lagerort anlegen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {storage.map((s) => {
          const inStorage = filaments.filter((f) => f.storage_id === s.id)
          return (
            <div key={s.id} className="card">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    {s.name}
                    {s.is_dry_box === 1 && <span title="Trockenbox">🌵</span>}
                  </h3>
                  {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
                </div>
                <button onClick={() => remove(s.id)} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                <Package className="w-3 h-3" /> {inStorage.length} Filamente
              </p>
              {inStorage.length > 0 && (
                <div className="space-y-1">
                  {inStorage.slice(0, 4).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full border" style={{ background: f.color_hex || '#aaa' }} />
                      <span>{f.material} {f.color}</span>
                      <span className="text-gray-400 ml-auto">{Math.round(f.remaining_weight)}g</span>
                    </div>
                  ))}
                  {inStorage.length > 4 && (
                    <Link to="/filaments" className="text-xs text-primary-600 hover:underline">
                      + {inStorage.length - 4} mehr
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {storage.length === 0 && (
          <p className="col-span-full text-gray-500 text-center py-12">Noch keine Lagerorte angelegt.</p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Lagerort anlegen">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <textarea rows="2" className="input" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_dry_box === 1}
              onChange={(e) => setForm({ ...form, is_dry_box: e.target.checked ? 1 : 0 })} />
            <span>Ist Trockenbox</span>
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
