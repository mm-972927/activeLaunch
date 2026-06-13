import { useEffect, useRef } from 'react'

function VideoTile({ stream, label, muted = false, isLocal = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted || isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-gray-600">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-sm">No video</span>
        </div>
      )}
      <div className="absolute bottom-2 left-3 text-xs text-white bg-black/50 px-2 py-0.5 rounded-full">
        {label}{isLocal ? ' (You)' : ''}
      </div>
    </div>
  )
}

export default function VideoGrid({ localStream, remoteStreams, localName, participants }) {
  const remoteEntries = Object.entries(remoteStreams)

  // Find display names for remote sockets
  function labelFor(socketId) {
    return participants.find(p => p.socket_id === socketId)?.display_name || 'Remote'
  }

  const total = 1 + remoteEntries.length
  const gridClass = total === 1
    ? 'grid-cols-1 max-w-2xl mx-auto'
    : total === 2
    ? 'grid-cols-1 md:grid-cols-2'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={`grid gap-3 h-full ${gridClass}`}>
      <VideoTile stream={localStream} label={localName} isLocal muted />
      {remoteEntries.map(([socketId, stream]) => (
        <VideoTile key={socketId} stream={stream} label={labelFor(socketId)} />
      ))}
    </div>
  )
}
