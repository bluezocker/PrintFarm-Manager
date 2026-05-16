import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: 'md:max-w-md',
    md: 'md:max-w-lg',
    lg: 'md:max-w-2xl',
    xl: 'md:max-w-4xl',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4"
      onClick={onClose}
    >
      <div
        className={`
          bg-white shadow-xl w-full
          rounded-t-2xl md:rounded-lg
          ${sizes[size]}
          max-h-[95vh] md:max-h-[90vh]
          overflow-y-auto
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag-Indikator nur auf Mobile */}
        <div className="md:hidden flex justify-center pt-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 -mr-2"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  )
}
