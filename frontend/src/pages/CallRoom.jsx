import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { useChat } from '../hooks/useChat'
import VideoGrid from '../components/VideoGrid'
import ChatPanel from '../components/ChatPanel'
import ControlBar from '../components/ControlBar'
import client from '../api/client'

// CallRoom can be used by agents (via router) or customers (via JoinRoom props)
export default function CallRoom({ sessionId: propSessionId, inviteToken, displayName: propDisplayName, role: propRole }) {
  const params = useParams()
  const navigate = useNavigate()

  const sessionId = propSessionId || params.sessionId
  const user = JSON.parse(localStorage.getItem('user') || 'null')

  // For agents, get info from JWT user; for customers, use props
  const displayName = propDisplayName || user?.full_name || 'Agent'
  const role = propRole || user?.role || 'agent'
  const isAgent = role === 'agent' || role === 'admin'

  const [participants, setParticipants] = useState([])
  const [sessionEnded, setSessionEnded] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingId, setRecordingId] = useState(null)
  const [recordingStatus, setRecordingStatus] = useState(null)
  const [joined, setJoined] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [connectionError, setConnectionError] = useState(null)

  const { socketRef, on, emit } = useSocket()

  const { localStream, remoteStreams, audioMuted, videoOff, toggleAudio, toggleVideo, ready, error: webrtcError } = useWebRTC(
    sessionId, socketRef, joined
  )

  const { messages, sendMessage } = useChat(sessionId, socketRef, displayName, role)

  // Join session via socket once socket is ready
  useEffect(() => {
    const sock = socketRef.current
    if (!sock) return

    function doJoin() {
      sock.emit('join_session', {
        session_id: sessionId,
        invite_token: inviteToken,
        display_name: displayName,
        role,
      })
    }

    sock.on('connect', doJoin)
    if (sock.connected) doJoin()

    return () => sock.off('connect', doJoin)
  }, [sessionId, inviteToken, displayName, role])

  // Socket event handlers
  useEffect(() => {
    const offs = [
      on('session-joined', (data) => {
        setJoined(true)
        setParticipants(data.participants || [])
      }),
      on('participant-joined', (p) => {
        setParticipants(prev => [...prev.filter(x => x.display_name !== p.display_name), p])
      }),
      on('participant-left', (p) => {
        setParticipants(prev => prev.filter(x => x.display_name !== p.display_name))
      }),
      on('session-ended', () => setSessionEnded(true)),
      on('recording-started', ({ recording_id }) => {
        setRecording(true)
        setRecordingId(recording_id)
        setRecordingStatus('recording')
      }),
      on('recording-stopped', () => {
        setRecording(false)
        setRecordingStatus('processing')
      }),
      on('error', (data) => setConnectionError(data.message)),
    ]
    return () => offs.forEach(off => typeof off === 'function' && off())
  }, [on])

  // Poll recording status until ready
  useEffect(() => {
    if (!recordingId || recordingStatus === 'ready' || recordingStatus === 'failed') return
    if (recordingStatus !== 'processing') return
    const interval = setInterval(async () => {
      try {
        const { data } = await client.get(`/recordings/${recordingId}/status`)
        setRecordingStatus(data.status)
        if (data.status === 'ready' || data.status === 'failed') clearInterval(interval)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [recordingId, recordingStatus])

  function handleStartRecording() {
    emit('start_recording_event', { session_id: sessionId })
  }

  function handleStopRecording() {
    emit('stop_recording_event', { recording_id: recordingId, session_id: sessionId })
  }

  function handleEndSession() {
    if (!window.confirm('End this session for everyone?')) return
    emit('end_session_event', { session_id: sessionId })
    navigate('/dashboard')
  }

  if (sessionEnded) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="card text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium mb-2">Session ended</h2>
        <p className="text-sm text-gray-400 mb-4">The support session has been closed.</p>
        {isAgent && (
          <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">
            Back to dashboard
          </button>
        )}
      </div>
    </div>
  )

  if (connectionError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="card text-center max-w-sm">
        <p className="text-red-400 mb-4">{connectionError}</p>
        <button onClick={() => window.location.reload()} className="btn-secondary">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">A</div>
          <span className="text-sm font-medium">AtomQuest Support</span>
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Recording
            </span>
          )}
          {recordingStatus === 'processing' && (
            <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">Processing recording...</span>
          )}
          {recordingStatus === 'ready' && (
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Recording ready — check dashboard</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
          {!joined && <span className="text-xs text-yellow-400">Connecting...</span>}
          {joined && !ready && <span className="text-xs text-yellow-400">Setting up media...</span>}
          {webrtcError && <span className="text-xs text-red-400">Media error: {webrtcError}</span>}
          <button onClick={() => setShowChat(!showChat)} className="text-sm text-gray-400 hover:text-gray-200">
            {showChat ? 'Hide chat' : 'Show chat'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 p-4 overflow-hidden">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            localName={displayName}
            participants={participants}
          />
        </div>

        {/* Chat panel */}
        {showChat && (
          <div className="w-72 flex-shrink-0">
            <ChatPanel
              messages={messages}
              onSend={sendMessage}
              sessionId={sessionId}
              displayName={displayName}
              role={role}
              socketRef={socketRef}
            />
          </div>
        )}
      </div>

      {/* Control bar */}
      <ControlBar
        audioMuted={audioMuted}
        videoOff={videoOff}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        isAgent={isAgent}
        recording={recording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onEndSession={handleEndSession}
      />
    </div>
  )
}
