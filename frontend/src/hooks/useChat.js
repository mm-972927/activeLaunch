import { useState, useEffect, useCallback } from 'react'
import client from '../api/client'

export function useChat(sessionId, socketRef, displayName, role) {
  const [messages, setMessages] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Load chat history
  useEffect(() => {
    if (!sessionId) return
    client.get(`/sessions/${sessionId}/chat`)
      .then(({ data }) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [sessionId])

  // Listen for real-time messages
  useEffect(() => {
    const sock = socketRef.current
    if (!sock) return

    function handleMessage(msg) {
      setMessages(prev => {
        // Avoid duplicates by id
        if (msg.id && prev.find(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }

    sock.on('new-message', handleMessage)
    return () => sock.off('new-message', handleMessage)
  }, [socketRef])

  const sendMessage = useCallback((text) => {
    if (!text.trim() || !socketRef.current) return
    socketRef.current.emit('send_message', {
      session_id: sessionId,
      message: text.trim(),
      sender_name: displayName,
      sender_role: role,
    })
  }, [sessionId, displayName, role, socketRef])

  return { messages, loadingHistory, sendMessage }
}
