const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RECORDINGS_DIR = '/tmp/recordings';

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const activeRecordings = new Map(); // recordingId -> { process, audioPort, videoPort }

/**
 * Start recording a session using GStreamer.
 * Receives RTP from mediasoup via PlainTransport and muxes to WebM.
 */
async function startRecording(recordingId, router, audioProducer, videoProducer) {
  const audioPort = 5000 + Math.floor(Math.random() * 1000);
  const videoPort = 6000 + Math.floor(Math.random() * 1000);
  const outputPath = path.join(RECORDINGS_DIR, `${recordingId}.webm`);

  // Create plain transport for audio
  const audioTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1' },
    rtcpMux: false,
    comedia: false,
  });
  await audioTransport.connect({ ip: '127.0.0.1', port: audioPort, rtcpPort: audioPort + 1 });

  // Create plain transport for video
  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1' },
    rtcpMux: false,
    comedia: false,
  });
  await videoTransport.connect({ ip: '127.0.0.1', port: videoPort, rtcpPort: videoPort + 1 });

  // Consume audio
  const audioConsumer = await audioTransport.consume({
    producerId: audioProducer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  // Consume video
  const videoConsumer = await videoTransport.consume({
    producerId: videoProducer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  // Build GStreamer pipeline
  const gstPipeline = [
    'gst-launch-1.0', '-e',
    // Audio branch
    `udpsrc port=${audioPort} caps="application/x-rtp,media=audio,clock-rate=48000,encoding-name=OPUS,payload=111"`,
    '!', 'rtpopusdepay', '!', 'opusdec', '!', 'audioconvert', '!', 'vorbisenc', '!', 'mux.',
    // Video branch
    `udpsrc port=${videoPort} caps="application/x-rtp,media=video,clock-rate=90000,encoding-name=VP8,payload=96"`,
    '!', 'rtpvp8depay', '!', 'mux.',
    // Mux and write
    'webmmux name=mux', '!', `filesink location=${outputPath}`,
  ];

  const gstProcess = spawn(gstPipeline[0], gstPipeline.slice(1), {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  gstProcess.stdout.on('data', (d) => console.log('[GStreamer]', d.toString()));
  gstProcess.stderr.on('data', (d) => console.error('[GStreamer err]', d.toString()));
  gstProcess.on('close', (code) => {
    console.log(`[GStreamer] Recording ${recordingId} exited with code ${code}`);
  });

  activeRecordings.set(recordingId, {
    process: gstProcess,
    audioTransport,
    videoTransport,
    audioConsumer,
    videoConsumer,
    outputPath,
  });

  console.log(`[Recorder] Started recording ${recordingId} → ${outputPath}`);
  return { audioPort, videoPort, outputPath };
}


function stopRecording(recordingId) {
  const rec = activeRecordings.get(recordingId);
  if (!rec) return false;

  // Send EOS to GStreamer to flush and close file cleanly
  rec.process.kill('SIGINT');

  // Clean up mediasoup resources
  rec.audioConsumer.close();
  rec.videoConsumer.close();
  rec.audioTransport.close();
  rec.videoTransport.close();

  activeRecordings.delete(recordingId);
  console.log(`[Recorder] Stopped recording ${recordingId}`);
  return rec.outputPath;
}


module.exports = { startRecording, stopRecording };
