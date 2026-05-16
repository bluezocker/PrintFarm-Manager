import { useEffect, useState } from 'react'
import { Save, Upload } from 'lucide-react'
import api from '../services/api'

export default function Company() {
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    api.get('/company').then((r) => setData(r.data))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api.put('/company', data)
      setData(r.data)
      setSavedMsg('Gespeichert ✓')
      setTimeout(() => setSavedMsg(''), 2000)
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    const r = await api.post('/company/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    setData(r.data)
  }

  const f = (k) => data?.[k] || ''
  const set = (k, v) => setData({ ...data, [k]: v })

  if (!data) return <div>Lade...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Firmendaten</h1>

      <form onSubmit={save} className="space-y-6">
        {/* Logo */}
        <div className="card">
          <h2 className="font-semibold mb-4">Firmenlogo</h2>
          <div className="flex items-center gap-4">
            {data.logo_path ? (
              <img src={`/api/company/logo?t=${Date.now()}`} alt="Logo"
                className="w-32 h-32 object-contain border rounded bg-white p-2" />
            ) : (
              <div className="w-32 h-32 border-2 border-dashed rounded flex items-center justify-center text-gray-400">
                Kein Logo
              </div>
            )}
            <label className="btn-secondary flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Logo hochladen
              <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
            </label>
          </div>
        </div>

        {/* Stammdaten */}
        <div className="card">
          <h2 className="font-semibold mb-4">Stammdaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Firmenname *</label>
              <input className="input" required value={f('name')} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="label">Inhaber</label>
              <input className="input" value={f('owner')} onChange={(e) => set('owner', e.target.value)} />
            </div>
            <div>
              <label className="label">Geschäftsführer</label>
              <input className="input" value={f('managing_director')} onChange={(e) => set('managing_director', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Gewerbeart</label>
              <input className="input" placeholder="z.B. 3D-Druck Dienstleistungen" value={f('business_type')}
                onChange={(e) => set('business_type', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Adresse */}
        <div className="card">
          <h2 className="font-semibold mb-4">Adresse</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Straße und Hausnummer</label>
              <input className="input" value={f('street')} onChange={(e) => set('street', e.target.value)} />
            </div>
            <div>
              <label className="label">PLZ</label>
              <input className="input" value={f('zip_code')} onChange={(e) => set('zip_code', e.target.value)} />
            </div>
            <div>
              <label className="label">Ort</label>
              <input className="input" value={f('city')} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Land</label>
              <input className="input" value={f('country')} onChange={(e) => set('country', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Kontakt */}
        <div className="card">
          <h2 className="font-semibold mb-4">Kontakt</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Telefon</label>
              <input className="input" value={f('phone')} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input type="email" className="input" value={f('email')} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Webseite</label>
              <input className="input" placeholder="https://..." value={f('website')}
                onChange={(e) => set('website', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Steuerdaten */}
        <div className="card">
          <h2 className="font-semibold mb-4">Steuerdaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Steuernummer</label>
              <input className="input" value={f('tax_number')} onChange={(e) => set('tax_number', e.target.value)} />
            </div>
            <div>
              <label className="label">USt-IdNr.</label>
              <input className="input" value={f('vat_id')} onChange={(e) => set('vat_id', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Handelsregister</label>
              <input className="input" placeholder="HRB 12345 Amtsgericht XY" value={f('trade_register')}
                onChange={(e) => set('trade_register', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Bankverbindung */}
        <div className="card">
          <h2 className="font-semibold mb-4">Bankverbindung</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Bank</label>
              <input className="input" value={f('bank_name')} onChange={(e) => set('bank_name', e.target.value)} />
            </div>
            <div>
              <label className="label">IBAN</label>
              <input className="input font-mono" value={f('iban')} onChange={(e) => set('iban', e.target.value)} />
            </div>
            <div>
              <label className="label">BIC</label>
              <input className="input font-mono" value={f('bic')} onChange={(e) => set('bic', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <label className="label">Interne Notizen</label>
          <textarea className="input" rows="3" value={f('notes')} onChange={(e) => set('notes', e.target.value)} />
        </div>

        {/* Rechnungs-Einstellungen */}
        <div className="card">
          <h2 className="font-semibold mb-4">Rechnungseinstellungen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Rechnungsnummer-Prefix</label>
              <input className="input" value={f('invoice_number_prefix')}
                onChange={(e) => set('invoice_number_prefix', e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">z.B. "RE-" oder "RNG-"</p>
            </div>
            <div>
              <label className="label">Nummern-Muster</label>
              <input className="input" value={f('invoice_number_pattern')}
                onChange={(e) => set('invoice_number_pattern', e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">{`{prefix}{year}-{seq:04d} → RE-2026-0001`}</p>
            </div>
            <div>
              <label className="label">Nächste laufende Nummer</label>
              <input type="number" min="1" className="input" value={f('invoice_next_seq')}
                onChange={(e) => set('invoice_next_seq', parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">Standard-MwSt (%)</label>
              <input type="number" step="0.1" min="0" className="input" value={f('default_vat_rate')}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  set('default_vat_rate', isNaN(v) ? 0 : v)
                }} />
            </div>
            <div>
              <label className="label">Standard-Zahlungsziel (Tage)</label>
              <input type="number" min="0" className="input" value={f('default_payment_terms_days')}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  set('default_payment_terms_days', isNaN(v) ? 0 : v)
                }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">Skonto (%)</label>
                <input type="number" step="0.1" className="input" value={f('default_skonto_percent')}
                  onChange={(e) => set('default_skonto_percent', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Skonto-Frist (Tage)</label>
                <input type="number" min="0" className="input" value={f('default_skonto_days')}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    set('default_skonto_days', isNaN(v) ? 0 : v)
                  }} />
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Footer-Text auf Rechnungen</label>
              <textarea className="input" rows="2"
                placeholder="z.B. 'Kleinunternehmer gem. §19 UStG' oder zusätzliche Hinweise"
                value={f('invoice_footer_text')}
                onChange={(e) => set('invoice_footer_text', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Speichert...' : 'Speichern'}
          </button>
          {savedMsg && <span className="text-green-600 text-sm">{savedMsg}</span>}
        </div>
      </form>
    </div>
  )
}
