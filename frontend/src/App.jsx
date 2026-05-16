import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './services/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Printers from './pages/Printers'
import PrinterDetail from './pages/PrinterDetail'
import Filaments from './pages/Filaments'
import Storage from './pages/Storage'
import Customers from './pages/Customers'
import Jobs from './pages/Jobs'
import Invoices from './pages/Invoices'
import History from './pages/History'
import Costs from './pages/Costs'
import Statistics from './pages/Statistics'
import Power from './pages/Power'
import Calc from './pages/Calc'
import Notifications from './pages/Notifications'
import Maintenance from './pages/Maintenance'
import Inventory from './pages/Inventory'
import Export from './pages/Export'
import Backup from './pages/Backup'
import Smtp from './pages/Smtp'
import Company from './pages/Company'
import Users from './pages/Users'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Lädt...</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="printers" element={<Printers />} />
        <Route path="printers/:id" element={<PrinterDetail />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="filaments" element={<Filaments />} />
        <Route path="storage" element={<Storage />} />
        <Route path="customers" element={<Customers />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="history" element={<History />} />
        <Route path="costs" element={<Costs />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="power" element={<Power />} />
        <Route path="calc" element={<Calc />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="export" element={<Export />} />
        <Route path="backup" element={<ProtectedRoute adminOnly><Backup /></ProtectedRoute>} />
        <Route path="company" element={<ProtectedRoute adminOnly><Company /></ProtectedRoute>} />
        <Route path="smtp" element={<ProtectedRoute adminOnly><Smtp /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
