import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'

function formatDuration(secs) {
  if (!secs) return '-'
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${s}s`
}

function StatusBadge({ status }) {
  const map = {
    waiting: 'bg-yellow-900/60 text-yellow-300',
    active: 'bg-green-900/60 text-green-300',
    ended: 'bg-gray-700 text-gray-400',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || ''}`}>{status}</span>
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const [liveSessions, setLiveSessions] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [tab, setTab] = useState('live')
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState(null)

  async function load() {
    try {
      const [live, all, m] = await Promise.all([
        client.get('/admin/sessions/live'),
        client.get('/admin/sessions'),
        client.get('/admin/metrics'),
      ])
      setLiveSessions(live.data)
      setAllSessions(all.data)
      setMetrics(m.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  async function forceEnd(sessionId) {
    if (!window.confirm('Force-end this session?')) return
    setEnding(sessionId)
    try {
      await client.delete(`/admin/sessions/${sessionId}`)
      await load()
    } finally {
      setEnding(null)
    }
  }

  function logout() { localStorage.clear(); navigate('/login') }

  const displayed = tab === 'live' ? liveSessions : allSessions

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">A</div>
          <span className="font-semibold">AtomQuest Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-sm text-indigo-400 hover:text-indigo-300">My Sessions</Link>
          <span className="text-sm text-gray-400">{user.full_name}</span>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-300">Sign out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total sessions', value: metrics.total_sessions },
              { label: 'Active now', value: metrics.active_sessions, highlight: metrics.active_sessions > 0 },
              { label: 'Ended', value: metrics.ended_sessions },
              { label: 'Total participants', value: metrics.total_participants },
            ].map(m => (
              <div key={m.label} className="card">
                <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                <p className={`text-2xl font-semibold ${m.highlight ? 'text-green-400' : 'text-white'}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1 w-fit">
          {['live', 'all'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {t === 'live' ? `Live (${liveSessions.length})` : `All sessions (${allSessions.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-gray-600">No sessions found</div>
        ) : (
          <div className="space-y-3">
            {displayed.map(s => (
              <div key={s.id} className="card">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium truncate">{s.title}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>Created {new Date(s.created_at).toLocaleString()}</span>
                      {s.duration_seconds && <span>Duration: {formatDuration(s.duration_seconds)}</span>}
                      <span>{s.participants?.length || 0} participant(s)</span>
                    </div>
                    {s.participants?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {s.participants.map(p => (
                          <span key={p.id} className="text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-300">
                            {p.display_name} ({p.role})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.status !== 'ended' && (
                      <>
                        <button onClick={() => navigate(`/call/${s.id}`)} className="btn-secondary text-sm">
                          Join
                        </button>
                        <button
                          onClick={() => forceEnd(s.id)}
                          disabled={ending === s.id}
                          className="btn-danger text-sm">
                          {ending === s.id ? 'Ending...' : 'Force end'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
