import { describe, expect, it } from "vitest";
import { createApiRuntime } from "../../src/runtime/app.js";

describe("createApiRuntime", () => {
  it("creates the V1 runtime composition boundary", () => {
    const runtime = createApiRuntime();

    expect(runtime.connections.size()).toBe(0);
    expect(runtime.realtime).toBeDefined();
  });
});
