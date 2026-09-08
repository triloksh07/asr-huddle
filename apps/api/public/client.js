import * as mediasoupClient from 'mediasoup-client';

let ws;
let device;
let sendTransport;
let recvTransport;
let currentRoomId = 'test-room';
const pendingRequests = new Map();

function sendJsonRpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    pendingRequests.set(id, { resolve, reject });

    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    ws.send(JSON.stringify(payload));
  });
}

export async function init() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/v1/ws`);

  ws.onopen = () => {
    console.log('[WS] Connected to API Gateway');
    document.getElementById('status').innerText = 'Connected to Gateway';
  };

  ws.onmessage = async event => {
    const data = JSON.parse(event.data);

    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);

      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    }
  };
}

export async function joinRoom() {
  currentRoomId = document.getElementById('roomIdInput').value || 'test-room';

  // 1. Join Room & Receive SFU Router RTP Capabilities
  const joinRes = await sendJsonRpc('join_room', { roomId: currentRoomId });
  console.log('[SFU] Joined room:', joinRes);

  // 2. Load Mediasoup Device
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: joinRes.sfuData.rtpCapabilities });

  document.getElementById('status').innerText =
    `Joined Room: ${currentRoomId} (User: ${joinRes.userId})`;
  document.getElementById('produceBtn').disabled = false;
  document.getElementById('consumeBtn').disabled = false;
}

export async function produceAudio() {
  // 1. Ask API/SFU for Send Transport Parameters
  const transportData = await sendJsonRpc('create_transport', { direction: 'send' });

  // 2. Create Send Transport on Browser Device
  sendTransport = device.createSendTransport(transportData);

  sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    try {
      // Connect transport on SFU (Handled implicitly during produce in current API, or add explicit connect if needed)
      callback();
    } catch (err) {
      errback(err);
    }
  });

  sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
    try {
      const res = await sendJsonRpc('produce', {
        transportId: sendTransport.id,
        kind,
        rtpParameters,
      });
      callback({ id: res.producerId });
      document.getElementById('producerIdDisplay').innerText =
        `Your Producer ID: ${res.producerId}`;
    } catch (err) {
      errback(err);
    }
  });

  // 3. Acquire Microphone Track & Produce
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const track = stream.getAudioTracks()[0];
  await sendTransport.produce({ track });

  console.log('[Media] Audio Stream producing live!');
}

export async function consumeAudio() {
  const targetProducerId = document.getElementById('targetProducerId').value;
  if (!targetProducerId) {
    alert('Please enter a Producer ID to consume!');
    return;
  }

  // 1. Ask API/SFU for Receive Transport Parameters
  const transportData = await sendJsonRpc('create_transport', { direction: 'recv' });
  recvTransport = device.createRecvTransport(transportData);

  recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    callback();
  });

  // 2. Request SFU Consumer
  const consumeRes = await sendJsonRpc('consume', {
    transportId: recvTransport.id,
    producerId: targetProducerId,
    rtpCapabilities: device.rtpCapabilities,
  });

  // 3. Consume Audio Track Locally
  const consumer = await recvTransport.consume({
    id: consumeRes.id,
    producerId: consumeRes.producerId,
    kind: consumeRes.kind,
    rtpParameters: consumeRes.rtpParameters,
  });

  const { track } = consumer;
  const audioEl = document.getElementById('remoteAudio');
  audioEl.srcObject = new MediaStream([track]);
  await audioEl.play();

  console.log('[Media] Audio Stream consuming live!');
}

// Bind UI actions to global scope for button clicks
window.init = init;
window.joinRoom = joinRoom;
window.produceAudio = produceAudio;
window.consumeAudio = consumeAudio;
