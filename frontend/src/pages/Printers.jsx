import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer as PrinterIcon, Edit2, Trash2 } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const empty = {
  name: '', model: '', brand: 'Bambu Lab', serial_number: '',
  bambu_device_id: '', bambu_access_code: '', bambu_ip: '', bambu_serial: '',
  tuya_device_id: '', notes: '',
  hourly_rate: 0, power_price_kwh: 0.30, avg_power_w: 120, margin_percent: 20,
}

export default function Printers() {
  const [printers, setPrinters] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  const load = () => api.get('/printers').then((r) => setPrinters(r.data))

  useEffect(() => {
    load()
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({ ...empty, ...p })
    setOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (editing) {
      await api.patch(`/printers/${editing.id}`, form)
    } else {
      await api.post('/printers', form)
    }
    setOpen(false)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Drucker wirklich löschen?')) return
    await api.delete(`/printers/${id}`)
    load()
  }

  const statusColor = (s) => ({
    printing: 'bg-green-100 text-green-800',
    idle: 'bg-gray-100 text-gray-700',
    paused: 'bg-yellow-100 text-yellow-800',
    finish: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800',
  }[s] || 'bg-gray-100 text-gray-600')

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Drucker</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Drucker anlegen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {printers.map((p) => (
          <div key={p.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <Link to={`/printers/${p.id}`} className="flex items-center gap-2 group">
                <PrinterIcon className="w-5 h-5 text-primary-600" />
                <div>
                  <h3 className="font-semibold group-hover:text-primary-600">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.brand} {p.model}</p>
                </div>
              </Link>
              <span className={`badge ${statusColor(p.status)}`}>{p.status}</span>
            </div>

            {p.status === 'printing' && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 truncate">{p.current_job_name}</p>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div className="bg-primary-600 h-1.5 rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-1">{p.progress}%</div>
              </div>
            )}

            <div className="flex gap-2 text-xs text-gray-500 mb-3">
              {p.bambu_ip && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Bambu</span>}
              {p.tuya_device_id && <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">Tuya</span>}
            </div>

            <div className="flex gap-2 pt-3 border-t">
              <button onClick={() => openEdit(p)} className="text-sm text-gray-600 hover:text-primary-600 flex items-center gap-1">
                <Edit2 className="w-3 h-3" /> Bearbeiten
              </button>
              <button onClick={() => remove(p.id)} className="text-sm text-gray-600 hover:text-red-600 flex items-center gap-1 ml-auto">
                <Trash2 className="w-3 h-3" /> Löschen
              </button>
            </div>
          </div>
        ))}
        {printers.length === 0 && (
          <p className="col-span-full text-gray-500 text-center py-12">
            Noch keine Drucker. Klicke oben rechts auf "Drucker anlegen".
          </p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Drucker bearbeiten' : 'Drucker anlegen'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Modell</label>
              <input className="input" placeholder="X1 Carbon, P1S, A1..." value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <label className="label">Marke</label>
              <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <label className="label">Seriennummer</label>
              <input className="input" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 text-sm">Bambu Lab Verbindung (LAN-Modus)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Auf dem Drucker: Einstellungen → Allgemein → LAN-only Mode. Zugangscode unter Einstellungen → WLAN ablesen.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">IP-Adresse</label>
                <input className="input" placeholder="192.168.1.100" value={form.bambu_ip} onChange={(e) => setForm({ ...form, bambu_ip: e.target.value })} />
              </div>
              <div>
                <label className="label">Access Code</label>
                <input className="input" value={form.bambu_access_code} onChange={(e) => setForm({ ...form, bambu_access_code: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Serial (MQTT)</label>
                <input className="input" value={form.bambu_serial} onChange={(e) => setForm({ ...form, bambu_serial: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 text-sm">Tuya Smart-Steckdose</h3>
            <label className="label">Tuya Device ID</label>
            <input className="input" placeholder="bf12345abcdef" value={form.tuya_device_id} onChange={(e) => setForm({ ...form, tuya_device_id: e.target.value })} />
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 text-sm">Kalkulation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Stundensatz (€/h)</label>
                <input type="number" step="0.01" min="0" className="input"
                  value={form.hourly_rate}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setForm({ ...form, hourly_rate: isNaN(v) ? 0 : v })
                  }} />
              </div>
              <div>
                <label className="label">Strompreis (€/kWh)</label>
                <input type="number" step="0.01" min="0" className="input"
                  value={form.power_price_kwh}
                  onChange={(e) => setForm({ ...form, power_price_kwh: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Ø Leistung beim Drucken (W)</label>
                <input type="number" step="1" min="0" className="input"
                  value={form.avg_power_w}
                  onChange={(e) => setForm({ ...form, avg_power_w: parseFloat(e.target.value) || 0 })} />
                <p className="text-xs text-gray-400 mt-1">Wird nur genutzt wenn keine echten kWh gemessen wurden</p>
              </div>
              <div>
                <label className="label">Aufschlag/Marge (%)</label>
                <input type="number" step="0.1" min="0" className="input"
                  value={form.margin_percent}
                  onChange={(e) => setForm({ ...form, margin_percent: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notizen</label>
            <textarea className="input" rows="2" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">{editing ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
