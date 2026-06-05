import { useEffect, useState } from 'react'
import { Mail, Save, RotateCcw, Eye, Info } from 'lucide-react'
import api from '../services/api'

const PLACEHOLDERS = [
  { key: '{customer_name}', desc: 'Name des Kunden' },
  { key: '{order_number}', desc: 'Auftragsnummer' },
  { key: '{title}', desc: 'Titel des Auftrags' },
  { key: '{due_date}', desc: 'Liefertermin (DD.MM.YYYY)' },
  { key: '{company}', desc: 'Eigener Firmenname' },
]

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState(null)
  const [previewData, setPreviewData] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/email-templates')
      setTemplates(r.data)
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Fehler beim Laden' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const updateField = (id, field, value) => {
    setTemplates(templates.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  const save = async (t) => {
    setSavingId(t.id)
    setMessage(null)
    try {
      await api.patch(`/email-templates/${t.id}`, {
        subject: t.subject,
        body: t.body,
        enabled: t.enabled,
      })
      setMessage({ type: 'success', text: `"${t.label}" gespeichert ✓` })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Fehler beim Speichern' })
    } finally {
      setSavingId(null)
    }
  }

  const reset = async (t) => {
    if (!confirm(`Möchtest du "${t.label}" wirklich auf die Standardwerte zurücksetzen?`)) return
    setSavingId(t.id)
    try {
      const r = await api.post(`/email-templates/${t.id}/reset`)
      setTemplates(templates.map((x) => (x.id === t.id ? r.data : x)))
      setMessage({ type: 'success', text: `"${t.label}" zurückgesetzt ✓` })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Fehler beim Zurücksetzen' })
    } finally {
      setSavingId(null)
    }
  }

  const preview = async (t) => {
    try {
      const r = await api.post(`/email-templates/${t.id}/preview`)
      setPreviewData({ label: t.label, ...r.data })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Fehler beim Vorschau' })
    }
  }

  if (loading) return <div className="text-gray-500">Lade...</div>

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">E-Mail-Texte</h1>
        <p className="text-sm text-gray-500 mt-1">
          Diese Texte werden an Kunden geschickt, wenn der Auftragsstatus geändert wird.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm mb-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Platzhalter-Erklärung */}
      <div className="card mb-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 mb-2">Verfügbare Platzhalter</h3>
            <p className="text-xs text-blue-800 mb-3">
              Diese Platzhalter werden beim Versand automatisch durch die jeweiligen Werte ersetzt:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PLACEHOLDERS.map((p) => (
                <div key={p.key} className="text-xs">
                  <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-700 font-mono">
                    {p.key}
                  </code>
                  <span className="text-blue-800 ml-2">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {templates.map((t) => (
          <div key={t.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold">{t.label}</h2>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={(e) => updateField(t.id, 'enabled', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className={t.enabled ? 'text-gray-700' : 'text-gray-400'}>
                  {t.enabled ? 'Aktiv' : 'Deaktiviert'}
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label text-xs">Betreff</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={t.subject}
                  onChange={(e) => updateField(t.id, 'subject', e.target.value)}
                />
              </div>

              <div>
                <label className="label text-xs">Text</label>
                <textarea
                  className="input text-sm font-mono"
                  rows="9"
                  value={t.body}
                  onChange={(e) => updateField(t.id, 'body', e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
              <button
                onClick={() => save(t)}
                disabled={savingId === t.id}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingId === t.id ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                onClick={() => preview(t)}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Eye className="w-4 h-4" />
                Vorschau
              </button>
              <button
                onClick={() => reset(t)}
                disabled={savingId === t.id}
                className="btn-secondary flex items-center gap-2 text-sm text-gray-600 disabled:opacity-50"
                title="Auf Standard-Text zurücksetzen"
              >
                <RotateCcw className="w-4 h-4" />
                Zurücksetzen
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Vorschau-Modal */}
      {previewData && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold mb-1">Vorschau: {previewData.label}</h3>
              <p className="text-xs text-gray-500 mb-4">Mit Beispielwerten ausgefüllt</p>

              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Betreff</p>
                <div className="bg-gray-50 p-3 rounded font-medium text-sm">
                  {previewData.subject}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Text</p>
                <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-mono">
                  {previewData.body}
                </div>
              </div>

              <button
                onClick={() => setPreviewData(null)}
                className="btn-primary w-full mt-4"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
