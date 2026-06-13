import { useEffect, useRef, useState, useCallback } from 'react'
import * as mediasoupClient from 'mediasoup-client'

export function useWebRTC(sessionId, socketRef, enabled = true) {
  const deviceRef = useRef(null)
  const sendTransportRef = useRef(null)
  const recvTransportRef = useRef(null)
  const producersRef = useRef({ audio: null, video: null })
  const consumersRef = useRef({})
  const localStreamRef = useRef(null)

  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({}) // socketId -> MediaStream
  const [audioMuted, setAudioMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  // Helper to emit and await a socket response event
  function socketRequest(socketRef, emitEvent, data, responseEvent) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${responseEvent}`)), 10000)
      socketRef.current.once(responseEvent, (res) => {
        clearTimeout(timeout)
        resolve(res)
      })
      socketRef.current.emit(emitEvent, data)
    })
  }

  async function init() {
    if (!enabled || !socketRef.current || !sessionId) return
    try {
      // 1. Get local media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      localStreamRef.current = stream
      setLocalStream(stream)

      // 2. Get RTP capabilities from router
      const { rtpCapabilities } = await socketRequest(socketRef, 'get_rtp_capabilities', {}, 'rtp-capabilities')

      // 3. Create mediasoup device
      const device = new mediasoupClient.Device()
      await device.load({ routerRtpCapabilities: rtpCapabilities })
      deviceRef.current = device

      // 4. Create send transport
      const sendParams = await socketRequest(socketRef, 'create_transport', { direction: 'send' }, 'transport-created')
      const sendTransport = device.createSendTransport({
        id: sendParams.transport_id,
        iceParameters: sendParams.ice_parameters,
        iceCandidates: sendParams.ice_candidates,
        dtlsParameters: sendParams.dtls_parameters,
      })
      sendTransportRef.current = sendTransport

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest(socketRef, 'connect_transport', { transport_id: sendTransport.id, dtls_parameters: dtlsParameters }, 'transport-connected')
          callback()
        } catch (e) { errback(e) }
      })

      sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { producer_id } = await socketRequest(socketRef, 'produce', {
            transport_id: sendTransport.id, kind, rtp_parameters: rtpParameters,
          }, 'produced')
          callback({ id: producer_id })
        } catch (e) { errback(e) }
      })

      // 5. Create recv transport
      const recvParams = await socketRequest(socketRef, 'create_transport', { direction: 'recv' }, 'transport-created')
      const recvTransport = device.createRecvTransport({
        id: recvParams.transport_id,
        iceParameters: recvParams.ice_parameters,
        iceCandidates: recvParams.ice_candidates,
        dtlsParameters: recvParams.dtls_parameters,
      })
      recvTransportRef.current = recvTransport

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRequest(socketRef, 'connect_transport', { transport_id: recvTransport.id, dtls_parameters: dtlsParameters }, 'transport-connected')
          callback()
        } catch (e) { errback(e) }
      })

      // 6. Produce audio and video
      const audioTrack = stream.getAudioTracks()[0]
      const videoTrack = stream.getVideoTracks()[0]

      if (audioTrack) {
        producersRef.current.audio = await sendTransport.produce({ track: audioTrack })
      }
      if (videoTrack) {
        producersRef.current.video = await sendTransport.produce({ track: videoTrack })
      }

      setReady(true)
    } catch (err) {
      console.error('[WebRTC] init error:', err)
      setError(err.message)
    }
  }

  // Consume a new remote producer
  const consumeProducer = useCallback(async (producerId, socketId) => {
    const device = deviceRef.current
    const recvTransport = recvTransportRef.current
    if (!device || !recvTransport) return

    try {
      const params = await socketRequest(socketRef, 'consume', {
        producer_id: producerId,
        rtp_capabilities: device.rtpCapabilities,
        session_id: sessionId,
      }, 'consumed')

      const consumer = await recvTransport.consume({
        id: params.consumer_id,
        producerId: params.producer_id,
        kind: params.kind,
        rtpParameters: params.rtp_parameters,
      })

      consumersRef.current[params.consumer_id] = consumer

      // Resume
      socketRef.current.emit('resume_consumer', { consumer_id: params.consumer_id })

      // Add track to remote stream for this socket
      setRemoteStreams(prev => {
        const existing = prev[socketId] || new MediaStream()
        existing.addTrack(consumer.track)
        return { ...prev, [socketId]: existing }
      })
    } catch (err) {
      console.error('[WebRTC] consume error:', err)
    }
  }, [sessionId, socketRef])

  // Listen for new-producer events
  useEffect(() => {
    const sock = socketRef.current
    if (!sock) return
    function onNewProducer({ producer_id, socket_id }) {
      consumeProducer(producer_id, socket_id)
    }
    sock.on('new-producer', onNewProducer)
    return () => sock.off('new-producer', onNewProducer)
  }, [socketRef, consumeProducer])

  // Listen for participant-left — clean up their streams
  useEffect(() => {
    const sock = socketRef.current
    if (!sock) return
    function onParticipantLeft({ socket_id }) {
      if (socket_id) {
        setRemoteStreams(prev => {
          const next = { ...prev }
          delete next[socket_id]
          return next
        })
      }
    }
    sock.on('participant-left', onParticipantLeft)
    return () => sock.off('participant-left', onParticipantLeft)
  }, [socketRef])

  useEffect(() => {
    if (enabled && socketRef.current) {
      // Wait a tick for socket to be ready
      const t = setTimeout(init, 300)
      return () => clearTimeout(t)
    }
  }, [enabled, sessionId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      producersRef.current.audio?.close()
      producersRef.current.video?.close()
      Object.values(consumersRef.current).forEach(c => c.close())
      sendTransportRef.current?.close()
      recvTransportRef.current?.close()
    }
  }, [])

  function toggleAudio() {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setAudioMuted(!track.enabled) }
  }

  function toggleVideo() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setVideoOff(!track.enabled) }
  }

  return { localStream, remoteStreams, audioMuted, videoOff, toggleAudio, toggleVideo, ready, error }
}
