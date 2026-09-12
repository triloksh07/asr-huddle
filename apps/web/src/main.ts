import { RoomAudioClient } from './audio/room-audio-client.js';
// import { applyTheme } from './theme.js';

// applyTheme();

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
let token = localStorage.getItem('asr.accessToken') ?? '';
let client: RoomAudioClient | undefined;

// DOM Elements
const elements = {
  statusMsg: document.querySelector<HTMLParagraphElement>('#status-msg')!,
  logoutBtn: document.querySelector<HTMLButtonElement>('#logout-btn')!,
  authSection: document.querySelector<HTMLElement>('#auth-section')!,
  dashboardSection: document.querySelector<HTMLElement>('#dashboard-section')!,
  roomSection: document.querySelector<HTMLElement>('#room-section')!,
  roomsList: document.querySelector<HTMLDivElement>('#rooms-list')!,
  audioStreams: document.querySelector<HTMLDivElement>('#audio-streams')!,

  // Auth Inputs
  nameInput: document.querySelector<HTMLInputElement>('#name')!,
  emailInput: document.querySelector<HTMLInputElement>('#email')!,
  passwordInput: document.querySelector<HTMLInputElement>('#password')!,
  loginBtn: document.querySelector<HTMLButtonElement>('#login-btn')!,
  registerBtn: document.querySelector<HTMLButtonElement>('#register-btn')!,

  // Room Creation Inputs
  titleInput: document.querySelector<HTMLInputElement>('#title')!,
  descInput: document.querySelector<HTMLTextAreaElement>('#description')!,
  visibilitySelect: document.querySelector<HTMLSelectElement>('#visibility')!,
  durationSelect: document.querySelector<HTMLSelectElement>('#duration')!,
  createBtn: document.querySelector<HTMLButtonElement>('#create-btn')!,
  refreshBtn: document.querySelector<HTMLButtonElement>('#refresh-btn')!,
  micBtn: document.querySelector<HTMLButtonElement>('#mic-btn')!,
};

// Network Request Helper
const request = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error ?? 'Request failed.');
  return d;
};

// UI State Sync
function syncView() {
  if (token) {
    elements.authSection.classList.add('hidden');
    elements.dashboardSection.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    loadRooms();
  } else {
    elements.authSection.classList.remove('hidden');
    elements.dashboardSection.classList.add('hidden');
    elements.logoutBtn.classList.add('hidden');
    elements.roomSection.classList.add('hidden');
  }
}

function setStatus(msg: string) {
  elements.statusMsg.textContent = msg;
}

// Business Actions
async function sign(path: string) {
  try {
    const email = elements.emailInput.value;
    const password = elements.passwordInput.value;
    const name = elements.nameInput.value;

    const d = await request(path, {
      method: 'POST',
      body: JSON.stringify(
        path.endsWith('register') ? { name, email, password } : { email, password }
      ),
    });

    token = d.accessToken;
    localStorage.setItem('asr.accessToken', token);
    setStatus('Signed in.');
    syncView();
  } catch (e) {
    setStatus((e as Error).message);
  }
}

async function loadRooms() {
  try {
    const d = await request('/v1/rooms');
    elements.roomsList.innerHTML =
      d.rooms
        .map(
          (r: any) =>
            `<article class="surface room">
              <strong>${r.title}</strong>
              <span class="muted">${r.description}</span>
              <button class="button secondary" data-room="${r.id}">Join</button>
            </article>`
        )
        .join('') || '<p class="muted">No public rooms are live.</p>';

    elements.roomsList
      .querySelectorAll<HTMLButtonElement>('[data-room]')
      .forEach(b => (b.onclick = () => joinRoom(b.dataset.room!)));
  } catch (e) {
    elements.roomsList.textContent = (e as Error).message;
  }
}

async function createRoom() {
  try {
    const title = elements.titleInput.value;
    const description = elements.descInput.value;
    const visibility = elements.visibilitySelect.value;
    const durationMinutes = Number(elements.durationSelect.value);

    const d = await request('/v1/rooms', {
      method: 'POST',
      body: JSON.stringify({ title, description, visibility, durationMinutes }),
    });

    joinRoom(d.room.id);
  } catch (e) {
    setStatus((e as Error).message);
  }
}

async function joinRoom(roomId: string) {
  elements.roomSection.classList.remove('hidden');
  elements.audioStreams.innerHTML = ''; // Clear prior streams

  try {
    const ws = new WebSocket(
      `${api.replace(/^http/, 'ws')}/v1/ws?access_token=${encodeURIComponent(token)}`
    );

    await new Promise<void>((ok, bad) => {
      ws.onopen = () => ok();
      ws.onerror = () => bad(new Error('WebSocket connection failed'));
    });

    client = new RoomAudioClient(ws, track => {
      const a = document.createElement('audio');
      a.autoplay = true;
      a.srcObject = new MediaStream([track]);
      elements.audioStreams.append(a);
    });

    await client.join(roomId);
  } catch (e) {
    setStatus((e as Error).message);
  }
}

// Event Listeners Initialization
function init() {
  elements.logoutBtn.addEventListener('click', () => {
    token = '';
    localStorage.removeItem('asr.accessToken');
    setStatus('');
    syncView();
  });

  elements.loginBtn.addEventListener('click', () => sign('/v1/auth/login'));
  elements.registerBtn.addEventListener('click', () => sign('/v1/auth/register'));
  elements.refreshBtn.addEventListener('click', loadRooms);
  elements.createBtn.addEventListener('click', createRoom);
  elements.micBtn.addEventListener('click', () => client?.enableMicrophone());

  syncView();
}

// Run setup
init();
