import { useEffect, useState } from 'react'
import { Plus, FileText, Edit2, Trash2, Download, Mail, CheckCircle, Send, AlertCircle, X } from 'lucide-react'
import api from '../services/api'
import Modal from '../components/Modal'

const STATUS = [
  { value: 'draft',       label: 'Entwurf',     color: 'bg-gray-100 text-gray-800' },
  { value: 'sent',        label: 'Versendet',   color: 'bg-blue-100 text-blue-800' },
  { value: 'overdue',     label: 'Überfällig',  color: 'bg-amber-100 text-amber-800' },
  { value: 'reminder_1',  label: '1. Mahnung',  color: 'bg-orange-100 text-orange-800' },
  { value: 'reminder_2',  label: '2. Mahnung',  color: 'bg-red-100 text-red-800' },
  { value: 'reminder_3',  label: '3. Mahnung',  color: 'bg-red-200 text-red-900' },
  { value: 'paid',        label: 'Bezahlt',     color: 'bg-green-100 text-green-800' },
  { value: 'cancelled',   label: 'Storniert',   color: 'bg-gray-100 text-gray-500' },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function Invoices() {
  const [list, setList] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [defaultVat, setDefaultVat] = useState(19)
  const [filterStatus, setFilterStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [emailModal, setEmailModal] = useState(null)
  const [emailForm, setEmailForm] = useState({ recipient: '', subject: '', body: '' })

  const makeEmptyItem = () => ({
    description: '', quantity: 1, unit: 'Stk', unit_price_net: 0,
    vat_rate: defaultVat, discount_percent: 0,
  })

  const load = async () => {
    const url = filterStatus ? `/invoices?status=${filterStatus}` : '/invoices'
    const [inv, cust, jb] = await Promise.all([
      api.get(url),
      api.get('/customers'),
      api.get('/jobs'),
    ])
    setList(inv.data)
    setCustomers(cust.data)
    setJobs(jb.data)
    try {
      const co = await api.get('/company')
      const v = co.data?.default_vat_rate
      if (v !== null && v !== undefined && !isNaN(v)) setDefaultVat(Number(v))
    } catch {}
  }

  useEffect(() => { load() }, [filterStatus])

  const openNew = () => {
    setEditing(null)
    setForm({
      customer_id: '',
      job_id: '',
      invoice_date: today(),
      service_date: today(),
      payment_terms_days: 14,
      skonto_percent: 0,
      skonto_days: 7,
      payment_method: 'Überweisung',
      intro_text: '',
      closing_text: 'Vielen Dank für Ihren Auftrag!',
      items: [{ ...makeEmptyItem(), position: 1 }],
    })
    setOpen(true)
  }

  const openEdit = async (inv) => {
    const full = await api.get(`/invoices/${inv.id}`)
    setEditing(full.data)
    setForm({
      ...full.data,
      job_id: full.data.job_id || '',
      items: full.data.items.length > 0 ? full.data.items : [{ ...makeEmptyItem(), position: 1 }],
    })
    setOpen(true)
  }

  const customerName = (c) => {
    if (!c) return '—'
    return c.customer_type === 'business' ? c.company_name : `${c.first_name || ''} ${c.last_name || ''}`.trim()
  }

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { ...makeEmptyItem(), position: form.items.length + 1 }] })
  }

  const removeItem = (idx) => {
    const items = form.items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, position: i + 1 }))
    setForm({ ...form, items })
  }

  const updateItem = (idx, field, value) => {
    const items = [...form.items]
    items[idx] = { ...items[idx], [field]: value }
    setForm({ ...form, items })
  }

  const calcItem = (it) => {
    const net = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price_net) || 0) * (1 - (parseFloat(it.discount_percent) || 0) / 100)
    const vat = net * (parseFloat(it.vat_rate) || 0) / 100
    return { net, vat, gross: net + vat }
  }

  const totals = form ? form.items.reduce(
    (acc, it) => {
      const { net, vat } = calcItem(it)
      acc.net += net
      acc.vat += vat
      return acc
    },
    { net: 0, vat: 0 },
  ) : { net: 0, vat: 0 }

  const save = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      customer_id: Number(form.customer_id),
      job_id: form.job_id ? Number(form.job_id) : null,
      items: form.items.map((it, idx) => ({
        position: idx + 1,
        description: it.description,
        quantity: parseFloat(it.quantity) || 0,
        unit: it.unit || 'Stk',
        unit_price_net: parseFloat(it.unit_price_net) || 0,
        vat_rate: parseFloat(it.vat_rate) || 0,
        discount_percent: parseFloat(it.discount_percent) || 0,
      })),
    }
    try {
      if (editing) await api.patch(`/invoices/${editing.id}`, payload)
      else await api.post('/invoices', payload)
      setOpen(false)
      load()
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const remove = async (inv) => {
    if (!confirm(`Rechnung ${inv.invoice_number} wirklich löschen?`)) return
    await api.delete(`/invoices/${inv.id}`)
    load()
  }

  const downloadPdf = (inv) => {
    const token = localStorage.getItem('token')
    // Auth kann nicht via header bei window.open, also fetchen und blob downloaden
    fetch(`/api/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${inv.invoice_number}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  const openEmail = (inv) => {
    setEmailModal(inv)
    setEmailForm({
      recipient: inv.customer?.email || '',
      subject: `Rechnung ${inv.invoice_number}`,
      body: '',
    })
  }

  const sendEmail = async () => {
    try {
      const params = new URLSearchParams()
      if (emailForm.recipient) params.append('recipient', emailForm.recipient)
      if (emailForm.subject) params.append('subject', emailForm.subject)
      if (emailForm.body) params.append('body', emailForm.body)
      await api.post(`/invoices/${emailModal.id}/send-email?${params}`)
      setEmailModal(null)
      load()
      alert('E-Mail versendet!')
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.detail || e.message))
    }
  }

  const markPaid = async (inv) => {
    if (!confirm(`Rechnung ${inv.invoice_number} als bezahlt markieren?`)) return
    await api.post(`/invoices/${inv.id}/mark-paid`)
    load()
  }

  const createReminder = async (inv) => {
    const fee = prompt('Mahngebühr in € (0 wenn keine):', '0')
    if (fee === null) return
    await api.post(`/invoices/${inv.id}/reminder?reminder_fee=${parseFloat(fee) || 0}`)
    load()
  }

  const statusBadge = (s) => {
    const st = STATUS.find((x) => x.value === s) || STATUS[0]
    return <span className={`badge ${st.color}`}>{st.label}</span>
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Rechnungen</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Rechnung erstellen
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterStatus('')} className={`px-3 py-1 rounded-md text-sm ${!filterStatus ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
          Alle
        </button>
        {STATUS.map((s) => (
          <button key={s.value} onClick={() => setFilterStatus(s.value)}
            className={`px-3 py-1 rounded-md text-sm ${filterStatus === s.value ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Nummer</th>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Kunde</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Fällig</th>
              <th className="p-3 text-right">Betrag</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono">{inv.invoice_number}</td>
                <td className="p-3 text-gray-600">{inv.invoice_date}</td>
                <td className="p-3">{customerName(inv.customer)}</td>
                <td className="p-3">{statusBadge(inv.status)}</td>
                <td className="p-3 text-gray-600 text-xs">{inv.due_date || '—'}</td>
                <td className="p-3 text-right font-mono font-medium">{inv.total_gross?.toFixed(2)} €</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => downloadPdf(inv)} title="PDF herunterladen" className="text-gray-400 hover:text-primary-600 mx-1">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEmail(inv)} title="Per E-Mail senden" className="text-gray-400 hover:text-primary-600 mx-1">
                    <Mail className="w-4 h-4" />
                  </button>
                  {inv.status !== 'paid' && (
                    <button onClick={() => markPaid(inv)} title="Als bezahlt markieren" className="text-gray-400 hover:text-green-600 mx-1">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  {['sent', 'overdue', 'reminder_1', 'reminder_2'].includes(inv.status) && (
                    <button onClick={() => createReminder(inv)} title="Mahnung erstellen" className="text-gray-400 hover:text-orange-600 mx-1">
                      <AlertCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => openEdit(inv)} title="Bearbeiten" className="text-gray-400 hover:text-primary-600 mx-1">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(inv)} title="Löschen" className="text-gray-400 hover:text-red-600 mx-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="7" className="p-8 text-center text-gray-500">Keine Rechnungen</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rechnungs-Editor */}
      {form && (
        <Modal open={open} onClose={() => setOpen(false)}
          title={editing ? `Rechnung ${editing.invoice_number} bearbeiten` : 'Neue Rechnung'} size="xl">
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Kunde *</label>
                <select className="input" required disabled={!!editing}
                  value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">— Kunde wählen —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{customerName(c)} {c.email ? `(${c.email})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Auftrag (optional)</label>
                <select className="input" value={form.job_id || ''} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
                  <option value="">— keiner —</option>
                  {jobs.filter((j) => !form.customer_id || j.customer_id === Number(form.customer_id))
                    .map((j) => <option key={j.id} value={j.id}>{j.order_number} - {j.title}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Rechnungsdatum *</label>
                <input type="date" className="input" required
                  value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Leistungsdatum</label>
                <input type="date" className="input"
                  value={form.service_date || ''} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Zahlungsziel (Tage)</label>
                <input type="number" min="0" className="input"
                  value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} />
              </div>
              <div>
                <label className="label">Zahlungsweise</label>
                <input className="input" value={form.payment_method || ''}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
              </div>
              <div>
                <label className="label">Skonto (%)</label>
                <input type="number" step="0.1" className="input"
                  value={form.skonto_percent} onChange={(e) => setForm({ ...form, skonto_percent: e.target.value })} />
              </div>
              <div>
                <label className="label">Skonto innerhalb (Tage)</label>
                <input type="number" className="input"
                  value={form.skonto_days} onChange={(e) => setForm({ ...form, skonto_days: e.target.value })} />
              </div>
            </div>

            {/* Positionen */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">Positionen</h3>
                <button type="button" onClick={addItem} className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Position
                </button>
              </div>
              <div className="space-y-3">
                {form.items.map((it, idx) => {
                  const c = calcItem(it)
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-gray-50 p-3 rounded">
                      <div className="col-span-12 md:col-span-5">
                        <label className="label text-xs">Beschreibung</label>
                        <textarea rows="2" className="input text-sm"
                          value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <label className="label text-xs">Menge</label>
                        <input type="number" step="0.01" className="input text-sm"
                          value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <label className="label text-xs">Einheit</label>
                        <input className="input text-sm" value={it.unit}
                          onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="label text-xs">Einzelpreis</label>
                        <input type="number" step="0.01" className="input text-sm"
                          value={it.unit_price_net} onChange={(e) => updateItem(idx, 'unit_price_net', e.target.value)} />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <label className="label text-xs">MwSt%</label>
                        <input type="number" step="0.1" className="input text-sm"
                          value={it.vat_rate} onChange={(e) => updateItem(idx, 'vat_rate', e.target.value)} />
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <label className="label text-xs">Rabatt%</label>
                        <input type="number" step="0.1" className="input text-sm"
                          value={it.discount_percent} onChange={(e) => updateItem(idx, 'discount_percent', e.target.value)} />
                      </div>
                      <div className="col-span-6 md:col-span-1 flex flex-col items-end justify-between">
                        <span className="text-xs text-gray-500 mt-5">{c.net.toFixed(2)} €</span>
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-right text-sm space-y-1">
                <div>Netto: <span className="font-mono">{totals.net.toFixed(2)} €</span></div>
                <div>MwSt: <span className="font-mono">{totals.vat.toFixed(2)} €</span></div>
                <div className="font-bold text-base">Gesamt: <span className="font-mono">{(totals.net + totals.vat).toFixed(2)} €</span></div>
              </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-1 gap-3">
              <div>
                <label className="label">Einleitungstext (optional)</label>
                <textarea rows="2" className="input"
                  placeholder="Standard: 'Sehr geehrte... vielen Dank für Ihren Auftrag.'"
                  value={form.intro_text || ''} onChange={(e) => setForm({ ...form, intro_text: e.target.value })} />
              </div>
              <div>
                <label className="label">Schlusstext (optional)</label>
                <textarea rows="2" className="input"
                  value={form.closing_text || ''} onChange={(e) => setForm({ ...form, closing_text: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Abbrechen</button>
              <button type="submit" className="btn-primary">Speichern</button>
            </div>
          </form>
        </Modal>
      )}

      {/* E-Mail-Dialog */}
      <Modal open={!!emailModal} onClose={() => setEmailModal(null)} title="Rechnung per E-Mail senden">
        <div className="space-y-4">
          <div>
            <label className="label">An *</label>
            <input type="email" className="input" required
              value={emailForm.recipient} onChange={(e) => setEmailForm({ ...emailForm, recipient: e.target.value })} />
          </div>
          <div>
            <label className="label">Betreff</label>
            <input className="input"
              value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
          </div>
          <div>
            <label className="label">Nachricht (optional, sonst Standard)</label>
            <textarea rows="5" className="input"
              value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} />
          </div>
          <p className="text-xs text-gray-500">PDF wird automatisch angehängt.</p>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button onClick={() => setEmailModal(null)} className="btn-secondary">Abbrechen</button>
            <button onClick={sendEmail} className="btn-primary flex items-center gap-2">
              <Send className="w-4 h-4" /> Senden
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
