import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import CallRoom from './CallRoom'

export default function JoinRoom() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [step, setStep] = useState('validate') // validate | name | call | error
  const [sessionInfo, setSessionInfo] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function validate() {
      if (!token) { setError('Missing invite token.'); setStep('error'); setLoading(false); return }
      try {
        const { data } = await client.get(`/sessions/${sessionId}/join?token=${token}`)
        setSessionInfo(data)
        setStep('name')
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid or expired invite link.')
        setStep('error')
      } finally {
        setLoading(false)
      }
    }
    validate()
  }, [sessionId, token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
      Verifying invite...
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="card max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-900/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </div>
        <h2 className="text-lg font-medium mb-2">Cannot join session</h2>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    </div>
  )

  if (step === 'call') return (
    <CallRoom
      sessionId={sessionId}
      inviteToken={token}
      displayName={displayName}
      role="customer"
    />
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="card max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">A</div>
          <span className="font-semibold text-white">AtomQuest Support</span>
        </div>

        <h2 className="text-lg font-medium mb-1">You're invited to a support session</h2>
        <p className="text-gray-400 text-sm mb-6">{sessionInfo?.title}</p>

        <form onSubmit={e => { e.preventDefault(); if (displayName.trim()) setStep('call') }}>
          <label className="block text-sm text-gray-400 mb-1">Your name</label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="input mb-4"
            placeholder="Enter your name to join"
            autoFocus
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={!displayName.trim()}>
            Join Video Call
          </button>
        </form>

        <p className="text-xs text-gray-600 mt-4 text-center">
          By joining, you allow access to your camera and microphone.
        </p>
      </div>
    </div>
  )
}
