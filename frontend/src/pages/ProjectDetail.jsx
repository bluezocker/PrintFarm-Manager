import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, FolderKanban, User, ExternalLink, Edit2, Plus, X,
  FileText, Package, Clock, CheckCircle2, Trash2,
} from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const STATUS_LABELS = {
  active: { label: 'Aktiv', color: 'bg-green-100 text-green-800' },
  on_hold: { label: 'Pausiert', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Abgeschlossen', color: 'bg-blue-100 text-blue-800' },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-700' },
}

const JOB_STATUS = {
  new: { label: 'Neu', color: 'bg-gray-100 text-gray-800' },
  in_progress: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800' },
  printing: { label: 'Druckt', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausiert', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Fertig', color: 'bg-purple-100 text-purple-800' },
  paid: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Storniert', color: 'bg-red-100 text-red-800' },
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatMinutes(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h ${m}min` : `${m}min`
}

// Thumbnail via axios laden (mit Auth-Header)
function ThumbnailImg({ fileId, className = '' }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let cancelled = false
    let currentUrl = null
    setErr(false)
    api.get(`/library/${fileId}/thumbnail`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(r.data)
        setUrl(currentUrl)
      })
      .catch(() => !cancelled && setErr(true))
    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [fileId])
  if (err || !url) return <div className={`bg-gray-100 flex items-center justify-center text-gray-300 ${className}`}><Package className="w-1/3 h-1/3" /></div>
  return <img src={url} className={className} alt="" />
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [jobs, setJobs] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Assign-Dialoge
  const [assignJobsOpen, setAssignJobsOpen] = useState(false)
  const [assignFilesOpen, setAssignFilesOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, j, f] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/jobs`),
        api.get(`/projects/${id}/files`),
      ])
      setProject(p.data)
      setJobs(j.data)
      setFiles(f.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const removeJob = async (jobId) => {
    if (!confirm('Auftrag aus Projekt entfernen? (Auftrag selbst wird NICHT gelöscht)')) return
    try {
      await api.patch(`/jobs/${jobId}`, { project_id: null })
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  const removeFile = async (fileId) => {
    if (!confirm('Datei aus Projekt entfernen? (Datei selbst wird NICHT gelöscht)')) return
    try {
      await api.patch(`/library/${fileId}`, { project_id: null })
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  if (loading) return <div className="text-gray-500">Lade...</div>
  if (error) return <div className="text-red-700">{error}</div>
  if (!project) return null

  return (
    <div>
      <Link to="/projects" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Zurück zu Projekten
      </Link>

      {/* Header */}
      <div className="card !p-0 overflow-hidden mb-4">
        <div className="h-3" style={{ backgroundColor: project.color || '#e5e7eb' }}></div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold truncate">{project.name}</h1>
                <span className={`badge ${STATUS_LABELS[project.status]?.color || 'bg-gray-100'} text-xs`}>
                  {STATUS_LABELS[project.status]?.label || project.status}
                </span>
              </div>
              {project.customer_name && (
                <div className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                  <User className="w-4 h-4" /> {project.customer_name}
                </div>
              )}
              {project.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.description}</p>
              )}
              {project.external_url && (
                <a href={project.external_url} target="_blank" rel="noreferrer"
                  className="text-sm text-primary-600 hover:underline inline-flex items-center gap-1 mt-2">
                  <ExternalLink className="w-3 h-3" /> Externer Link
                </a>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="text-xs text-gray-500">Aufträge</div>
              <div className="text-2xl font-bold">{project.job_count}</div>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="text-xs text-gray-500">Dateien</div>
              <div className="text-2xl font-bold">{project.file_count}</div>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="text-xs text-gray-500">Abgeschlossen</div>
              <div className="text-2xl font-bold text-green-600">{project.completed_count}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Aufträge */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" /> Aufträge
          </h2>
          <button
            onClick={() => setAssignJobsOpen(true)}
            className="btn-secondary text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Aufträge hinzufügen
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Noch keine Aufträge in diesem Projekt.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="border rounded p-2 flex items-center gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/jobs?edit=${j.id}`)}>
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{j.title}</div>
                    <span className={`badge ${JOB_STATUS[j.status]?.color || 'bg-gray-100'} text-xs flex-shrink-0`}>
                      {JOB_STATUS[j.status]?.label || j.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {j.order_number && <span>{j.order_number}</span>}
                    {j.customer_name && <span>{j.customer_name}</span>}
                    {j.estimated_hours != null && j.estimated_hours > 0 && (
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {j.estimated_hours}h</span>
                    )}
                    {j.price_gross > 0 && <span>{j.price_gross.toFixed(2)} €</span>}
                  </div>
                </div>
                <button onClick={() => removeJob(j.id)}
                  className="text-gray-400 hover:text-red-600 p-1 flex-shrink-0"
                  title="Aus Projekt entfernen">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dateien */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" /> Archiv-Dateien
          </h2>
          <button
            onClick={() => setAssignFilesOpen(true)}
            className="btn-secondary text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Dateien hinzufügen
          </button>
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Noch keine Dateien in diesem Projekt.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {files.map((f) => (
              <div key={f.id} className="border rounded overflow-hidden hover:shadow-sm transition-shadow group">
                <div className="aspect-square bg-gray-100 relative">
                  {f.has_thumbnail ? (
                    <ThumbnailImg fileId={f.id} className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-300">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-1 right-1 bg-gray-800/80 text-white text-[10px] px-1.5 py-0.5 rounded uppercase">
                    {f.file_type}
                  </div>
                  <button onClick={() => removeFile(f.id)}
                    className="absolute top-1 left-1 bg-white/80 hover:bg-white text-gray-500 hover:text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Aus Projekt entfernen">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium truncate" title={f.display_name || f.filename}>
                    {f.display_name || f.filename}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                    {f.estimated_time_minutes && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {formatMinutes(f.estimated_time_minutes)}</span>}
                    <span>{formatSize(f.file_size)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {assignJobsOpen && (
        <AssignJobsDialog
          projectId={project.id}
          existingIds={jobs.map((j) => j.id)}
          onClose={() => setAssignJobsOpen(false)}
          onDone={() => { setAssignJobsOpen(false); load() }}
        />
      )}
      {assignFilesOpen && (
        <AssignFilesDialog
          projectId={project.id}
          existingIds={files.map((f) => f.id)}
          onClose={() => setAssignFilesOpen(false)}
          onDone={() => { setAssignFilesOpen(false); load() }}
        />
      )}
    </div>
  )
}

// Dialog: Aufträge zuweisen
function AssignJobsDialog({ projectId, existingIds, onClose, onDone }) {
  const [availableJobs, setAvailableJobs] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/jobs').then((r) => {
      // Nur solche zeigen die nicht schon im Projekt sind
      setAvailableJobs(r.data.filter((j) => !existingIds.includes(j.id)))
      setLoading(false)
    })
  }, [])

  const toggle = (id) => {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const save = async () => {
    if (selected.length === 0) return
    try {
      await api.post(`/projects/${projectId}/assign-jobs`, selected)
      onDone()
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  return (
    <Modal open onClose={onClose} title="Aufträge zum Projekt hinzufügen" size="lg">
      {loading ? (
        <p className="text-gray-500">Lade...</p>
      ) : availableJobs.length === 0 ? (
        <p className="text-gray-500 py-4 text-center">Keine weiteren Aufträge verfügbar.</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-auto">
          {availableJobs.map((j) => (
            <label key={j.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(j.id)}
                onChange={() => toggle(j.id)}
                className="w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{j.title}</div>
                <div className="text-xs text-gray-500">{j.order_number} · {j.status}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center pt-3 border-t mt-3">
        <div className="text-sm text-gray-500">
          {selected.length > 0 ? `${selected.length} ausgewählt` : ''}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button onClick={save} disabled={selected.length === 0} className="btn-primary disabled:opacity-50">
            Hinzufügen ({selected.length})
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Dialog: Dateien zuweisen
function AssignFilesDialog({ projectId, existingIds, onClose, onDone }) {
  const [availableFiles, setAvailableFiles] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/library?unassigned=true').then((r) => {
      setAvailableFiles(r.data.filter((f) => !existingIds.includes(f.id)))
      setLoading(false)
    })
  }, [])

  const toggle = (id) => {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const save = async () => {
    if (selected.length === 0) return
    try {
      await api.post(`/projects/${projectId}/assign-files`, selected)
      onDone()
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  return (
    <Modal open onClose={onClose} title="Dateien zum Projekt hinzufügen" size="lg">
      <p className="text-xs text-gray-500 mb-3">Es werden nur Dateien angezeigt, die noch keinem Projekt zugewiesen sind.</p>
      {loading ? (
        <p className="text-gray-500">Lade...</p>
      ) : availableFiles.length === 0 ? (
        <p className="text-gray-500 py-4 text-center">Keine verfügbaren Dateien.</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-auto">
          {availableFiles.map((f) => (
            <label key={f.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(f.id)}
                onChange={() => toggle(f.id)}
                className="w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{f.display_name || f.filename}</div>
                <div className="text-xs text-gray-500 uppercase">{f.file_type} · {formatSize(f.file_size)}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center pt-3 border-t mt-3">
        <div className="text-sm text-gray-500">
          {selected.length > 0 ? `${selected.length} ausgewählt` : ''}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button onClick={save} disabled={selected.length === 0} className="btn-primary disabled:opacity-50">
            Hinzufügen ({selected.length})
          </button>
        </div>
      </div>
    </Modal>
  )
}
