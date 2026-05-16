import { useEffect, useState } from 'react'
import { Calculator, Zap, Package, Clock, Wrench, Plus, X } from 'lucide-react'
import api from '../services/api'

export default function Calc() {
  const [printers, setPrinters] = useState([])
  const [filaments, setFilaments] = useState([])
  const [vatRate, setVatRate] = useState(19)  // aus Firmendaten
  const [form, setForm] = useState({
    printer_id: '',
    duration_hours: 5,
    quantity: 1,
    actual_kwh: '',
  })
  // Multi-Filament Liste: jede Zeile = { filament_id, grams }
  const [filamentRows, setFilamentRows] = useState([{ filament_id: '', grams: 100 }])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/printers').then((r) => {
      setPrinters(r.data)
      if (r.data.length > 0) setForm((f) => ({ ...f, printer_id: r.data[0].id }))
    })
    api.get('/filaments').then((r) => setFilaments(r.data))
    api.get('/company').then((r) => {
      const v = r.data?.default_vat_rate
      if (v !== null && v !== undefined && !isNaN(v)) setVatRate(Number(v))
    }).catch(() => {})
  }, [])

  const addRow = () => setFilamentRows([...filamentRows, { filament_id: '', grams: 0 }])
  const removeRow = (idx) => setFilamentRows(filamentRows.filter((_, i) => i !== idx))
  const updateRow = (idx, field, value) => {
    const next = [...filamentRows]
    next[idx] = { ...next[idx], [field]: value }
    setFilamentRows(next)
  }

  const totalGrams = filamentRows.reduce((sum, r) => sum + (parseFloat(r.grams) || 0), 0)

  const calculate = async (e) => {
    e?.preventDefault()
    if (!form.printer_id) return
    setError('')
    setLoading(true)
    try {
      const usedFilaments = filamentRows
        .filter((r) => r.filament_id && parseFloat(r.grams) > 0)
        .map((r) => ({ filament_id: Number(r.filament_id), grams: parseFloat(r.grams) }))

      const payload = {
        printer_id: Number(form.printer_id),
        duration_hours: Number(form.duration_hours),
        quantity: Number(form.quantity) || 1,
      }
      if (usedFilaments.length > 0) {
        payload.filaments = usedFilaments
      } else {
        // ohne Filament: nur Material-Gesamt (Material-Kosten = 0)
        payload.material_g = totalGrams
      }
      if (form.actual_kwh) payload.actual_kwh = Number(form.actual_kwh)

      const r = await api.post('/calculation/calculate', payload)
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Fehler bei der Kalkulation')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const selectedPrinter = printers.find((p) => p.id === Number(form.printer_id))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Calculator className="w-6 h-6" /> Druckkalkulation
      </h1>
      <p className="text-gray-500 mb-6">
        Berechne Kosten und Verkaufspreis – auch für Multi-Color-Drucke
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Eingabe */}
        <form onSubmit={calculate} className="card space-y-4">
          <h2 className="font-semibold">Eingabe</h2>

          <div>
            <label className="label">Drucker *</label>
            <select
              className="input"
              required
              value={form.printer_id}
              onChange={(e) => setForm({ ...form, printer_id: e.target.value })}
            >
              <option value="">— wählen —</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.hourly_rate ?? 0} €/h)
                </option>
              ))}
            </select>
            {selectedPrinter && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedPrinter.hourly_rate?.toFixed(2)} €/h · {selectedPrinter.power_price_kwh?.toFixed(2)} €/kWh · Ø {selectedPrinter.avg_power_w} W · Marge {selectedPrinter.margin_percent}%
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label flex items-center gap-1">
                <Clock className="w-3 h-3" /> Stunden *
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className="input"
                value={form.duration_hours}
                onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Stückzahl</label>
              <input
                type="number"
                min="1"
                className="input"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1">
                <Zap className="w-3 h-3" /> kWh
              </label>
              <input
                type="number"
                step="0.001"
                className="input"
                placeholder="optional"
                value={form.actual_kwh}
                onChange={(e) => setForm({ ...form, actual_kwh: e.target.value })}
              />
            </div>
          </div>

          {/* Multi-Filament Liste */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0 flex items-center gap-1">
                <Package className="w-3 h-3" /> Filamente
              </label>
              <span className="text-xs text-gray-500">
                Gesamt: <strong>{totalGrams.toFixed(1)} g</strong>
              </span>
            </div>
            <div className="space-y-2">
              {filamentRows.map((row, idx) => {
                const sel = filaments.find((f) => f.id === Number(row.filament_id))
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    {sel?.color_hex && (
                      <div
                        className="w-8 h-8 rounded-full border-2 border-gray-200 mt-1 flex-shrink-0"
                        style={{ background: sel.color_hex }}
                      />
                    )}
                    <select
                      className="input flex-1"
                      value={row.filament_id}
                      onChange={(e) => updateRow(idx, 'filament_id', e.target.value)}
                    >
                      <option value="">— Filament wählen —</option>
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.material} {f.color} ({f.manufacturer})
                          {f.purchase_price ? ` — ${(f.purchase_price / f.spool_weight * 1000).toFixed(2)} €/kg` : ' — kein Preis'}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="input w-28"
                      placeholder="Gramm"
                      value={row.grams}
                      onChange={(e) => updateRow(idx, 'grams', e.target.value)}
                    />
                    <span className="text-sm text-gray-500 mt-2">g</span>
                    {filamentRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-gray-400 hover:text-red-600 mt-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1 mt-2"
            >
              <Plus className="w-3 h-3" /> Weiteres Filament hinzufügen
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Berechne...' : 'Berechnen'}
          </button>
        </form>

        {/* Ergebnis */}
        <div className="card">
          <h2 className="font-semibold mb-4">Ergebnis</h2>
          {!result ? (
            <p className="text-gray-500 text-sm">
              Felder ausfüllen und auf "Berechnen" klicken.
            </p>
          ) : (
            <>
              {/* Filament-Detail bei Multi-Color */}
              {result.details.filaments.length > 1 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 uppercase mb-2">Material-Aufschlüsselung</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {result.details.filaments.map((f, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-1.5">
                            {f.name}
                            {!f.has_price && (
                              <span className="text-amber-600 ml-1" title="Kein Kaufpreis hinterlegt">⚠</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-gray-500">{f.grams.toFixed(1)} g</td>
                          <td className="py-1.5 text-right text-gray-500">{f.price_per_kg.toFixed(2)} €/kg</td>
                          <td className="py-1.5 text-right font-mono">{f.cost.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Per-Unit Aufschlüsselung */}
              <p className="text-xs text-gray-500 uppercase mb-2">Pro Stück</p>
              <table className="w-full text-sm mb-4">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-600" />
                      Maschinenzeit
                      <span className="text-xs text-gray-400">
                        ({result.duration_hours} h × {result.details.hourly_rate.toFixed(2)} €/h)
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">
                      {result.per_unit.machine_cost.toFixed(2)} €
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-600" />
                      Strom
                      <span className="text-xs text-gray-400">
                        ({result.details.kwh_used} kWh {result.details.power_source})
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">
                      {result.per_unit.power_cost.toFixed(2)} €
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 flex items-center gap-2">
                      <Package className="w-4 h-4 text-green-600" />
                      Material
                      <span className="text-xs text-gray-400">
                        ({result.material_g} g
                        {result.details.filaments.length > 1
                          ? ` aus ${result.details.filaments.length} Filamenten`
                          : ''})
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">
                      {result.per_unit.material_cost.toFixed(2)} €
                    </td>
                  </tr>
                  <tr className="border-b bg-gray-50">
                    <td className="py-2 font-medium">Selbstkosten pro Stück</td>
                    <td className="py-2 text-right font-mono font-medium">
                      {result.per_unit.total_cost.toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>

              {result.quantity > 1 && (
                <>
                  <p className="text-xs text-gray-500 uppercase mb-2">Gesamt ({result.quantity} Stk.)</p>
                  <table className="w-full text-sm mb-4">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">Selbstkosten gesamt</td>
                        <td className="py-2 text-right font-mono">
                          {result.total_cost_net.toFixed(2)} €
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-700">
                    Verkaufspreis (netto, inkl. {result.margin_percent}% Marge)
                  </span>
                  <span className="text-2xl font-bold text-primary-700 font-mono">
                    {result.calculated_price_net.toFixed(2)} €
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>davon Marge:</span>
                  <span>{result.margin_amount.toFixed(2)} €</span>
                </div>
                {vatRate > 0 && (
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Verkaufspreis brutto ({vatRate}% MwSt):</span>
                    <span>{(result.calculated_price_net * (1 + vatRate / 100)).toFixed(2)} €</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
