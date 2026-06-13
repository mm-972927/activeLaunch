import { useState, useRef, useEffect } from 'react'
import client from '../api/client'

export default function ChatPanel({ messages, onSend, sessionId, displayName, role, socketRef }) {
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await client.post(`/sessions/${sessionId}/files`, form)
      // Notify room via socket
      if (socketRef?.current) {
        socketRef.current.emit('send_file_message', {
          session_id: sessionId,
          sender_name: displayName,
          sender_role: role,
          file_url: data.file_url,
          file_name: data.file_name,
        })
      }
    } catch (err) {
      alert('File upload failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <h3 className="text-sm font-medium text-gray-300">Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-600 text-center mt-4">No messages yet</p>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id || i}>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xs font-medium text-gray-300">{msg.sender_name}</span>
              <span className="text-xs text-gray-600">{formatTime(msg.created_at)}</span>
            </div>
            {msg.message_type === 'file' || msg.file_url ? (
              <a href={msg.file_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 bg-gray-800 px-3 py-1.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                {msg.file_name || 'File'}
              </a>
            ) : (
              <p className="text-sm text-gray-200 bg-gray-800 px-3 py-2 rounded-lg inline-block max-w-full break-words">
                {msg.message}
              </p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="px-4 py-3 border-t border-gray-800 flex-shrink-0">
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex-shrink-0 p-2 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Share file">
            {uploading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            )}
          </button>
          <input ref={fileRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx" onChange={uploadFile} />
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            className="input flex-1 text-sm py-1.5"
            placeholder="Type a message..."
          />
          <button type="submit" disabled={!text.trim()} className="btn-primary px-3 py-1.5 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </form>
    </div>
  )
}
