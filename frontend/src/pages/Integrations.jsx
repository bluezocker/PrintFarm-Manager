import { useEffect, useState } from 'react'
import { Zap, Cloud, Save, CheckCircle, XCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import api from '../services/api'

export default function Integrations() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [data, setData] = useState(null)
  const [form, setForm] = useState({})
  const [showSecret, setShowSecret] = useState(false)
  const [message, setMessage] = useState(null)
  const [testResult, setTestResult] = useState(null)

  // Bambu Verification-Flow
  const [needsCode, setNeedsCode] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/integrations')
      setData(r.data)
      setForm({
        tuya_enabled: r.data.tuya_enabled,
        tuya_access_id: r.data.tuya_access_id || '',
        tuya_access_secret: '',
        tuya_api_endpoint: r.data.tuya_api_endpoint || 'https://openapi.tuyaeu.com',
        bambu_enabled: r.data.bambu_enabled,
        bambu_cloud_email: r.data.bambu_cloud_email || '',
        bambu_cloud_password: '',
      })
    } catch (e) {
      setMessage({ type: 'error', text: 'Fehler beim Laden: ' + (e.response?.data?.detail || e.message) })
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    setTestResult(null)
    try {
      const payload = { ...form }
      // Leere Passwort-Felder NICHT senden (alter Wert bleibt)
      if (!payload.tuya_access_secret) delete payload.tuya_access_secret
      if (!payload.bambu_cloud_password) delete payload.bambu_cloud_password
      const r = await api.patch('/integrations', payload)
      setData(r.data)
      setForm({ ...form, tuya_access_secret: '', bambu_cloud_password: '' })
      setMessage({ type: 'success', text: 'Einstellungen gespeichert ✓' })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  const testTuya = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/integrations/tuya/test')
      setTestResult({ ...r.data, service: 'tuya' })
    } catch (e) {
      setTestResult({ success: false, service: 'tuya', message: e.response?.data?.detail || e.message })
    } finally {
      setTesting(false)
    }
  }

  const testBambu = async () => {
    setTesting(true)
    setTestResult(null)
    setNeedsCode(false)
    try {
      const r = await api.post('/integrations/bambu/test')
      if (r.data.needs_verification) {
        setNeedsCode(true)
        setTestResult({ ...r.data, service: 'bambu' })
      } else {
        setTestResult({ ...r.data, service: 'bambu' })
      }
    } catch (e) {
      setTestResult({ success: false, service: 'bambu', message: e.response?.data?.detail || e.message })
    } finally {
      setTesting(false)
    }
  }

  const submitVerifyCode = async () => {
    if (!verifyCode.trim()) return
    setVerifying(true)
    setTestResult(null)
    try {
      const r = await api.post('/integrations/bambu/verify-code', { code: verifyCode.trim() })
      setTestResult({ ...r.data, service: 'bambu' })
      if (r.data.success) {
        setNeedsCode(false)
        setVerifyCode('')
      }
    } catch (e) {
      setTestResult({
        success: false, service: 'bambu',
        message: e.response?.data?.detail || e.message,
      })
    } finally {
      setVerifying(false)
    }
  }

  const requestNewCode = async () => {
    setVerifying(true)
    try {
      const r = await api.post('/integrations/bambu/request-code')
      setTestResult({ ...r.data, service: 'bambu' })
    } catch (e) {
      setTestResult({
        success: false, service: 'bambu',
        message: e.response?.data?.detail || e.message,
      })
    } finally {
      setVerifying(false)
    }
  }

  if (loading) return <div className="text-gray-500">Lade...</div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integrationen</h1>
        <p className="text-sm text-gray-500 mt-1">
          Zugangsdaten für externe Dienste (Tuya Smart Plugs, Bambu Cloud)
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

      {/* Tuya Smart Plugs */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Tuya Smart Plugs</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.tuya_enabled || false}
              onChange={(e) => setForm({ ...form, tuya_enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">Aktiviert</span>
          </label>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Für Stromverbrauchsmessung via Tuya Cloud API. Account auf{' '}
          <a href="https://iot.tuya.com" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
            iot.tuya.com
          </a>{' '}
          erforderlich.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">Access ID</label>
            <input
              className="input"
              placeholder="z.B. 4vpjhxkuh5ghfsf3r9gt"
              value={form.tuya_access_id || ''}
              onChange={(e) => setForm({ ...form, tuya_access_id: e.target.value })}
            />
          </div>

          <div>
            <label className="label">
              Access Secret
              {data?.tuya_access_secret_set && (
                <span className="text-xs text-gray-500 ml-2">(aktuell gesetzt)</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                className="input pr-10"
                placeholder={
                  data?.tuya_access_secret_set
                    ? '••••••••• (leer lassen, um nicht zu ändern)'
                    : 'Access Secret eingeben'
                }
                value={form.tuya_access_secret || ''}
                onChange={(e) => setForm({ ...form, tuya_access_secret: e.target.value })}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">API-Endpoint</label>
            <select
              className="input"
              value={form.tuya_api_endpoint || ''}
              onChange={(e) => setForm({ ...form, tuya_api_endpoint: e.target.value })}
            >
              <option value="https://openapi.tuyaeu.com">Europa (openapi.tuyaeu.com)</option>
              <option value="https://openapi.tuyaus.com">USA (openapi.tuyaus.com)</option>
              <option value="https://openapi.tuyacn.com">China (openapi.tuyacn.com)</option>
              <option value="https://openapi.tuyain.com">Indien (openapi.tuyain.com)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Im Tuya-Portal unter "Cloud → Development → Project Overview" siehst du dein Data Center.
            </p>
          </div>
        </div>

        {testResult && testResult.service === 'tuya' && (
          <div
            className={`mt-4 p-3 rounded-md text-sm flex items-start gap-2 ${
              testResult.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Speichert...' : 'Speichern'}
          </button>
          <button
            onClick={testTuya}
            disabled={testing || !data?.tuya_enabled}
            className="btn-secondary disabled:opacity-50"
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
        </div>
      </div>

      {/* Bambu Cloud */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Bambu Lab Cloud</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.bambu_enabled || false}
              onChange={(e) => setForm({ ...form, bambu_enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">Aktiviert</span>
          </label>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Für die Cloud-Verbindung zu Bambu-Druckern (Alternative zum LAN-Modus).
          Vorteil: Drucker werden auch erreicht wenn du nicht im lokalen Netzwerk bist.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">Bambu Account E-Mail</label>
            <input
              type="email"
              className="input"
              placeholder="deine@email.de"
              value={form.bambu_cloud_email || ''}
              onChange={(e) => setForm({ ...form, bambu_cloud_email: e.target.value })}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="label">
              Passwort
              {data?.bambu_cloud_password_set && (
                <span className="text-xs text-gray-500 ml-2">(aktuell gesetzt)</span>
              )}
            </label>
            <input
              type="password"
              className="input"
              placeholder={
                data?.bambu_cloud_password_set
                  ? '••••••••• (leer lassen, um nicht zu ändern)'
                  : 'Bambu Cloud Passwort'
              }
              value={form.bambu_cloud_password || ''}
              onChange={(e) => setForm({ ...form, bambu_cloud_password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 mt-4">
          <p>
            ℹ️ Die Account-Daten werden für ALLE Drucker im Cloud-Modus verwendet.
            Jeder Drucker muss bei der Drucker-Verwaltung den "Cloud-Modus" wählen,
            damit diese Daten zum Einsatz kommen.
          </p>
          <p className="mt-2">
            <strong>Erstmalige Einrichtung:</strong> Email + Passwort eingeben, speichern,
            dann "Verbindung testen" klicken. Bambu schickt einen Code per Email den du
            unten eingibst. Danach speichert PrintFarm den Token und der Login bleibt bestehen.
          </p>
        </div>

        {testResult && testResult.service === 'bambu' && (
          <div
            className={`mt-4 p-3 rounded-md text-sm flex items-start gap-2 ${
              testResult.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : needsCode
                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : needsCode ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {needsCode && (
          <div className="mt-4 p-4 border-2 border-blue-300 bg-blue-50 rounded-md">
            <h3 className="font-semibold text-blue-900 mb-2">
              📧 Verifizierungscode eingeben
            </h3>
            <p className="text-sm text-blue-800 mb-3">
              Bambu hat einen 6-stelligen Code per Email an{' '}
              <strong>{data?.bambu_cloud_email}</strong> geschickt.
              Bitte hier eingeben:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 font-mono text-center text-lg tracking-widest"
                placeholder="123456"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submitVerifyCode()}
                autoFocus
              />
              <button
                onClick={submitVerifyCode}
                disabled={verifying || verifyCode.length < 4}
                className="btn-primary disabled:opacity-50"
              >
                {verifying ? 'Prüfe...' : 'Bestätigen'}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <button
                onClick={requestNewCode}
                disabled={verifying}
                className="text-blue-700 hover:underline disabled:opacity-50"
              >
                ↻ Neuen Code anfordern
              </button>
              <button
                onClick={() => { setNeedsCode(false); setVerifyCode(''); setTestResult(null) }}
                className="text-gray-500 hover:underline"
              >
                Abbrechen
              </button>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              💡 Der Code ist meist 5-10 Minuten gültig. Nach erfolgreicher Verifizierung
              wird der Access-Token gespeichert und du musst das nicht jedes Mal wiederholen.
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Speichert...' : 'Speichern'}
          </button>
          <button
            onClick={testBambu}
            disabled={testing || !data?.bambu_enabled}
            className="btn-secondary disabled:opacity-50"
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        💡 Hinweis: Die hier eingetragenen Werte werden in der Datenbank gespeichert und
        überschreiben die Werte aus der .env-Datei. Änderungen werden sofort wirksam,
        kein Container-Restart nötig.
      </div>
    </div>
  )
}
