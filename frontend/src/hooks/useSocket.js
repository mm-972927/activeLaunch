import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

export function useSocket() {
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') },
    })
    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [])

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler)
    return () => socketRef.current?.off(event, handler)
  }, [])

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data)
  }, [])

  return { socketRef, on, emit }
}
