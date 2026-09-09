import { describe, expect, it, vi } from "vitest";
import { MediaController } from "../../src/media/media-controller.js";

function context() {
  return {
    roomId: "room-1" as never,
    roomSessionId: "room-session-1" as never,
    participantId: "participant-1" as never,
    participantSessionId: "participant-session-1" as never,
  };
}

describe("MediaController", () => {
  it("creates a participant transport through MediaService", async () => {
    const media = {
      createWebRtcTransport: vi.fn().mockResolvedValue({ transportId: "t1" }),
    } as never;

    const controller = new MediaController(media);

    await expect(controller.createTransport(context())).resolves.toEqual({
      transportId: "t1",
    });

    expect(media.createWebRtcTransport).toHaveBeenCalledOnce();
  });

  it("rejects producer identity that does not match the authenticated participant session", async () => {
    const media = {
      produceAudio: vi.fn(),
    } as never;

    const controller = new MediaController(media);

    await expect(controller.produceAudio(context(), {
      transportId: "t1",
      kind: "audio",
      rtpParameters: {},
      appData: {
        participantId: "different-participant",
        participantSessionId: "participant-session-1",
      },
    })).rejects.toMatchObject({
      code: "MEDIA_IDENTITY_MISMATCH",
    });

    expect(media.produceAudio).not.toHaveBeenCalled();
  });
});
