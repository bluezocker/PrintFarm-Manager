import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListOrdered, X, Clock, ChevronUp, ChevronDown, Plus,
  GripVertical, Package, User,
} from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

export default function QueuePage() {
  const navigate = useNavigate()
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState(null)
  const [queue, setQueue] = useState([])
  const [availableJobs, setAvailableJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draggedIdx, setDraggedIdx] = useState(null)

  const loadPrinters = async () => {
    const r = await api.get('/printers')
    setPrinters(r.data)
    if (r.data.length > 0 && !selectedPrinter) {
      setSelectedPrinter(r.data[0].id)
    }
  }

  const loadQueue = async (printerId) => {
    if (!printerId) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.get(`/queue/${printerId}`)
      setQueue(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableJobs = async () => {
    try {
      const r = await api.get('/jobs')
      // Nur die nicht in irgendeiner Queue und nicht abgeschlossen
      const available = r.data.filter((j) =>
        !j.queue_position && !['completed', 'paid', 'cancelled'].includes(j.status)
      )
      setAvailableJobs(available)
    } catch {}
  }

  useEffect(() => { loadPrinters() }, [])
  useEffect(() => {
    if (selectedPrinter) loadQueue(selectedPrinter)
  }, [selectedPrinter])

  const enqueue = async (jobId) => {
    try {
      await api.post(`/queue/jobs/${jobId}/enqueue`, { printer_id: selectedPrinter })
      loadQueue(selectedPrinter)
      loadAvailableJobs()
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  const dequeue = async (jobId) => {
    if (!confirm('Aus Warteschlange entfernen?')) return
    try {
      await api.delete(`/queue/jobs/${jobId}`)
      loadQueue(selectedPrinter)
    } catch (e) {
      alert(e.response?.data?.detail || 'Fehler')
    }
  }

  const moveUp = (idx) => {
    if (idx === 0) return
    const newQueue = [...queue]
    ;[newQueue[idx - 1], newQueue[idx]] = [newQueue[idx], newQueue[idx - 1]]
    setQueue(newQueue)
    saveOrder(newQueue)
  }

  const moveDown = (idx) => {
    if (idx === queue.length - 1) return
    const newQueue = [...queue]
    ;[newQueue[idx + 1], newQueue[idx]] = [newQueue[idx], newQueue[idx + 1]]
    setQueue(newQueue)
    saveOrder(newQueue)
  }

  const saveOrder = async (order) => {
    try {
      await api.post(`/queue/${selectedPrinter}/reorder`, {
        job_ids: order.map((j) => j.id),
      })
    } catch (e) {
      setError('Reihenfolge konnte nicht gespeichert werden')
      loadQueue(selectedPrinter)
    }
  }

  // Drag & Drop
  const onDragStart = (idx) => setDraggedIdx(idx)
  const onDragEnd = () => setDraggedIdx(null)
  const onDragOver = (e) => e.preventDefault()
  const onDrop = (targetIdx) => {
    if (draggedIdx === null || draggedIdx === targetIdx) return
    const newQueue = [...queue]
    const [moved] = newQueue.splice(draggedIdx, 1)
    newQueue.splice(targetIdx, 0, moved)
    setQueue(newQueue)
    saveOrder(newQueue)
    setDraggedIdx(null)
  }

  const selectedPrinterObj = printers.find((p) => p.id === selectedPrinter)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListOrdered className="w-6 h-6" /> Warteschlange
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Reihenfolge der zu druckenden Aufträge pro Drucker verwalten.
          </p>
        </div>
        <button
          onClick={() => {
            loadAvailableJobs()
            setAddOpen(true)
          }}
          disabled={!selectedPrinter}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Auftrag hinzufügen
        </button>
      </div>

      {/* Drucker-Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {printers.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPrinter(p.id)}
            className={`px-4 py-2 rounded-md text-sm whitespace-nowrap flex-shrink-0 ${
              selectedPrinter === p.id
                ? 'bg-primary-600 text-white'
                : 'bg-white border hover:bg-gray-50'
            }`}
          >
            {p.name}
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
      ) : queue.length === 0 ? (
        <div className="card text-center py-12">
          <ListOrdered className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-1">Keine Aufträge in der Warteschlange</p>
          <p className="text-xs text-gray-400">
            Klicke oben auf "Auftrag hinzufügen" um Aufträge einzureihen.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((job, idx) => (
            <div
              key={job.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={() => onDrop(idx)}
              className={`card !p-3 flex items-center gap-3 cursor-move ${
                draggedIdx === idx ? 'opacity-50' : ''
              }`}
            >
              <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/jobs?edit=${job.id}`)}>
                <div className="font-medium truncate">{job.title}</div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {job.order_number && <span>{job.order_number}</span>}
                  {job.customer_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {job.customer_name}
                    </span>
                  )}
                  {job.estimated_hours != null && job.estimated_hours > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {job.estimated_hours}h
                    </span>
                  )}
                  {job.print_file_name && (
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" /> {job.print_file_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-primary-600 disabled:opacity-30"
                  title="Nach oben"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === queue.length - 1}
                  className="p-1 text-gray-400 hover:text-primary-600 disabled:opacity-30"
                  title="Nach unten"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => dequeue(job.id)}
                  className="p-1 text-gray-400 hover:text-red-600 ml-1"
                  title="Aus Warteschlange"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add-Dialog */}
      {addOpen && (
        <Modal open onClose={() => setAddOpen(false)} title="Auftrag in Warteschlange" size="lg">
          {availableJobs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Keine verfügbaren Aufträge. Alle offenen Aufträge sind bereits in einer Warteschlange.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {availableJobs.map((j) => (
                <div key={j.id} className="border rounded p-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{j.title}</div>
                    <div className="text-xs text-gray-500">
                      {j.order_number} · {j.status}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      enqueue(j.id)
                      setAddOpen(false)
                    }}
                    className="btn-primary text-sm ml-3 flex-shrink-0"
                  >
                    Hinzufügen
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-3 border-t mt-3">
            <button onClick={() => setAddOpen(false)} className="btn-secondary">Schließen</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
