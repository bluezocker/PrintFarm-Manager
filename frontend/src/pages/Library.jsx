import { useEffect, useRef, useState } from 'react'
import {
  Upload, Search, Trash2, Download, Edit2, X, Clock, Package,
  FileText, Grid, List as ListIcon, RefreshCw,
} from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const CATEGORIES = [
  { value: 'general', label: 'Allgemein' },
  { value: 'work', label: 'Arbeit' },
  { value: 'hobby', label: 'Hobby' },
  { value: 'tools', label: 'Werkzeuge' },
  { value: 'spare_parts', label: 'Ersatzteile' },
  { value: 'gifts', label: 'Geschenke' },
]

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatMinutes(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h ${m}min` : `${m}min`
}

// =========================================================================
// ThumbnailImg - lädt das Bild über axios (mit Auth-Header)
// Verhindert das Problem, dass <img src> keine JWT-Header sendet
// =========================================================================
function ThumbnailImg({ fileId, alt = '', className = '', refreshKey }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let currentUrl = null
    setError(false)

    api.get(`/library/${fileId}/thumbnail`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(r.data)
        setUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [fileId, refreshKey])

  if (error || !url) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
        <FileText className="w-1/3 h-1/3" />
      </div>
    )
  }
  return <img src={url} alt={alt} className={className} />
}

export default function Library() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState('grid')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingFile, setEditingFile] = useState(null)
  const [regenerating, setRegenerating] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category) params.set('category', category)
      const r = await api.get(`/library?${params}`)
      setFiles(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [category])

  useEffect(() => {
    const t = setTimeout(() => load(), 400)
    return () => clearTimeout(t)
  }, [search])

  const del = async (file) => {
    if (!confirm(`"${file.display_name || file.filename}" wirklich löschen?`)) return
    try {
      await api.delete(`/library/${file.id}`)
      setFiles(files.filter((f) => f.id !== file.id))
    } catch (e) {
      alert(e.response?.data?.detail || 'Löschen fehlgeschlagen')
    }
  }

  const download = async (file) => {
    try {
      const r = await api.get(`/library/${file.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Download fehlgeschlagen')
    }
  }

  const regenerateThumbnail = async (file) => {
    setRegenerating(file.id)
    try {
      await api.post(`/library/${file.id}/regenerate-thumbnail`)
      // Datei neu laden aus dem Server
      await load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Thumbnail konnte nicht generiert werden')
    } finally {
      setRegenerating(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" /> Datei-Archiv
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Zentrale Bibliothek für 3MF-, G-Code- und STL-Dateien.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Datei hochladen
        </button>
      </div>

      {/* Filter + Search */}
      <div className="card !p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm"
            />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="input text-sm !w-auto">
            <option value="">Alle Kategorien</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <div className="flex border rounded overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 ${view === 'grid' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
              title="Kacheln"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 ${view === 'list' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
              title="Liste"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Lade...</div>
      ) : files.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Keine Dateien im Archiv.</p>
          <button
            onClick={() => setUploadOpen(true)}
            className="btn-primary mt-4 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Erste Datei hochladen
          </button>
        </div>
      ) : view === 'grid' ? (
        <GridView
          files={files}
          onEdit={setEditingFile}
          onDelete={del}
          onDownload={download}
          onRegenerateThumbnail={regenerateThumbnail}
          regenerating={regenerating}
        />
      ) : (
        <ListView
          files={files}
          onEdit={setEditingFile}
          onDelete={del}
          onDownload={download}
          onRegenerateThumbnail={regenerateThumbnail}
          regenerating={regenerating}
        />
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            setUploadOpen(false)
            load()
          }}
        />
      )}

      {editingFile && (
        <EditDialog
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={(updated) => {
            setFiles(files.map((f) => (f.id === updated.id ? updated : f)))
            setEditingFile(null)
          }}
        />
      )}
    </div>
  )
}

// =========================================================================
// Grid View
// =========================================================================
function GridView({ files, onEdit, onDelete, onDownload, onRegenerateThumbnail, regenerating }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {files.map((file) => (
        <div key={file.id} className="card !p-0 overflow-hidden group hover:shadow-md transition-shadow">
          <div className="aspect-square bg-gray-100 relative">
            {file.has_thumbnail ? (
              <ThumbnailImg
                fileId={file.id}
                alt={file.display_name || file.filename}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 flex-col gap-1">
                <FileText className="w-12 h-12" />
                {file.file_type === '3mf' && (
                  <button
                    onClick={() => onRegenerateThumbnail(file)}
                    disabled={regenerating === file.id}
                    className="text-[10px] text-primary-600 hover:underline flex items-center gap-1"
                    title="Thumbnail neu extrahieren"
                  >
                    <RefreshCw className={`w-3 h-3 ${regenerating === file.id ? 'animate-spin' : ''}`} />
                    Thumbnail
                  </button>
                )}
              </div>
            )}
            <div className="absolute top-1 right-1 bg-gray-800/80 text-white text-[10px] px-1.5 py-0.5 rounded uppercase">
              {file.file_type}
            </div>
          </div>

          <div className="p-2">
            <h3 className="font-medium text-sm truncate" title={file.display_name || file.filename}>
              {file.display_name || file.filename}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              {file.estimated_time_minutes ? (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> {formatMinutes(file.estimated_time_minutes)}
                </span>
              ) : null}
              {file.estimated_material_g ? (
                <span>{Math.round(file.estimated_material_g)}g</span>
              ) : null}
            </div>
            {file.tags && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {file.tags.split(',').filter(Boolean).slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    #{t.trim()}
                  </span>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center gap-1 mt-2 pt-2 border-t">
              <button onClick={() => onDownload(file)} className="text-gray-400 hover:text-primary-600 p-1"
                title="Download">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => onEdit(file)} className="text-gray-400 hover:text-primary-600 p-1"
                title="Bearbeiten">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(file)} className="text-gray-400 hover:text-red-600 p-1"
                title="Löschen">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// =========================================================================
// List View
// =========================================================================
function ListView({ files, onEdit, onDelete, onDownload, onRegenerateThumbnail, regenerating }) {
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-16"></th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Typ</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Größe</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Zeit</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Material</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-32">Kategorie</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600 w-40">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2">
                {file.has_thumbnail ? (
                  <ThumbnailImg
                    fileId={file.id}
                    className="w-10 h-10 object-contain bg-gray-100 rounded"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300">
                    <FileText className="w-5 h-5" />
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{file.display_name || file.filename}</div>
                {file.tags && (
                  <div className="text-xs text-gray-500">
                    {file.tags.split(',').filter(Boolean).slice(0, 3).map((t) => `#${t.trim()}`).join(' ')}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500 uppercase text-xs">{file.file_type}</td>
              <td className="px-3 py-2 text-right text-gray-600">{formatSize(file.file_size)}</td>
              <td className="px-3 py-2 text-right text-gray-600">{formatMinutes(file.estimated_time_minutes)}</td>
              <td className="px-3 py-2 text-right text-gray-600">
                {file.estimated_material_g ? `${Math.round(file.estimated_material_g)}g` : '—'}
              </td>
              <td className="px-3 py-2 text-gray-600">
                {CATEGORIES.find((c) => c.value === file.category)?.label || file.category || 'Allgemein'}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {!file.has_thumbnail && file.file_type === '3mf' && (
                  <button
                    onClick={() => onRegenerateThumbnail(file)}
                    disabled={regenerating === file.id}
                    className="text-gray-400 hover:text-primary-600 mr-2"
                    title="Thumbnail neu extrahieren"
                  >
                    <RefreshCw className={`w-4 h-4 inline ${regenerating === file.id ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button onClick={() => onDownload(file)} className="text-gray-400 hover:text-primary-600 mr-2" title="Download">
                  <Download className="w-4 h-4 inline" />
                </button>
                <button onClick={() => onEdit(file)} className="text-gray-400 hover:text-primary-600 mr-2" title="Bearbeiten">
                  <Edit2 className="w-4 h-4 inline" />
                </button>
                <button onClick={() => onDelete(file)} className="text-gray-400 hover:text-red-600" title="Löschen">
                  <Trash2 className="w-4 h-4 inline" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =========================================================================
// Upload-Dialog
// =========================================================================
function UploadDialog({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [category, setCategory] = useState('general')
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    if (!displayName) {
      setDisplayName(f.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const upload = async () => {
    if (!file) {
      setError('Bitte Datei wählen')
      return
    }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (displayName) fd.append('display_name', displayName)
      if (category) fd.append('category', category)
      if (tags) fd.append('tags', tags)
      if (description) fd.append('description', description)
      await api.post('/library/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onSuccess()
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Datei hochladen" size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Datei (3MF, G-Code, STL)</label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFile(e.dataTransfer.files?.[0])
            }}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors"
          >
            {file ? (
              <div>
                <FileText className="w-8 h-8 mx-auto text-primary-500 mb-2" />
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  Klicken oder Datei hierher ziehen
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Max. 200 MB, .3mf, .gcode, .stl, .bgcode
                </p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".3mf,.gcode,.gco,.stl,.bgcode"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="hidden"
            />
          </div>
        </div>

        <div>
          <label className="label">Anzeige-Name</label>
          <input
            type="text"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Frei wählbarer Name"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kategorie</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags (kommagetrennt)</label>
            <input
              type="text"
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="spoolbuddy, useful"
            />
          </div>
        </div>

        <div>
          <label className="label">Beschreibung</label>
          <textarea
            className="input"
            rows="2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notizen zur Datei..."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button
            onClick={upload}
            disabled={uploading || !file}
            className="btn-primary disabled:opacity-50"
          >
            {uploading ? 'Lade hoch...' : 'Hochladen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =========================================================================
// Edit-Dialog
// =========================================================================
function EditDialog({ file, onClose, onSaved }) {
  const [form, setForm] = useState({
    display_name: file.display_name || '',
    category: file.category || 'general',
    tags: file.tags || '',
    description: file.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const r = await api.patch(`/library/${file.id}`, form)
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Datei bearbeiten" size="md">
      <div className="space-y-3">
        <div className="text-xs text-gray-500">
          Originalname: <span className="font-mono">{file.filename}</span>
        </div>
        <div>
          <label className="label">Anzeige-Name</label>
          <input
            type="text"
            className="input"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kategorie</label>
            <select className="input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags</label>
            <input
              type="text"
              className="input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
