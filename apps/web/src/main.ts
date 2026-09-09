import { RoomAudioClient } from "./audio/room-audio-client.js";

const log = document.querySelector<HTMLPreElement>("#log")!;
const wsInput = document.querySelector<HTMLInputElement>("#ws")!;
const roomInput = document.querySelector<HTMLInputElement>("#room")!;
const joinButton = document.querySelector<HTMLButtonElement>("#join")!;
const micButton = document.querySelector<HTMLButtonElement>("#mic")!;

let socket: WebSocket | undefined;
let client: RoomAudioClient | undefined;

function write(message: string) { log.textContent += `${new Date().toLocaleTimeString()} ${message}\n`; }

joinButton.onclick = async () => {
  try {
    socket = new WebSocket(wsInput.value);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("WebSocket connection failed.")), { once: true });
    });
    client = new RoomAudioClient(socket, (track) => {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.srcObject = new MediaStream([track]);
      document.querySelector("#audio")!.append(audio);
    });
    const session = await client.join(roomInput.value.trim());
    write(`joined room=${session.roomId} participant=${session.participantId}`);
    micButton.disabled = false;
    joinButton.disabled = true;
  } catch (error) { write(`join failed: ${(error as Error).message}`); socket?.close(); }
};

micButton.onclick = async () => {
  try { await client?.enableMicrophone(); micButton.disabled = true; write("microphone producer created"); }
  catch (error) { write(`microphone failed: ${(error as Error).message}`); }
};
