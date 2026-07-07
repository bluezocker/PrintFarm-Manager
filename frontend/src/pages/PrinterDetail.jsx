import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Wrench, RefreshCw, Camera, Mail,
  Lightbulb, Home, Gauge, Wifi, Fan, Play, Pause, Square,
  Package, Clock as ClockIcon, Layers,
} from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'
import AmsWidget from '../components/AmsWidget'

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
  const [queue, setQueue] = useState([])
  const [controlBusy, setControlBusy] = useState(false)
  const [controlMessage, setControlMessage] = useState(null)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    maintenance_type: '',
    description: '',
    technician: '',
    cost: 0,
    next_due_date: '',
  })

  const load = async () => {
    const [p, m, j, q] = await Promise.all([
      api.get(`/printers/${id}`),
      api.get(`/printers/${id}/maintenances`),
      api.get('/jobs?status=printing'),
      api.get(`/queue/${id}`).catch(() => ({ data: [] })),
    ])
    setPrinter(p.data)
    setMaintenances(m.data)
    setJobs(j.data)
    setQueue(q.data || [])
  }

  const loadQueue = async () => {
    try {
      const r = await api.get(`/queue/${id}`)
      setQueue(r.data || [])
    } catch {}
  }

  // === Drucker-Steuerung ===
  const doControl = async (action, extraQuery = '') => {
    setControlBusy(true)
    setControlMessage(null)
    try {
      await api.post(`/printers/${id}/${action}${extraQuery}`)
      setControlMessage({ type: 'success', text: `${action} ✓` })
      setTimeout(refreshStatus, 500)
    } catch (e) {
      setControlMessage({ type: 'error', text: e.response?.data?.detail || `${action} fehlgeschlagen` })
    } finally {
      setControlBusy(false)
      setTimeout(() => setControlMessage(null), 3000)
    }
  }

  const toggleLed = () => {
    const on = status?.light_status !== 'on'
    doControl('led', `?on=${on}`)
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

      {/* === Erweiterter Live-Bereich === */}
      <div className="card mb-6">
        {/* Status-Header mit Widgets */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            Live-Status
            {status?.connected ? (
              <span className="badge bg-green-100 text-green-800">Verbunden</span>
            ) : (
              <span className="badge bg-gray-100 text-gray-700">Offline</span>
            )}
            {status?.connected && status?.wifi_signal && (
              <span className="badge bg-blue-50 text-blue-700 flex items-center gap-1">
                <Wifi className="w-3 h-3" /> {status.wifi_signal}dBm
              </span>
            )}
            {status?.connected && (
              <>
                <span className={`badge ${status.hms ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                  {status.hms ? '⚠ HMS' : 'OK'}
                </span>
                {status.spd_lvl && (
                  <span className="badge bg-purple-50 text-purple-700 flex items-center gap-1">
                    <Gauge className="w-3 h-3" />
                    {['Silent', 'Standard', 'Sport', 'Ludicrous'][status.spd_lvl - 1] || status.spd_lvl}
                  </span>
                )}
              </>
            )}
          </h2>
          <button onClick={refreshStatus} className="text-gray-500 hover:text-primary-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {controlMessage && (
          <div className={`p-2 rounded text-sm mb-3 ${
            controlMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>{controlMessage.text}</div>
        )}

        {!status?.connected ? (
          <p className="text-gray-500 text-sm">
            {status?.error || 'Nicht verbunden. Prüfe Drucker-Konfiguration.'}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Große Status-Zeile mit Fortschritt */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 bg-white rounded flex items-center justify-center border">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold capitalize">
                        {status.status === 'printing' ? 'Druckt' :
                         status.status === 'paused' ? 'Pausiert' :
                         status.status === 'idle' ? 'Idle' :
                         status.status === 'finish' ? 'Fertig' :
                         status.status === 'preparing' ? 'Vorbereitung' :
                         status.status || 'Unbekannt'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {status.current_job_name || 'Kein aktiver Job'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary-600">
                        {status.progress != null ? `${status.progress.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>
                  {status.status === 'printing' && (
                    <>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div className="bg-primary-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${status.progress || 0}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                        {status.remaining_time != null && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            Rest: {Math.floor(status.remaining_time / 60)}h {status.remaining_time % 60}m
                          </span>
                        )}
                        {status.layer_num != null && (
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            Layer {status.layer_num}/{status.total_layer_num}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {status.status !== 'printing' && (
                    <div className="text-xs text-gray-400 mt-1">Druckbereit</div>
                  )}
                </div>
              </div>
            </div>

            {/* Warteschlange-Widget */}
            {queue.length > 0 && (
              <Link to="/queue" className="block border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center flex-shrink-0">
                      📋
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Nächster in der Warteschlange</div>
                      <div className="text-sm font-medium truncate">
                        {queue[0].print_file_name || queue[0].title}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="badge bg-blue-100 text-blue-800 flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" /> Wartend
                    </span>
                    {queue.length > 1 && (
                      <span className="badge bg-gray-100 text-gray-800">+{queue.length - 1}</span>
                    )}
                  </div>
                </div>
              </Link>
            )}

            {/* Temperatur-Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-3 text-center bg-white">
                <div className="text-xs text-gray-500 mb-1">Düse</div>
                <div className="text-2xl font-bold">
                  {status.nozzle_temp?.toFixed(0)}<span className="text-sm text-gray-500">°C</span>
                </div>
                {status.nozzle_target_temp > 0 && (
                  <div className="text-xs text-gray-500">Ziel: {status.nozzle_target_temp}°C</div>
                )}
              </div>
              <div className="border rounded-lg p-3 text-center bg-white">
                <div className="text-xs text-gray-500 mb-1">Druckbett</div>
                <div className="text-2xl font-bold">
                  {status.bed_temp?.toFixed(0)}<span className="text-sm text-gray-500">°C</span>
                </div>
                {status.bed_target_temp > 0 && (
                  <div className="text-xs text-gray-500">Ziel: {status.bed_target_temp}°C</div>
                )}
              </div>
            </div>

            {/* Lüfter-Anzeigen */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <FanBar label="Bauteil" value={status.cooling_fan_speed} />
              <FanBar label="Aux" value={status.big_fan1_speed} />
              <FanBar label="Kammer" value={status.big_fan2_speed} />
            </div>

            {/* Steuerungs-Leiste */}
            <div>
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Steuerung</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={toggleLed}
                  disabled={controlBusy}
                  className={`p-2 rounded border ${status.light_status === 'on'
                    ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50`}
                  title="LED an/aus"
                >
                  <Lightbulb className="w-4 h-4" />
                </button>
                <button
                  onClick={() => doControl('home')}
                  disabled={controlBusy || status.status === 'printing'}
                  className="p-2 rounded border bg-white border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                  title="Homing (G28)"
                >
                  <Home className="w-4 h-4" />
                </button>
                <div className="border-l h-6 mx-1"></div>
                {status.status === 'printing' && (
                  <button
                    onClick={() => doControl('pause')}
                    disabled={controlBusy}
                    className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Pause className="w-4 h-4" /> Pausieren
                  </button>
                )}
                {status.status === 'paused' && (
                  <button
                    onClick={() => doControl('resume')}
                    disabled={controlBusy}
                    className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" /> Fortsetzen
                  </button>
                )}
                {(status.status === 'printing' || status.status === 'paused') && (
                  <button
                    onClick={() => {
                      if (confirm('Druck wirklich abbrechen?')) doControl('stop')
                    }}
                    disabled={controlBusy}
                    className="btn-secondary text-sm text-red-600 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Square className="w-4 h-4" /> Stoppen
                  </button>
                )}
              </div>
            </div>

            {/* AMS-Widget */}
            {(status.ams?.length > 0 || status.external_tray) && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Filamente</div>
                <AmsWidget
                  amsUnits={status.ams || []}
                  externalTray={status.external_tray}
                  trayNow={status.tray_now}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Info-Card - kleiner als bisher */}
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


// Lüfter-Balken-Komponente
function FanBar({ label, value }) {
  const pct = parseInt(value) || 0
  return (
    <div className="border rounded p-2 bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1">
        <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
