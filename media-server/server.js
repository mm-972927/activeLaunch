require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mediasoup = require('mediasoup');
const { startRecording, stopRecording } = require('./recorder');
const config = require('./mediasoup_config');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MEDIA_SERVER_PORT || 3001;

// State: one worker, routers per session, transports/producers/consumers per socket
let worker;
const sessionRouters = new Map();     // sessionId -> router
const transports = new Map();         // transportId -> { transport, sessionId, socketId }
const producers = new Map();          // producerId -> { producer, sessionId, socketId }
const consumers = new Map();          // consumerId -> consumer
const sessionProducers = new Map();   // sessionId -> Set of producerIds


// ── Worker ─────────────────────────────────────────────────────────────────

async function createWorker() {
  worker = await mediasoup.createWorker(config.worker);
  worker.on('died', () => {
    console.error('[mediasoup] Worker died — exiting');
    process.exit(1);
  });
  console.log('[mediasoup] Worker created, pid:', worker.pid);
}


async function getOrCreateRouter(sessionId) {
  if (sessionRouters.has(sessionId)) return sessionRouters.get(sessionId);
  const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
  sessionRouters.set(sessionId, router);
  if (!sessionProducers.has(sessionId)) sessionProducers.set(sessionId, new Set());
  console.log(`[mediasoup] Router created for session ${sessionId}`);
  return router;
}


// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));


app.get('/rtp-capabilities', async (req, res) => {
  const { sessionId } = req.query;
  const router = await getOrCreateRouter(sessionId || 'default');
  res.json({ rtpCapabilities: router.rtpCapabilities });
});


app.post('/transport/create', async (req, res) => {
  const { session_id, direction } = req.body;
  const router = await getOrCreateRouter(session_id);

  const transport = await router.createWebRtcTransport(config.webRtcTransport);
  transports.set(transport.id, { transport, sessionId: session_id, direction });

  console.log(`[mediasoup] Transport created: ${transport.id} (${direction})`);
  res.json({
    transport_id: transport.id,
    ice_parameters: transport.iceParameters,
    ice_candidates: transport.iceCandidates,
    dtls_parameters: transport.dtlsParameters,
  });
});


app.post('/transport/connect', async (req, res) => {
  const { transport_id, dtls_parameters } = req.body;
  const entry = transports.get(transport_id);
  if (!entry) return res.status(404).json({ error: 'Transport not found' });
  await entry.transport.connect({ dtlsParameters: dtls_parameters });
  res.json({ connected: true });
});


app.post('/produce', async (req, res) => {
  const { transport_id, kind, rtp_parameters, session_id, socket_id } = req.body;
  const entry = transports.get(transport_id);
  if (!entry) return res.status(404).json({ error: 'Transport not found' });

  const producer = await entry.transport.produce({ kind, rtpParameters: rtp_parameters });
  producers.set(producer.id, { producer, sessionId: session_id, socketId: socket_id });

  const sessionProdSet = sessionProducers.get(session_id) || new Set();
  sessionProdSet.add(producer.id);
  sessionProducers.set(session_id, sessionProdSet);

  console.log(`[mediasoup] Producer created: ${producer.id} (${kind}) in session ${session_id}`);
  res.json({ producer_id: producer.id });
});


app.post('/consume', async (req, res) => {
  const { producer_id, rtp_capabilities, session_id, socket_id } = req.body;
  const router = await getOrCreateRouter(session_id);

  if (!router.canConsume({ producerId: producer_id, rtpCapabilities: rtp_capabilities })) {
    return res.status(400).json({ error: 'Cannot consume this producer' });
  }

  // Find the recv transport for this socket
  const recvTransport = [...transports.values()].find(
    (t) => t.sessionId === session_id && t.direction === 'recv'
  );
  if (!recvTransport) return res.status(404).json({ error: 'Recv transport not found' });

  const consumer = await recvTransport.transport.consume({
    producerId: producer_id,
    rtpCapabilities: rtp_capabilities,
    paused: true,
  });
  consumers.set(consumer.id, consumer);

  res.json({
    consumer_id: consumer.id,
    producer_id: producer_id,
    kind: consumer.kind,
    rtp_parameters: consumer.rtpParameters,
  });
});


app.post('/consumer/resume', async (req, res) => {
  const { consumer_id } = req.body;
  const consumer = consumers.get(consumer_id);
  if (consumer) await consumer.resume();
  res.json({ resumed: true });
});


app.get('/session/:sessionId/producers', (req, res) => {
  const { sessionId } = req.params;
  const prodIds = [...(sessionProducers.get(sessionId) || [])];
  res.json({ producer_ids: prodIds });
});


// ── Recording routes ────────────────────────────────────────────────────────

app.post('/recording/start', async (req, res) => {
  const { session_id, recording_id } = req.body;
  const router = sessionRouters.get(session_id);
  if (!router) return res.status(404).json({ error: 'Session router not found' });

  // Find audio + video producers for this session
  const sessionProdIds = [...(sessionProducers.get(session_id) || [])];
  const audioProducer = sessionProdIds.map(id => producers.get(id)).find(p => p?.producer.kind === 'audio')?.producer;
  const videoProducer = sessionProdIds.map(id => producers.get(id)).find(p => p?.producer.kind === 'video')?.producer;

  if (!audioProducer || !videoProducer) {
    return res.status(400).json({ error: 'No active audio/video producers' });
  }

  try {
    const info = await startRecording(recording_id, router, audioProducer, videoProducer);
    res.json({ started: true, ...info });
  } catch (err) {
    console.error('[Recording] Start failed:', err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/recording/stop', (req, res) => {
  const { recording_id } = req.body;
  const outputPath = stopRecording(recording_id);
  res.json({ stopped: true, output_path: outputPath });
});


// ── Boot ────────────────────────────────────────────────────────────────────

(async () => {
  await createWorker();
  app.listen(PORT, () => {
    console.log(`[mediasoup] Media server running on http://localhost:${PORT}`);
  });
})();
