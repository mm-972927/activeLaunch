import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AgentDashboard from './pages/AgentDashboard'
import CallRoom from './pages/CallRoom'
import JoinRoom from './pages/JoinRoom'
import AdminDashboard from './pages/AdminDashboard'

function PrivateRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!token || !user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join/:sessionId" element={<JoinRoom />} />
        <Route path="/dashboard" element={
          <PrivateRoute><AgentDashboard /></PrivateRoute>
        } />
        <Route path="/call/:sessionId" element={
          <PrivateRoute><CallRoom /></PrivateRoute>
        } />
        <Route path="/admin" element={
          <PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>
        } />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
