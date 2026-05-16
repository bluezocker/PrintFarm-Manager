import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Receipt, History, Package, Boxes, Users } from 'lucide-react'
import api from '../services/api'

const EXPORTS = [
  {
    key: 'jobs',
    title: 'Aufträge',
    description: 'Alle Aufträge mit Kunden, Status, Preisen, Materialdaten',
    icon: FileText,
    color: 'text-blue-600',
    filters: ['date', 'job_status'],
  },
  {
    key: 'invoices',
    title: 'Rechnungen',
    description: 'Rechnungen mit Status, Beträgen, Fälligkeit',
    icon: Receipt,
    color: 'text-purple-600',
    filters: ['date', 'invoice_status'],
  },
  {
    key: 'history',
    title: 'Druckhistorie',
    description: 'Alle Drucke mit Material, Strom, Dauer, Filament-Slots',
    icon: History,
    color: 'text-green-600',
    filters: ['date'],
  },
  {
    key: 'filaments',
    title: 'Filamente',
    description: 'Komplette Filament-Bestände mit Charge, Lagerort, Restmenge',
    icon: Package,
    color: 'text-amber-600',
    filters: [],
  },
  {
    key: 'inventory',
    title: 'Inventar',
    description: 'Ersatzteile, Werkzeuge, Verbrauchsmaterial',
    icon: Boxes,
    color: 'text-gray-600',
    filters: [],
  },
  {
    key: 'customers',
    title: 'Kunden',
    description: 'Adressbuch mit allen Kundendaten',
    icon: Users,
    color: 'text-indigo-600',
    filters: [],
  },
]

const JOB_STATUSES = ['new', 'scheduled', 'in_progress', 'printing', 'completed', 'cancelled']
const INVOICE_STATUSES = ['draft', 'sent', 'overdue', 'reminder_1', 'reminder_2', 'reminder_3', 'paid', 'cancelled']

export default function Export() {
  const [filters, setFilters] = useState({})
  const [downloading, setDownloading] = useState(null)

  const doExport = async (key, exp) => {
    setDownloading(key)
    try {
      const params = new URLSearchParams()
      if (exp.filters.includes('date')) {
        if (filters.start_date) params.append('start_date', filters.start_date)
        if (filters.end_date) params.append('end_date', filters.end_date)
      }
      if (exp.filters.includes('job_status') && filters.job_status) {
        params.append('status', filters.job_status)
      }
      if (exp.filters.includes('invoice_status') && filters.invoice_status) {
        params.append('status', filters.invoice_status)
      }

      const response = await api.get(`/export/${key}?${params}`, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Dateiname aus Content-Disposition extrahieren
      const cd = response.headers['content-disposition'] || ''
      const m = cd.match(/filename="([^"]+)"/)
      a.download = m ? m[1] : `export_${key}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Fehler beim Export: ' + (e.response?.data?.detail || e.message))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <FileSpreadsheet className="w-6 h-6" /> Daten-Export
      </h1>
      <p className="text-gray-500 mb-6">Exportiere deine Daten als CSV-Datei (Excel-kompatibel)</p>

      {/* Filter für zeitbasierte Exports */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Globale Filter</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Von Datum</label>
            <input type="date" className="input" value={filters.start_date || ''}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Bis Datum</label>
            <input type="date" className="input" value={filters.end_date || ''}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Auftragsstatus (für Aufträge)</label>
            <select className="input" value={filters.job_status || ''}
              onChange={(e) => setFilters({ ...filters, job_status: e.target.value })}>
              <option value="">— alle —</option>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rechnungsstatus</label>
            <select className="input" value={filters.invoice_status || ''}
              onChange={(e) => setFilters({ ...filters, invoice_status: e.target.value })}>
              <option value="">— alle —</option>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Filter gelten nur für Exports die sie unterstützen. Filamente, Inventar und Kunden
          werden immer komplett exportiert.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORTS.map((exp) => {
          const Icon = exp.icon
          return (
            <div key={exp.key} className="card">
              <div className="flex items-start gap-3 mb-3">
                <Icon className={`w-6 h-6 ${exp.color} flex-shrink-0`} />
                <div>
                  <h3 className="font-semibold">{exp.title}</h3>
                  <p className="text-xs text-gray-500">{exp.description}</p>
                </div>
              </div>
              <button
                onClick={() => doExport(exp.key, exp)}
                disabled={downloading === exp.key}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                {downloading === exp.key ? 'Exportiere...' : 'Als CSV herunterladen'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="card bg-blue-50 border-blue-200 mt-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Hinweise</h3>
        <ul className="list-disc list-inside text-sm text-blue-900 space-y-1">
          <li>CSV-Dateien sind mit Semikolon getrennt und UTF-8 kodiert (Excel-kompatibel)</li>
          <li>Doppelklick auf die heruntergeladene Datei öffnet sie in Excel oder LibreOffice</li>
          <li>Für Buchhaltungsprogramme: alle relevanten Felder sind enthalten</li>
          <li>Datums-Filter beziehen sich auf das Erstellungs- bzw. Rechnungsdatum</li>
        </ul>
      </div>
    </div>
  )
}
