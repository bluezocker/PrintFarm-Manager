import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Wrench, RefreshCw, Camera, Mail } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

export default function PrinterDetail() {
  const { id } = useParams()
  const [printer, setPrinter] = useState(null)
  const [status, setStatus] = useState(null)
  const [maintenances, setMaintenances] = useState([])
  const [open, setOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyForm, setNotifyForm] = useState({ recipient_email: '', custom_message: '', include_snapshot: true, job_id: '' })
  const [jobs, setJobs] = useState([])
  const [snapshotUrl, setSnapshotUrl] = useState(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    maintenance_type: '',
    description: '',
    technician: '',
    cost: 0,
    next_due_date: '',
  })

  const load = async () => {
    const [p, m, j] = await Promise.all([
      api.get(`/printers/${id}`),
      api.get(`/printers/${id}/maintenances`),
      api.get('/jobs?status=printing'),
    ])
    setPrinter(p.data)
    setMaintenances(m.data)
    setJobs(j.data)
  }

  const refreshSnapshot = async () => {
    setSnapshotLoading(true)
    try {
      const r = await api.get(`/printers/${id}/snapshot`, { responseType: 'blob' })
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl)
      setSnapshotUrl(URL.createObjectURL(r.data))
    } catch (e) {
      alert('Snapshot-Fehler: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSnapshotLoading(false)
    }
  }

  const sendCustomerNotification = async () => {
    try {
      const payload = {
        include_snapshot: notifyForm.include_snapshot,
        custom_message: notifyForm.custom_message || null,
        recipient_email: notifyForm.recipient_email || null,
        job_id: notifyForm.job_id ? Number(notifyForm.job_id) : null,
      }
      const r = await api.post(`/printers/${id}/notify-customer`, payload)
      alert(`E-Mail gesendet an ${r.data.sent_to}` + (r.data.with_snapshot ? ' (mit Foto)' : ''))
      setNotifyOpen(false)
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const refreshStatus = async () => {
    try {
      const r = await api.get(`/printers/${id}/status`)
      setStatus(r.data)
    } catch (e) {
      setStatus({ connected: false, error: e.response?.data?.error })
    }
  }

  useEffect(() => {
    load()
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [id])

  const saveMaintenance = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    if (!payload.next_due_date) delete payload.next_due_date
    await api.post(`/printers/${id}/maintenances`, payload)
    setOpen(false)
    setForm({ ...form, description: '', maintenance_type: '', cost: 0 })
    load()
  }

  const deleteMaintenance = async (mid) => {
    if (!confirm('Wartung löschen?')) return
    await api.delete(`/printers/maintenances/${mid}`)
    load()
  }

  if (!printer) return <div>Lade...</div>

  return (
    <div>
      <Link to="/printers" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{printer.name}</h1>
          <p className="text-gray-500">{printer.brand} {printer.model}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Live-Status */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              Live-Status
              {status?.connected ? (
                <span className="badge bg-green-100 text-green-800">Verbunden</span>
              ) : (
                <span className="badge bg-gray-100 text-gray-700">Offline</span>
              )}
            </h2>
            <button onClick={refreshStatus} className="text-gray-500 hover:text-primary-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {status?.connected ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium">{status.status}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Job</p>
                  <p className="font-medium truncate">{status.current_job_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Düse</p>
                  <p className="font-medium">{status.nozzle_temp?.toFixed(1)}°C</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bett</p>
                  <p className="font-medium">{status.bed_temp?.toFixed(1)}°C</p>
                </div>
              </div>

              {status.status === 'printing' && (
                <>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Fortschritt</span>
                      <span>{status.progress?.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-primary-600 h-2 rounded-full transition-all"
                        style={{ width: `${status.progress}%` }} />
                    </div>
                  </div>
                  {status.remaining_time != null && (
                    <p className="text-sm text-gray-600 mb-3">
                      Restzeit: {Math.floor(status.remaining_time / 60)}h {status.remaining_time % 60}m
                    </p>
                  )}
                  {status.layer_num != null && (
                    <p className="text-sm text-gray-600">
                      Layer {status.layer_num} / {status.total_layer_num}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              {status?.error || 'Nicht verbunden. Prüfe Bambu Lab Konfiguration (LAN-only Mode aktiv?).'}
            </p>
          )}
        </div>

        {/* Druckerinfo */}
        <div className="card">
          <h2 className="font-semibold mb-4">Stammdaten</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Marke</dt><dd>{printer.brand}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Modell</dt><dd>{printer.model || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Seriennummer</dt><dd>{printer.serial_number || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Bambu IP</dt><dd>{printer.bambu_ip || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Tuya Plug</dt><dd>{printer.tuya_device_id ? '✓' : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Kaufdatum</dt><dd>{printer.purchase_date || '—'}</dd></div>
          </dl>
          {printer.notes && (
            <div className="mt-4 pt-4 border-t text-sm">
              <p className="text-gray-500 mb-1">Notizen</p>
              <p>{printer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Kamera-Snapshot */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Camera className="w-4 h-4" /> Druckkammer-Kamera
          </h2>
          <div className="flex gap-2">
            <button onClick={refreshSnapshot} disabled={snapshotLoading}
              className="btn-secondary flex items-center gap-1 text-sm">
              <RefreshCw className={`w-4 h-4 ${snapshotLoading ? 'animate-spin' : ''}`} />
              {snapshotUrl ? 'Aktualisieren' : 'Foto aufnehmen'}
            </button>
            <button onClick={() => setNotifyOpen(true)}
              className="btn-primary flex items-center gap-1 text-sm">
              <Mail className="w-4 h-4" /> Kunde benachrichtigen
            </button>
          </div>
        </div>
        {snapshotUrl ? (
          <div className="flex justify-center bg-gray-900 rounded p-2">
            <img src={snapshotUrl} alt="Snapshot" className="max-h-96 object-contain" />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">
            Klick auf "Foto aufnehmen", um einen aktuellen Snapshot der Druckkammer zu sehen.
          </p>
        )}
      </div>

      {/* Wartungen */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Wartungshistorie
          </h2>
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1 text-sm">
            <Plus className="w-4 h-4" /> Wartung eintragen
          </button>
        </div>

        {maintenances.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">Noch keine Wartungseinträge.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase border-b">
                <th className="pb-2">Datum</th>
                <th className="pb-2">Typ</th>
                <th className="pb-2">Beschreibung</th>
                <th className="pb-2">Techniker</th>
                <th className="pb-2 text-right">Kosten</th>
                <th className="pb-2">Nächste</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {maintenances.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2">{m.date}</td>
                  <td className="py-2">{m.maintenance_type || '—'}</td>
                  <td className="py-2">{m.description}</td>
                  <td className="py-2">{m.technician || '—'}</td>
                  <td className="py-2 text-right">{m.cost?.toFixed(2)} €</td>
                  <td className="py-2">{m.next_due_date || '—'}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => deleteMaintenance(m.id)} className="text-gray-400 hover:text-red-600 text-xs">
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Wartung eintragen">
        <form onSubmit={saveMaintenance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Datum *</label>
              <input type="date" className="input" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Typ</label>
              <input className="input" placeholder="Düsenwechsel, Reinigung..." value={form.maintenance_type}
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

      <Modal open={notifyOpen} onClose={() => setNotifyOpen(false)} title="Kunde benachrichtigen" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Auftrag verknüpfen (optional)</label>
            <select className="input" value={notifyForm.job_id}
              onChange={(e) => setNotifyForm({ ...notifyForm, job_id: e.target.value })}>
              <option value="">— keinen Auftrag verknüpfen —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.order_number} - {j.title}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Wenn ein Auftrag gewählt ist, geht die Mail an dessen Kundenadresse.
            </p>
          </div>
          <div>
            <label className="label">Empfänger-E-Mail (falls Kunde keine hat)</label>
            <input type="email" className="input" placeholder="kunde@beispiel.de"
              value={notifyForm.recipient_email}
              onChange={(e) => setNotifyForm({ ...notifyForm, recipient_email: e.target.value })} />
          </div>
          <div>
            <label className="label">Persönliche Nachricht (optional)</label>
            <textarea rows="4" className="input"
              placeholder="Hier können Sie eine eigene Nachricht eingeben. Status wird automatisch angefügt."
              value={notifyForm.custom_message}
              onChange={(e) => setNotifyForm({ ...notifyForm, custom_message: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={notifyForm.include_snapshot}
              onChange={(e) => setNotifyForm({ ...notifyForm, include_snapshot: e.target.checked })} />
            <span className="text-sm">Aktuelles Kamera-Foto anhängen</span>
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button onClick={() => setNotifyOpen(false)} className="btn-secondary">Abbrechen</button>
            <button onClick={sendCustomerNotification} className="btn-primary flex items-center gap-2">
              <Mail className="w-4 h-4" /> Senden
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
