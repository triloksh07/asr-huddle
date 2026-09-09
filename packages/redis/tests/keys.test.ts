import { describe, expect, it } from "vitest";
import { activeStateKeys } from "../src/keys.js";

describe("activeStateKeys", () => {
  it("keeps room state namespaces stable", () => {
    expect(activeStateKeys.room("room-1" as never)).toBe("asr:v1:room:room-1:state");
    expect(activeStateKeys.participants("room-1" as never)).toBe("asr:v1:room:room-1:participants");
  });

  it("separates room-scoped speaker requests", () => {
    expect(
      activeStateKeys.speakerRequest("room-1" as never, "req-1" as never),
    ).toBe("asr:v1:room:room-1:speaker-request:req-1");
  });
});
