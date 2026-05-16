import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'
import { useAuth } from '../services/auth'

const empty = { username: '', email: '', full_name: '', role: 'employee', password: '', is_active: true }

export default function Users() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  const load = () => api.get('/auth/users').then((r) => setUsers(r.data))
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true) }
  const openEdit = (u) => {
    setEditing(u)
    setForm({ ...empty, ...u, password: '' })
    setOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        const payload = { ...form }
        delete payload.username  // Username nicht änderbar
        if (!payload.password) delete payload.password  // Nur ändern wenn neu gesetzt
        await api.patch(`/auth/users/${editing.id}`, payload)
      } else {
        await api.post('/auth/users', form)
      }
      setOpen(false)
      load()
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const remove = async (id) => {
    if (id === currentUser.id) {
      alert('Eigenes Konto kann nicht gelöscht werden.')
      return
    }
    if (!confirm('Mitarbeiter löschen?')) return
    await api.delete(`/auth/users/${id}`)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Mitarbeiter</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Mitarbeiter anlegen
        </button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Rolle</th>
              <th className="p-3 text-left">Benutzername</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">E-Mail</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Letzter Login</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="p-3">
                  {u.role === 'admin' ? (
                    <Shield className="w-4 h-4 text-red-600" title="Administrator" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-gray-600" />
                  )}
                </td>
                <td className="p-3 font-medium">{u.username}</td>
                <td className="p-3">{u.full_name || '—'}</td>
                <td className="p-3 text-gray-600">{u.email}</td>
                <td className="p-3">
                  {u.is_active ? (
                    <span className="badge bg-green-100 text-green-800">aktiv</span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-700">deaktiviert</span>
                  )}
                </td>
                <td className="p-3 text-gray-600 text-xs">
                  {u.last_login ? new Date(u.last_login).toLocaleString('de-DE') : '—'}
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-primary-600 mr-2">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {u.id !== currentUser.id && (
                    <button onClick={() => remove(u.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Benutzername *</label>
            <input className="input" required disabled={!!editing} value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Vollständiger Name</label>
            <input className="input" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">E-Mail *</label>
            <input type="email" className="input" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Passwort {editing && <span className="text-xs text-gray-400">(leer lassen = nicht ändern)</span>}</label>
            <input type="password" className="input" required={!editing} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Rolle</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">Mitarbeiter</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {editing && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Konto aktiv
            </label>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Speichern</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
