import { RoomAudioClient } from './audio/room-audio-client.js';
import { applyTheme } from './theme.js';
applyTheme();
const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
let token = localStorage.getItem('asr.accessToken') ?? '';
let client: RoomAudioClient | undefined;
const app = document.querySelector<HTMLDivElement>('#app')!;
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
function render(message = '') {
  app.innerHTML = `<div class="shell"><header class="row between"><div><h1>ASR Huddle</h1><p class="muted">Live audio rooms</p></div>${token ? '<button class="button secondary" id="logout">Sign out</button>' : ''}</header><p class="muted">${message}</p>${token ? '<section class="surface stack"><div class="row"><input id="title" placeholder="Room title"><button class="button" id="create">Create room</button><button class="button secondary" id="refresh">Refresh</button></div><textarea id="description" placeholder="Description"></textarea><select id="visibility"><option value="PUBLIC">Public</option><option value="LINK_ONLY">Link-only</option></select><select id="duration"><option value="60">1 hour</option><option value="120">2 hours</option><option value="300">5 hours</option></select><div class="rooms" id="rooms"></div></section>' : '<section class="surface stack"><input id="name" placeholder="Name"><input id="email" type="email" placeholder="Email"><input id="password" type="password" placeholder="Password (12+ characters)"><div class="row"><button class="button" id="login">Sign in</button><button class="button secondary" id="register">Create account</button></div></section>'}<section class="surface hidden" id="room"></section></div>`;
  bind();
}
function bind() {
  document.querySelector('#logout')?.addEventListener('click', () => {
    token = '';
    localStorage.removeItem('asr.accessToken');
    render();
  });
  document.querySelector('#login')?.addEventListener('click', () => sign('/v1/auth/login'));
  document.querySelector('#register')?.addEventListener('click', () => sign('/v1/auth/register'));
  document.querySelector('#refresh')?.addEventListener('click', load);
  document.querySelector('#create')?.addEventListener('click', create);
  if (token) load();
}
async function sign(path: string) {
  try {
    const email = (document.querySelector('#email') as HTMLInputElement).value,
      password = (document.querySelector('#password') as HTMLInputElement).value,
      name = (document.querySelector('#name') as HTMLInputElement).value;
    const d = await request(path, {
      method: 'POST',
      body: JSON.stringify(
        path.endsWith('register') ? { name, email, password } : { email, password }
      ),
    });
    token = d.accessToken;
    localStorage.setItem('asr.accessToken', token);
    render('Signed in.');
  } catch (e) {
    render((e as Error).message);
  }
}
async function load() {
  const el = document.querySelector('#rooms')!;
  try {
    const d = await request('/v1/rooms');
    el.innerHTML =
      d.rooms
        .map(
          (r: any) =>
            `<article class="surface room"><strong>${r.title}</strong><span class="muted">${r.description}</span><button class="button secondary" data-room="${r.id}">Join</button></article>`
        )
        .join('') || '<p class="muted">No public rooms are live.</p>';
    el.querySelectorAll<HTMLButtonElement>('[data-room]').forEach(
      b => (b.onclick = () => join(b.dataset.room!))
    );
  } catch (e) {
    el.textContent = (e as Error).message;
  }
}
async function create() {
  try {
    const title = (document.querySelector('#title') as HTMLInputElement).value,
      description = (document.querySelector('#description') as HTMLTextAreaElement).value,
      visibility = (document.querySelector('#visibility') as HTMLSelectElement).value,
      durationMinutes = Number((document.querySelector('#duration') as HTMLSelectElement).value);
    const d = await request('/v1/rooms', {
      method: 'POST',
      body: JSON.stringify({ title, description, visibility, durationMinutes }),
    });
    join(d.room.id);
  } catch (e) {
    render((e as Error).message);
  }
}
async function join(roomId: string) {
  const el = document.querySelector('#room')!;
  el.classList.remove('hidden');
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
      el.append(a);
    });
    await client.join(roomId);
    el.innerHTML = '<h2>Connected</h2><button class="button" id="mic">Enable microphone</button>';
    document.querySelector('#mic')!.addEventListener('click', () => client?.enableMicrophone());
  } catch (e) {
    el.textContent = (e as Error).message;
  }
}
render();
