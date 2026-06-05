import { useState } from 'react'
import { Lock, User as UserIcon, Save, Eye, EyeOff } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../services/auth'

export default function Profile() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)

    // Validierung
    if (!form.current_password) {
      setMessage({ type: 'error', text: 'Bitte aktuelles Passwort eingeben' })
      return
    }
    if (form.new_password.length < 6) {
      setMessage({ type: 'error', text: 'Neues Passwort muss mindestens 6 Zeichen lang sein' })
      return
    }
    if (form.new_password !== form.new_password_confirm) {
      setMessage({ type: 'error', text: 'Die neuen Passwörter stimmen nicht überein' })
      return
    }

    setSaving(true)
    try {
      await api.post('/auth/me/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setMessage({ type: 'success', text: 'Passwort erfolgreich geändert ✓' })
      setForm({ current_password: '', new_password: '', new_password_confirm: '' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Fehler beim Ändern des Passworts',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mein Profil</h1>
        <p className="text-sm text-gray-500 mt-1">Persönliche Einstellungen</p>
      </div>

      {/* Benutzerdaten anzeigen */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <UserIcon className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Benutzerdaten</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Benutzername</p>
            <p className="font-medium">{user?.username}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="font-medium">{user?.full_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">E-Mail</p>
            <p className="font-medium">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Rolle</p>
            <p className="font-medium">
              {user?.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}
            </p>
          </div>
        </div>
      </div>

      {/* Passwort ändern */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Passwort ändern</h2>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Aktuelles Passwort</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className="input pr-10"
                value={form.current_password}
                onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Neues Passwort</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="input pr-10"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Mindestens 6 Zeichen</p>
          </div>

          <div>
            <label className="label">Neues Passwort wiederholen</label>
            <input
              type={showNew ? 'text' : 'password'}
              className="input"
              value={form.new_password_confirm}
              onChange={(e) => setForm({ ...form, new_password_confirm: e.target.value })}
              required
              autoComplete="new-password"
            />
          </div>

          {message && (
            <div
              className={`p-3 rounded-md text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Wird gespeichert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  )
}
