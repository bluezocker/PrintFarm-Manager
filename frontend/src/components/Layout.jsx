import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Printer, Wrench, Package, Users, FileText, History, Building2,
  LogOut, UserCog, Zap, Calculator, Receipt, Mail, Bell,
  LayoutDashboard, MapPin, ChevronDown, ChevronRight,
  BarChart3, DollarSign, Boxes, Settings, FileSpreadsheet, Database,
  Menu, X, Plug, ListOrdered, Archive, FolderKanban,
} from 'lucide-react'
import { useAuth } from '../services/auth'

// Menü-Struktur als Baum
const menuTree = [
  { type: 'item', to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    type: 'group', id: 'printers', label: 'Drucker', icon: Printer,
    children: [
      { to: '/printers',     label: 'Übersicht',  icon: Printer },
      { to: '/maintenance',  label: 'Wartung',    icon: Wrench },
      { to: '/inventory',    label: 'Inventar',   icon: Boxes },
      { to: '/power',        label: 'Stromverbrauch', icon: Zap },
    ],
  },
  {
    type: 'group', id: 'filaments', label: 'Filamente', icon: Package,
    children: [
      { to: '/filaments', label: 'Übersicht', icon: Package },
      { to: '/storage',   label: 'Lagerorte', icon: MapPin },
    ],
  },
  {
    type: 'group', id: 'customers', label: 'Kunden & Aufträge', icon: Users,
    children: [
      { to: '/customers', label: 'Kunden',        icon: Users },
      { to: '/jobs',      label: 'Aufträge',      icon: FileText },
      { to: '/queue',     label: 'Warteschlange', icon: ListOrdered },
      { to: '/library',   label: 'Archiv',        icon: Archive },
      { to: '/projects',  label: 'Projekte',      icon: FolderKanban },
      { to: '/invoices',  label: 'Rechnungen',    icon: Receipt },
    ],
  },
  {
    type: 'group', id: 'history', label: 'Druck-Historie', icon: History,
    children: [
      { to: '/history',    label: 'Übersicht', icon: History },
      { to: '/costs',      label: 'Kosten',    icon: DollarSign },
      { to: '/statistics', label: 'Statistik', icon: BarChart3 },
    ],
  },
  { type: 'item', to: '/calc',          label: 'Kalkulator',         icon: Calculator },
  { type: 'item', to: '/notifications', label: 'Benachrichtigungen', icon: Bell },
  { type: 'item', to: '/export',        label: 'Daten-Export',       icon: FileSpreadsheet },
]

const adminItems = [
  { to: '/company',      label: 'Firmendaten',    icon: Building2 },
  { to: '/smtp',         label: 'E-Mail-Server',  icon: Mail },
  { to: '/integrations', label: 'Integrationen',  icon: Plug },
  { to: '/users',        label: 'Mitarbeiter',    icon: UserCog },
  { to: '/backup',       label: 'Backups',        icon: Database },
]

function MenuItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
          isActive
            ? 'bg-primary-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  )
}

function SubMenuItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-sm mb-1 transition-colors ${
          isActive
            ? 'bg-primary-600/20 text-primary-300 font-medium'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </NavLink>
  )
}

function MenuGroup({ group, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = group.icon
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <Icon className="w-4 h-4" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-1">
          {group.children.map((c) => <SubMenuItem key={c.to} {...c} />)}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Sidebar automatisch schließen bei Navigation auf Mobile
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Body scroll lock wenn Mobile-Menü offen
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // Gruppe automatisch öffnen wenn ein Kind aktiv ist
  const isGroupActive = (group) =>
    group.type === 'group' && group.children.some((c) => location.pathname === c.to)

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile-Topbar mit Burger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-slate-900 text-white flex items-center justify-between px-4 h-14 shadow-md">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 hover:bg-slate-800 rounded-md"
          aria-label="Menü öffnen"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Printer className="w-5 h-5" />
          PrintFarm
        </h1>
        <div className="w-10" /> {/* Spacer für Zentrierung */}
      </div>

      {/* Backdrop (nur auf Mobile sichtbar wenn offen) */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - auf Desktop immer sichtbar, auf Mobile slide-in */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 bg-slate-900 text-white flex flex-col
          transform transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Printer className="w-6 h-6" />
              PrintFarm
            </h1>
            <p className="text-xs text-slate-400 mt-1">Manager</p>
          </div>
          {/* Schließen-Button nur auf Mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 hover:bg-slate-800 rounded"
            aria-label="Menü schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <div className="px-3 mb-4">
            {menuTree.map((node, i) => {
              if (node.type === 'item') {
                return <MenuItem key={i} {...node} />
              }
              return <MenuGroup key={i} group={node} defaultOpen={isGroupActive(node)} />
            })}
          </div>

          {user?.role === 'admin' && (
            <div className="px-3 mb-4">
              <p className="text-xs text-slate-500 px-3 mb-2 uppercase flex items-center gap-1">
                <Settings className="w-3 h-3" /> Verwaltung
              </p>
              {adminItems.map((item) => <MenuItem key={item.to} {...item} />)}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <NavLink
            to="/profile"
            className="block text-sm mb-3 -mx-1 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <p className="font-medium">{user?.full_name || user?.username}</p>
            <p className="text-xs text-slate-400">
              {user?.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}
            </p>
          </NavLink>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
