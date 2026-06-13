import { useState } from 'react'
import client from '../api/client'

export default function SessionHistory({ sessionId }) {
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!open && events.length === 0) {
      setLoading(true)
      try {
        const { data } = await client.get(`/sessions/${sessionId}/history`)
        setEvents(data)
      } finally {
        setLoading(false)
      }
    }
    setOpen(!open)
  }

  function eventLabel(type) {
    const map = {
      participant_joined: 'Joined',
      participant_left: 'Left',
      session_ended: 'Session ended',
      reconnect: 'Reconnected',
    }
    return map[type] || type
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="text-sm text-gray-500 hover:text-gray-300">
        {open ? 'Hide history' : 'View history'}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4">
          <h4 className="text-sm font-medium mb-3">Session history</h4>
          {loading ? (
            <p className="text-xs text-gray-500">Loading...</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-500">No events</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {events.map(ev => (
                <div key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="text-gray-300">{ev.actor_name}</span>
                    <span className="text-gray-500"> — {eventLabel(ev.event_type)}</span>
                    <p className="text-gray-600">{new Date(ev.occurred_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setOpen(false)} className="mt-3 text-xs text-gray-600 hover:text-gray-400">Close</button>
        </div>
      )}
    </div>
  )
}
