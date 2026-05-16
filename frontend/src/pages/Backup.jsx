import { useEffect, useState } from 'react'
import { Database, Download, Plus, Trash2, AlertCircle, Clock } from 'lucide-react'
import api from '../services/api'

export default function Backup() {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/backup')
      setBackups(r.data)
      setError('')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createBackup = async () => {
    setCreating(true)
    setError('')
    try {
      await api.post('/backup/create')
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setCreating(false)
    }
  }

  const downloadBackup = async (filename) => {
    try {
      const r = await api.get(`/backup/download/${filename}`, { responseType: 'blob' })
      const blob = new Blob([r.data], { type: 'application/sql' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const deleteBackup = async (filename) => {
    if (!confirm(`Backup ${filename} löschen?`)) return
    try {
      await api.delete(`/backup/${filename}`)
      load()
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const cleanup = async () => {
    if (!confirm('Alle Auto-Backups älter als 30 Tage löschen?')) return
    try {
      const r = await api.post('/backup/cleanup?keep_days=30')
      alert(`${r.data.deleted_count} alte Backups gelöscht`)
      load()
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6" /> Datenbank-Backups
          </h1>
          <p className="text-gray-500">Automatisch täglich um 03:00 Uhr · 30 Tage Aufbewahrung</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cleanup} className="btn-secondary text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Alte aufräumen
          </button>
          <button onClick={createBackup} disabled={creating}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {creating ? 'Erstelle Backup...' : 'Backup jetzt erstellen'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Dateiname</th>
              <th className="p-3 text-left">Typ</th>
              <th className="p-3 text-left">Erstellt</th>
              <th className="p-3 text-right">Größe</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">Lade...</td></tr>
            ) : backups.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">
                Noch keine Backups vorhanden. Klick auf "Backup jetzt erstellen".
              </td></tr>
            ) : (
              backups.map((b) => {
                const isAuto = b.filename.startsWith('auto_')
                return (
                  <tr key={b.filename} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{b.filename}</td>
                    <td className="p-3">
                      {isAuto ? (
                        <span className="badge bg-blue-100 text-blue-800 text-xs">
                          <Clock className="w-3 h-3 inline mr-1" /> Auto
                        </span>
                      ) : (
                        <span className="badge bg-purple-100 text-purple-800 text-xs">Manuell</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 text-xs">
                      {new Date(b.created_at).toLocaleString('de-DE')}
                    </td>
                    <td className="p-3 text-right font-mono">{b.size_kb} KB</td>
                    <td className="p-3 text-right">
                      <button onClick={() => downloadBackup(b.filename)}
                        className="text-gray-400 hover:text-primary-600 mr-2"
                        title="Herunterladen">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteBackup(b.filename)}
                        className="text-gray-400 hover:text-red-600"
                        title="Löschen">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="card bg-amber-50 border-amber-200 mt-6">
        <h3 className="font-semibold text-amber-900 mb-2">⚠ Wichtig zur Wiederherstellung</h3>
        <p className="text-sm text-amber-900 mb-3">
          Backups werden im SQL-Dump-Format gespeichert. Zum Wiederherstellen:
        </p>
        <pre className="bg-amber-100 p-3 rounded text-xs overflow-x-auto">{`# Container herunterfahren
sudo docker compose down

# Volume neu anlegen
sudo docker compose up -d db
sudo docker compose exec -T db psql -U printfarm -d printfarm < backup.sql

# Komplett wieder hochfahren
sudo docker compose up -d`}</pre>
        <p className="text-xs text-amber-800 mt-3">
          Backups regelmäßig auf einem externen Medium (NAS, Cloud) sichern - das System
          speichert sie nur lokal im Docker-Volume.
        </p>
      </div>
    </div>
  )
}
