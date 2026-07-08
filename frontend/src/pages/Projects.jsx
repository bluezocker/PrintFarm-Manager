import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban, Plus, Edit2, Trash2, ExternalLink, User, Package,
  FileText, CheckCircle2, X,
} from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const STATUS_LABELS = {
  active: { label: 'Aktiv', color: 'bg-green-100 text-green-800' },
  on_hold: { label: 'Pausiert', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Abgeschlossen', color: 'bg-blue-100 text-blue-800' },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-700' },
}

const PROJECT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
]

const emptyForm = {
  name: '',
  description: '',
  color: '#3b82f6',
  status: 'active',
  customer_id: '',
  external_url: '',
}

export default function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      const [pRes, cRes] = await Promise.all([
        api.get(`/projects?${params}`),
        api.get('/customers'),
      ])
      setProjects(pRes.data)
      setCustomers(cRes.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus])

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setSaveError('')
    setModalOpen(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      name: p.name || '',
      description: p.description || '',
      color: p.color || '#3b82f6',
      status: p.status || 'active',
      customer_id: p.customer_id || '',
      external_url: p.external_url || '',
    })
    setSaveError('')
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setSaveError('Name ist erforderlich')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      }
      if (editing) {
        await api.patch(`/projects/${editing.id}`, payload)
      } else {
        await api.post('/projects', payload)
      }
      setModalOpen(false)
      load()
    } catch (e) {
      setSaveError(e.response?.data?.detail || 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const del = async (p) => {
    if (!confirm(`Projekt "${p.name}" wirklich löschen?\n\nZugewiesene Aufträge und Dateien bleiben erhalten.`)) return
    try {
      await api.delete(`/projects/${p.id}`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Löschen fehlgeschlagen')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="w-6 h-6" /> Projekte
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Aufträge und Dateien in Projekten gruppieren.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Neues Projekt
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 rounded text-sm ${!filterStatus ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50'}`}
        >
          Alle
        </button>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setFilterStatus(k)}
            className={`px-3 py-1.5 rounded text-sm ${filterStatus === k ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Lade...</div>
      ) : projects.length === 0 ? (
        <div className="card text-center py-12">
          <FolderKanban className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-1">Keine Projekte vorhanden</p>
          <p className="text-xs text-gray-400 mb-4">
            Erstelle dein erstes Projekt, um Aufträge zu gruppieren.
          </p>
          <button onClick={openNew} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Erstes Projekt erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="card !p-0 overflow-hidden hover:shadow-md transition-shadow">
              {/* Color bar */}
              <div className="h-2" style={{ backgroundColor: p.color || '#e5e7eb' }}></div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div
                    className="cursor-pointer flex-1 min-w-0"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <h3 className="font-semibold text-base truncate">{p.name}</h3>
                    {p.customer_name && (
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3" /> {p.customer_name}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${STATUS_LABELS[p.status]?.color || 'bg-gray-100'} text-xs flex-shrink-0`}>
                    {STATUS_LABELS[p.status]?.label || p.status}
                  </span>
                </div>

                {p.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{p.description}</p>
                )}

                {/* Statistiken */}
                <div className="grid grid-cols-3 gap-1 mb-3 text-center">
                  <div className="bg-gray-50 rounded p-1.5">
                    <div className="text-xs text-gray-500 flex items-center justify-center gap-0.5">
                      <FileText className="w-3 h-3" /> Aufträge
                    </div>
                    <div className="font-semibold text-sm">{p.job_count}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-1.5">
                    <div className="text-xs text-gray-500 flex items-center justify-center gap-0.5">
                      <Package className="w-3 h-3" /> Dateien
                    </div>
                    <div className="font-semibold text-sm">{p.file_count}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-1.5">
                    <div className="text-xs text-gray-500 flex items-center justify-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Fertig
                    </div>
                    <div className="font-semibold text-sm text-green-600">{p.completed_count}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <button
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Details →
                  </button>
                  <div className="flex items-center gap-1">
                    {p.external_url && (
                      <a href={p.external_url} target="_blank" rel="noreferrer"
                        className="text-gray-400 hover:text-primary-600 p-1"
                        title="Externer Link">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-primary-600 p-1">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => del(p)} className="text-gray-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <Modal open onClose={() => setModalOpen(false)} title={editing ? 'Projekt bearbeiten' : 'Neues Projekt'} size="md">
          <div className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Kunde ACME - Q3 2026"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Beschreibung</label>
              <textarea
                className="input"
                rows="2"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Kunde</label>
                <select className="input" value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">Kein Kunde</option>
                  {customers.map((c) => {
                    const name = c.customer_type === 'business'
                      ? c.company_name
                      : `${c.first_name || ''} ${c.last_name || ''}`.trim()
                    return <option key={c.id} value={c.id}>{name}</option>
                  })}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Farbe</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-200'}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="label">Externer Link (optional)</label>
              <input
                type="url"
                className="input"
                value={form.external_url}
                onChange={(e) => setForm({ ...form, external_url: e.target.value })}
                placeholder="https://printables.com/..."
              />
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
                {saveError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Abbrechen</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Speichere...' : (editing ? 'Speichern' : 'Erstellen')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
