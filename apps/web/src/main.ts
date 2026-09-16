import './styles.css';
import { RuntimeAudioClient } from './audio/room-audio-client.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type User = { id: string; name?: string; email?: string };

let token = localStorage.getItem('asr.accessToken') ?? '';
let user = JSON.parse(localStorage.getItem('asr.user') ?? 'null') as User | null;
let client: RuntimeAudioClient | undefined;
let currentRoomId = '';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const auth = $('auth');
const session = $('session');
const room = $('room');
const error = $('error');
const logEl = $('log');
const identity = $('identity');
const roomInfo = $('room-info');
const wsState = $('ws-state');
const roomState = $('room-state');
const mediaState = $('media-state');
const roleState = $('role-state');
const producerState = $('producer-state');
const consumerState = $('consumer-state');
const mic = $('mic') as HTMLButtonElement;
const requestBtn = $('request') as HTMLButtonElement;
const approveBtn = $('approve') as HTMLButtonElement;
const roomIdInput = $('room-id') as HTMLInputElement;

function setError(message = '') {
  error.textContent = message;
}

function log(message: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(line);
}

function renderAuth() {
  const signedIn = !!token && !!user;
  auth.classList.toggle('hidden', signedIn);
  session.classList.toggle('hidden', !signedIn);
  if (signedIn)
    identity.textContent = `${user!.name ?? ''} <${user!.email ?? ''}> | userId=${user!.id}`;
}

function updateMediaState() {
  if (!client) return;
  producerState.textContent = client.hasProducer ? 'active' : '—';
  consumerState.textContent = String(client.consumerCount);
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
}

async function register() {
  try {
    setError('');
    const data = await requestJson('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: ($('name') as HTMLInputElement).value.trim(),
        email: ($('email') as HTMLInputElement).value.trim(),
        password: ($('password') as HTMLInputElement).value,
      }),
    });
    setSession(data);
  } catch (e) {
    setError((e as Error).message);
  }
}

async function login() {
  try {
    setError('');
    const data = await requestJson('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: ($('email') as HTMLInputElement).value.trim(),
        password: ($('password') as HTMLInputElement).value,
      }),
    });
    setSession(data);
  } catch (e) {
    setError((e as Error).message);
  }
}

function setSession(data: any) {
  token = data.accessToken;
  user = data.user;
  localStorage.setItem('asr.accessToken', token);
  localStorage.setItem('asr.user', JSON.stringify(user));
  renderAuth();
  log(`Authenticated userId=${user.id}`);
}

async function createRoom() {
  try {
    setError('');
    const title = ($('room-title') as HTMLInputElement).value.trim() || 'Audio runtime test';
    const data = await requestJson('/v1/rooms', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: 'Temporary runtime audio test',
        visibility: 'LINK_ONLY',
        durationMinutes: 60,
      }),
    });
    const created = data.room ?? data;
    roomIdInput.value = created.id;
    log(`Room created id=${created.id} hostUserId=${created.hostUserId}`);
    await joinRoom(created.id);
  } catch (e) {
    setError((e as Error).message);
  }
}

async function joinRoom(roomId: string) {
  try {
    setError('');
    await closeClient();

    currentRoomId = roomId.trim();
    if (!currentRoomId) throw new Error('Room ID is required.');

    wsState.textContent = 'connecting';
    roomState.textContent = 'joining';
    mediaState.textContent = 'initializing';
    roleState.textContent = '—';
    producerState.textContent = '—';
    consumerState.textContent = '0';
    logEl.textContent = '';

    const wsUrl =
      `${api.replace(/^http/, 'ws')}/v1/ws` +
      `?access_token=${encodeURIComponent(token)}` +
      `&userId=${encodeURIComponent(user!.id)}`;

    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('WebSocket open timeout')), 10000);
      ws.addEventListener(
        'open',
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      ws.addEventListener(
        'error',
        () => {
          window.clearTimeout(timer);
          reject(new Error('WebSocket connection failed'));
        },
        { once: true }
      );
      ws.addEventListener(
        'close',
        event => {
          window.clearTimeout(timer);
          reject(new Error(`WebSocket closed before open (${event.code}) ${event.reason}`));
        },
        { once: true }
      );
    });

    wsState.textContent = 'connected';
    log(`WebSocket connected userId=${user!.id}`);

    client = new RuntimeAudioClient(
      ws,
      log,
      (track, producerId) => attachRemoteAudio(track, producerId),
      event => handleEvent(event)
    );

    const joined = await client.join(currentRoomId);
    room.classList.remove('hidden');
    roomState.textContent = 'joined';
    mediaState.textContent = 'ready';
    roleState.textContent = 'joined';
    roomInfo.textContent =
      `room=${joined.roomId} roomSession=${joined.roomSessionId} ` +
      `participant=${joined.participantId} participantSession=${joined.participantSessionId}`;

    const audioState = await client.getAudioState();
    roleState.textContent = audioState.audioRole;
    mic.disabled = !audioState.canTransmitAudio;
    requestBtn.disabled = audioState.canTransmitAudio;
    updateMediaState();

    log(
      `Media ready audioRole=${audioState.audioRole} canTransmitAudio=${audioState.canTransmitAudio}`
    );
  } catch (e) {
    setError((e as Error).message);
    log(`ERROR: ${(e as Error).message}`);
    await closeClient();
  }
}

function attachRemoteAudio(track: MediaStreamTrack, producerId: string) {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.controls = true;
  audio.playsInline = true;
  audio.dataset.producerId = producerId;
  audio.srcObject = new MediaStream([track]);
  $('audio-output').appendChild(audio);
  audio.play().catch(() => {
    log('Remote audio play() was blocked; use the audio control once.');
  });
}

let pendingSpeakerRequestId = '';

function handleEvent(event: any) {
  log(`← EVENT ${event.type} ${JSON.stringify(event.payload ?? {})}`);

  if (event.type === 'speaker.request.created') {
    pendingSpeakerRequestId = event.payload?.requestId ?? '';
    if (pendingSpeakerRequestId) approveBtn.disabled = false;
  }

  if (event.type === 'participant.role.changed') {
    void refreshAudioState();
  }

  if (event.type === 'media.audio.producer.created') {
    updateMediaState();
  }
}

async function refreshAudioState() {
  if (!client) return;
  try {
    const state = await client.getAudioState();
    roleState.textContent = state.audioRole;
    mic.disabled = !state.canTransmitAudio;
    requestBtn.disabled = state.canTransmitAudio;
    log(`Audio state role=${state.audioRole} canTransmitAudio=${state.canTransmitAudio}`);
  } catch (e) {
    log(`Audio state refresh failed: ${(e as Error).message}`);
  }
}

async function enableMic() {
  try {
    setError('');
    if (!client) throw new Error('Join a room first.');
    await client.enableMicrophone();
    mic.disabled = true;
    roleState.textContent = (await client.getAudioState()).audioRole;
    updateMediaState();
  } catch (e) {
    setError((e as Error).message);
    log(`MIC ERROR: ${(e as Error).message}`);
  }
}

async function requestToSpeak() {
  try {
    setError('');
    if (!client) throw new Error('Join a room first.');
    await client.requestToSpeak();
    requestBtn.disabled = true;
  } catch (e) {
    setError((e as Error).message);
    log(`REQUEST ERROR: ${(e as Error).message}`);
  }
}

async function approveRequest() {
  try {
    setError('');
    if (!client) throw new Error('Join a room first.');
    if (!pendingSpeakerRequestId) throw new Error('No pending speaker request.');
    await client.approveRequest(pendingSpeakerRequestId);
    pendingSpeakerRequestId = '';
    approveBtn.disabled = true;
  } catch (e) {
    setError((e as Error).message);
    log(`APPROVE ERROR: ${(e as Error).message}`);
  }
}

async function leaveRoom() {
  try {
    if (client) await client.leave();
  } catch (e) {
    log(`LEAVE ERROR: ${(e as Error).message}`);
  } finally {
    await closeClient();
    room.classList.add('hidden');
    currentRoomId = '';
  }
}

async function closeClient() {
  if (!client) return;
  client.close();
  client = undefined;
}

$('register').addEventListener('click', register);
$('login').addEventListener('click', login);
$('create-room').addEventListener('click', createRoom);
$('join-room').addEventListener('click', () => joinRoom(roomIdInput.value));
$('mic').addEventListener('click', enableMic);
$('request').addEventListener('click', requestToSpeak);
$('approve').addEventListener('click', approveRequest);
$('leave').addEventListener('click', leaveRoom);

$('logout').addEventListener('click', async () => {
  await closeClient();
  token = '';
  user = null;
  localStorage.removeItem('asr.accessToken');
  localStorage.removeItem('asr.user');
  room.classList.add('hidden');
  renderAuth();
});

renderAuth();
