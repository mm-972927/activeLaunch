import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await client.post('/auth/register', form)
        setMode('login')
        setError('Registered! Please log in.')
        setLoading(false)
        return
      }
      const { data } = await client.post('/auth/login', { email: form.email, password: form.password })
      localStorage.setItem('token', data.access_token)
      const { data: user } = await client.get('/auth/me')
      localStorage.setItem('user', JSON.stringify(user))
      navigate(user.role === 'admin' ? '/admin' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">A</div>
          <div>
            <h1 className="text-xl font-semibold text-white">AtomQuest</h1>
            <p className="text-xs text-gray-400">Video Support Platform</p>
          </div>
        </div>

        <h2 className="text-lg font-medium mb-6">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

        {error && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${error.includes('Registered') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Full name</label>
              <input name="full_name" value={form.full_name} onChange={handle} required className="input" placeholder="Jane Smith" />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input name="email" type="email" value={form.email} onChange={handle} required className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} required className="input" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-gray-500 mt-6 text-center">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} className="text-indigo-400 hover:text-indigo-300">
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
