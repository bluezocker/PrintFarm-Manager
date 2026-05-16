import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp } from 'lucide-react'
import api from '../services/api'

export default function Costs() {
  const [days, setDays] = useState(30)
  const [entries, setEntries] = useState([])
  const [costData, setCostData] = useState({})  // {history_id: result}
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/history?days=${days}`).then(async (r) => {
      setEntries(r.data)
      // Parallel Kosten für jeden Eintrag holen
      const results = {}
      await Promise.all(r.data.map(async (e) => {
        try {
          const c = await api.get(`/calculation/history/${e.id}/cost`)
          results[e.id] = c.data
        } catch (err) {
          // Eintrag hat keine Drucker-Kalkulationsdaten - überspringen
        }
      }))
      setCostData(results)
      setLoading(false)
    })
  }, [days])

  // Summen über alle berechenbaren Einträge
  const computed = Object.values(costData)
  const sumMachine = computed.reduce((s, c) => s + c.per_unit.machine_cost, 0)
  const sumPower = computed.reduce((s, c) => s + c.per_unit.power_cost, 0)
  const sumMaterial = computed.reduce((s, c) => s + c.per_unit.material_cost, 0)
  const sumTotal = sumMachine + sumPower + sumMaterial
  const sumSale = computed.reduce((s, c) => s + c.calculated_price_net, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <DollarSign className="w-6 h-6" /> Kosten-Übersicht
      </h1>
      <p className="text-gray-500 mb-6">Aufschlüsselung der Druckkosten der letzten {days} Tage</p>

      <select className="input max-w-xs mb-6" value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value="7">Letzte 7 Tage</option>
        <option value="30">Letzte 30 Tage</option>
        <option value="90">Letzte 90 Tage</option>
        <option value="365">Letztes Jahr</option>
      </select>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Maschinenzeit</p>
          <p className="text-2xl font-bold mt-1">{sumMachine.toFixed(2)} €</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Strom</p>
          <p className="text-2xl font-bold mt-1">{sumPower.toFixed(2)} €</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Material</p>
          <p className="text-2xl font-bold mt-1">{sumMaterial.toFixed(2)} €</p>
        </div>
        <div className="card bg-primary-50 border-primary-200">
          <p className="text-sm text-primary-700">Selbstkosten gesamt</p>
          <p className="text-2xl font-bold mt-1 text-primary-700">{sumTotal.toFixed(2)} €</p>
          <p className="text-xs text-gray-500 mt-1">Marge: +{(sumSale - sumTotal).toFixed(2)} €</p>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Job</th>
              <th className="p-3 text-right">Maschine</th>
              <th className="p-3 text-right">Strom</th>
              <th className="p-3 text-right">Material</th>
              <th className="p-3 text-right">Selbstkosten</th>
              <th className="p-3 text-right">VK-Preis</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const c = costData[e.id]
              return (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-gray-600 text-xs">
                    {e.start_time ? new Date(e.start_time).toLocaleDateString('de-DE') : '—'}
                  </td>
                  <td className="p-3 font-medium">{e.job_name}</td>
                  {c ? (
                    <>
                      <td className="p-3 text-right font-mono text-xs">{c.per_unit.machine_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono text-xs">{c.per_unit.power_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono text-xs">{c.per_unit.material_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono font-medium">{c.per_unit.total_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono text-primary-700">{c.calculated_price_net.toFixed(2)} €</td>
                    </>
                  ) : (
                    <td colSpan="5" className="p-3 text-gray-400 text-xs text-center">Daten unvollständig</td>
                  )}
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr><td colSpan="7" className="p-8 text-center text-gray-500">Keine Einträge im Zeitraum</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-center text-sm text-gray-500 mt-4">Berechne Kosten...</p>}
    </div>
  )
}
