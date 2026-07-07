import { Droplet, Thermometer } from 'lucide-react'

// Materialfarben-Fallback (Bambu liefert Hex ohne #)
function normalizeColor(color) {
  if (!color) return null
  if (color.startsWith('#')) return color
  // Manche Werte haben 8 Zeichen (RGBA) - erste 6 nehmen
  return `#${color.substring(0, 6)}`
}

// Ist die Farbe hell? Für Textkontrast
function isLightColor(hexColor) {
  if (!hexColor) return true
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128
}

// Feuchtigkeit-Level (1=trocken, 5=feucht)
function humidityLabel(level) {
  const l = parseInt(level)
  if (!l) return '—'
  if (l <= 2) return 'Trocken'
  if (l === 3) return 'Normal'
  return 'Feucht'
}

export default function AmsWidget({ amsUnits = [], externalTray, trayNow }) {
  if (!amsUnits.length && !externalTray) return null

  return (
    <div className="space-y-2">
      {/* AMS-Units */}
      {amsUnits.map((unit) => (
        <div key={unit.id} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between text-xs">
            <span className="font-medium">AMS-{parseInt(unit.id) + 1}</span>
            <div className="flex items-center gap-3 text-gray-500">
              <span className="flex items-center gap-1" title="Feuchtigkeit">
                <Droplet className="w-3 h-3" />
                {humidityLabel(unit.humidity)}
              </span>
              {unit.temp && (
                <span className="flex items-center gap-1" title="Temperatur">
                  <Thermometer className="w-3 h-3" />
                  {parseFloat(unit.temp).toFixed(1)}°C
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1 p-2">
            {unit.trays.map((tray) => (
              <SlotCard key={tray.id} tray={tray} active={String(trayNow) === String(tray.id)} />
            ))}
          </div>
        </div>
      ))}

      {/* Externer Slot */}
      {externalTray && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between text-xs">
            <span className="font-medium">Extern</span>
          </div>
          <div className="p-2">
            <SlotCard tray={externalTray} active={String(trayNow) === String(externalTray.id)} external />
          </div>
        </div>
      )}
    </div>
  )
}

function SlotCard({ tray, active, external }) {
  const color = normalizeColor(tray.color)
  const isLight = isLightColor(color)
  const remain = parseInt(tray.remain)
  const slotNumber = parseInt(tray.id) + 1

  if (tray.empty) {
    return (
      <div className={`border rounded p-2 text-center text-xs bg-gray-50 ${active ? 'ring-2 ring-primary-400' : ''}`}>
        <div className="w-6 h-6 mx-auto rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-[10px] font-medium mb-1">
          {slotNumber}
        </div>
        <div className="text-gray-400">leer</div>
      </div>
    )
  }

  return (
    <div className={`border rounded overflow-hidden ${active ? 'ring-2 ring-primary-400' : ''}`}>
      {/* Colored area with slot number */}
      <div
        className="p-2 text-center relative"
        style={{ backgroundColor: color || '#e5e7eb' }}
      >
        <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-[10px] font-bold ${
          isLight ? 'bg-black/20 text-black' : 'bg-white/20 text-white'
        }`}>
          {slotNumber}
        </div>
        <div className={`text-xs font-medium mt-1 ${isLight ? 'text-black' : 'text-white'}`}>
          {tray.material || '—'}
        </div>
      </div>
      {/* Remain-Bar */}
      {!isNaN(remain) && (
        <div className="bg-gray-200 h-1.5 relative">
          <div
            className="h-full bg-primary-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, remain))}%` }}
          />
        </div>
      )}
    </div>
  )
}
