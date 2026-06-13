export default function ControlBar({
  audioMuted, videoOff,
  onToggleAudio, onToggleVideo,
  isAgent, recording, onStartRecording, onStopRecording,
  onEndSession,
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-4 px-6 bg-gray-950 border-t border-gray-800">
      {/* Mic */}
      <button
        onClick={onToggleAudio}
        title={audioMuted ? 'Unmute' : 'Mute'}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${audioMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
        {audioMuted ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Camera */}
      <button
        onClick={onToggleVideo}
        title={videoOff ? 'Turn on camera' : 'Turn off camera'}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${videoOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
        {videoOff ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        )}
      </button>

      {/* Recording (agent only) */}
      {isAgent && (
        <button
          onClick={recording ? onStopRecording : onStartRecording}
          title={recording ? 'Stop recording' : 'Start recording'}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${recording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}>
          <svg className="w-5 h-5 text-white" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="6" strokeWidth={2} />
          </svg>
        </button>
      )}

      {/* End Call */}
      {isAgent && (
        <button
          onClick={onEndSession}
          title="End call"
          className="w-14 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors ml-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      )}
    </div>
  )
}
