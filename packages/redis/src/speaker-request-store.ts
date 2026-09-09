import type { Redis } from "ioredis";
import type { RoomId, SpeakerRequestId } from "@repo/domain";
import { activeStateKeys } from "./keys.js";
import { decodeSpeakerRequest, encodeJson } from "./codec.js";
import type { SpeakerRequestState, SpeakerRequestStore } from "./types.js";

const transitionScript = `
local current = redis.call("GET", KEYS[1])
if not current then return 0 end
local expected = ARGV[1]
local nextState = ARGV[2]
local resolvedAt = ARGV[3]
local parsed = cjson.decode(current)
if parsed.state ~= expected then return 0 end
parsed.state = nextState
parsed.resolvedAt = (resolvedAt == "" and cjson.null or resolvedAt)
redis.call("SET", KEYS[1], cjson.encode(parsed), "KEEPTTL")
if nextState == "PENDING" then
  redis.call("SADD", KEYS[2], parsed.requestId)
else
  redis.call("SREM", KEYS[2], parsed.requestId)
end
return 1
`;

export class RedisSpeakerRequestStore implements SpeakerRequestStore {
  constructor(private readonly redis: Redis) {}

  async get(roomId: RoomId, requestId: SpeakerRequestId): Promise<SpeakerRequestState | null> {
    const raw = await this.redis.get(activeStateKeys.speakerRequest(roomId, requestId));
    return raw ? decodeSpeakerRequest(raw) : null;
  }

  async listPending(roomId: RoomId): Promise<SpeakerRequestState[]> {
    const ids = await this.redis.smembers(activeStateKeys.pendingSpeakerRequests(roomId));
    if (ids.length === 0) return [];
    const values = await this.redis.mget(
      ...ids.map((id) => activeStateKeys.speakerRequest(roomId, id as SpeakerRequestId)),
    );
    return values.filter(Boolean).map((value) => decodeSpeakerRequest(value!));
  }

  async put(request: SpeakerRequestState, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(
      activeStateKeys.speakerRequest(request.roomId, request.requestId),
      encodeJson(request),
      "EX",
      ttlSeconds,
    );
    if (request.state === "PENDING") {
      pipeline.sadd(activeStateKeys.pendingSpeakerRequests(request.roomId), request.requestId);
    }
    await pipeline.exec();
  }

  async transition(
    roomId: RoomId,
    requestId: SpeakerRequestId,
    from: SpeakerRequestState["state"],
    to: SpeakerRequestState["state"],
    resolvedAt: string | null,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      transitionScript,
      2,
      activeStateKeys.speakerRequest(roomId, requestId),
      activeStateKeys.pendingSpeakerRequests(roomId),
      from,
      to,
      resolvedAt ?? "",
    );
    return Number(result) === 1;
  }

  async remove(roomId: RoomId, requestId: SpeakerRequestId): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(activeStateKeys.speakerRequest(roomId, requestId));
    pipeline.srem(activeStateKeys.pendingSpeakerRequests(roomId), requestId);
    await pipeline.exec();
  }
}
