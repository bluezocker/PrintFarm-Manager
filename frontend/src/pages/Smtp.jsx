import { useEffect, useState } from 'react'
import { Save, Send, Mail } from 'lucide-react'
import api from '../services/api'

export default function Smtp() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [testTo, setTestTo] = useState('')

  useEffect(() => {
    api.get('/smtp').then((r) => setForm(r.data))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const r = await api.put('/smtp', form)
      setForm({ ...r.data, password: '' })
      setMsg('Gespeichert ✓')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg('Fehler: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testTo) {
      alert('Bitte Test-Empfänger angeben')
      return
    }
    try {
      await api.post('/smtp/test', { to: testTo })
      alert(`Testmail an ${testTo} gesendet!`)
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  if (!form) return <div>Lade...</div>

  const f = (k) => form[k] ?? ''
  const set = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Mail className="w-6 h-6" /> E-Mail-Server (SMTP)
      </h1>
      <p className="text-gray-500 mb-6">SMTP-Konfiguration für Mailcow oder anderen Mailserver</p>

      <form onSubmit={save} className="space-y-6 max-w-2xl">
        <div className="card">
          <label className="flex items-center gap-3 mb-4">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => set('enabled', e.target.checked)} className="w-4 h-4" />
            <span className="font-medium">SMTP-Versand aktivieren</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Server / Host *</label>
              <input className="input" placeholder="mail.deinedomain.de" required={form.enabled}
                value={f('host')} onChange={(e) => set('host', e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">Bei Mailcow: dein Mailcow-Hostname</p>
            </div>
            <div>
              <label className="label">Port</label>
              <input type="number" className="input" value={f('port')}
                onChange={(e) => set('port', parseInt(e.target.value) || 587)} />
            </div>
            <div className="flex flex-col gap-2 mt-6">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.use_tls}
                  onChange={(e) => set('use_tls', e.target.checked)} />
                <span className="text-sm">STARTTLS (Port 587)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.use_ssl}
                  onChange={(e) => set('use_ssl', e.target.checked)} />
                <span className="text-sm">SSL/TLS direkt (Port 465)</span>
              </label>
            </div>
            <div>
              <label className="label">Benutzername</label>
              <input className="input" placeholder="benachrichtigung@deinedomain.de"
                value={f('username')} onChange={(e) => set('username', e.target.value)} />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input type="password" className="input"
                placeholder={form.id ? 'leer = nicht ändern' : ''}
                value={f('password')} onChange={(e) => set('password', e.target.value)} />
            </div>
            <div>
              <label className="label">Absender-E-Mail *</label>
              <input type="email" className="input" required={form.enabled}
                placeholder="benachrichtigung@deinedomain.de"
                value={f('from_email')} onChange={(e) => set('from_email', e.target.value)} />
            </div>
            <div>
              <label className="label">Absender-Name</label>
              <input className="input" placeholder="Wird aus Firmendaten übernommen"
                value={f('from_name')} onChange={(e) => set('from_name', e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">
                Leer lassen, um den Firmennamen aus den Firmendaten zu verwenden
              </p>
            </div>
            <div className="col-span-2">
              <label className="label">Reply-To (optional)</label>
              <input type="email" className="input" placeholder="info@deinedomain.de"
                value={f('reply_to')} onChange={(e) => set('reply_to', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Speichert...' : 'Speichern'}
          </button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>

        <div className="card bg-gray-50">
          <h2 className="font-semibold mb-2">Verbindung testen</h2>
          <p className="text-xs text-gray-500 mb-3">
            Sendet eine Testmail an die angegebene Adresse. Erst Einstellungen speichern!
          </p>
          <div className="flex gap-2">
            <input type="email" className="input flex-1" placeholder="test@beispiel.de"
              value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button type="button" onClick={sendTest} className="btn-secondary flex items-center gap-2">
              <Send className="w-4 h-4" /> Testmail senden
            </button>
          </div>
        </div>
      </form>

      <div className="card bg-blue-50 border-blue-200 mt-6 max-w-2xl">
        <h2 className="font-semibold mb-2 text-blue-900">📘 Mailcow-Setup</h2>
        <ol className="list-decimal list-inside text-sm space-y-1 text-blue-900">
          <li>Mailbox in Mailcow erstellen (z.B. <code>printfarm@deinedomain.de</code>)</li>
          <li>Server: dein Mailcow-Hostname (z.B. <code>mail.deinedomain.de</code>)</li>
          <li>Port 587 mit STARTTLS - ist Standard bei Mailcow</li>
          <li>Username = vollständige Mailadresse</li>
          <li>Passwort = Mailbox-Passwort aus Mailcow</li>
        </ol>
      </div>
    </div>
  )
}
