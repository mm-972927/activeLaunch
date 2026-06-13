import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import SessionHistory from '../components/SessionHistory'

export default function AgentDashboard() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')

  async function load() {
    try {
      const { data } = await client.get('/sessions')
      setSessions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createSession(e) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    try {
      const { data } = await client.post('/sessions', { title: title.trim() })
      setSessions([data, ...sessions])
      setTitle('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  function copyInvite(session) {
    const url = `${window.location.origin}/join/${session.id}?token=${session.invite_token}`
    navigator.clipboard.writeText(url)
    setCopyMsg(session.id)
    setTimeout(() => setCopyMsg(''), 2000)
  }

  function logout() {
    localStorage.clear()
    navigate('/login')
  }

  function statusBadge(status) {
    const map = { waiting: 'bg-yellow-900/60 text-yellow-300', active: 'bg-green-900/60 text-green-300', ended: 'bg-gray-700 text-gray-400' }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || ''}`}>{status}</span>
  }

  function formatDuration(secs) {
    if (!secs) return '-'
    const m = Math.floor(secs / 60), s = secs % 60
    return `${m}m ${s}s`
  }

  const active = sessions.filter(s => s.status !== 'ended')
  const past = sessions.filter(s => s.status === 'ended')

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">A</div>
          <span className="font-semibold text-white">AtomQuest</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.full_name}</span>
          {user.role === 'admin' && (
            <Link to="/admin" className="text-sm text-indigo-400 hover:text-indigo-300">Admin</Link>
          )}
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-300">Sign out</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Support Sessions</h1>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Session
          </button>
        </div>

        {showCreate && (
          <div className="card mb-6">
            <h3 className="text-base font-medium mb-4">Create session</h3>
            <form onSubmit={createSession} className="flex gap-3">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title (e.g. Customer issue #1234)" className="input flex-1" autoFocus />
              <button type="submit" disabled={creating} className="btn-primary whitespace-nowrap">{creating ? 'Creating...' : 'Create'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading sessions...</div>
        ) : (
          <>
            {active.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Active & Waiting</h2>
                <div className="space-y-3">
                  {active.map(s => (
                    <div key={s.id} className="card flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">{s.title}</p>
                          {statusBadge(s.status)}
                        </div>
                        <p className="text-sm text-gray-500">Created {new Date(s.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => copyInvite(s)} className="btn-secondary text-sm">
                          {copyMsg === s.id ? 'Copied!' : 'Copy invite'}
                        </button>
                        <button onClick={() => navigate(`/call/${s.id}`)} className="btn-primary text-sm">
                          Join Call
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
                <div className="space-y-3">
                  {past.map(s => (
                    <div key={s.id} className="card flex items-center gap-4 opacity-75">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">{s.title}</p>
                          {statusBadge(s.status)}
                        </div>
                        <p className="text-sm text-gray-500">
                          {new Date(s.created_at).toLocaleString()} · Duration: {formatDuration(s.duration_seconds)}
                        </p>
                      </div>
                      <SessionHistory sessionId={s.id} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sessions.length === 0 && (
              <div className="text-center py-20 text-gray-600">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                <p className="text-lg">No sessions yet</p>
                <p className="text-sm mt-1">Create a session to get started</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
