import { describe, expect, it } from "vitest";
import {
  assertCanAddSpeaker,
  assertCanAddListener,
  assertCanPromoteToCoHost,
  ROOM_CAPACITY,
} from "../src/policy/index.js";

describe("room capacity policies", () => {
  it("enforces speaker capacity", () => {
    expect(() => assertCanAddSpeaker({
      speakers: ROOM_CAPACITY.MAX_SPEAKERS,
      listeners: 0,
      coHosts: 0,
    })).toThrow("speaker capacity");
  });

  it("enforces listener capacity", () => {
    expect(() => assertCanAddListener({
      speakers: 1,
      listeners: ROOM_CAPACITY.MAX_LISTENERS,
      coHosts: 0,
    })).toThrow("listener capacity");
  });

  it("enforces co-host capacity", () => {
    expect(() => assertCanPromoteToCoHost({
      speakers: 5,
      listeners: 5,
      coHosts: ROOM_CAPACITY.MAX_CO_HOSTS,
    })).toThrow("co-host capacity");
  });
});
