export class RealtimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RealtimeError";
  }
}

export const realtimeErrors = {
  invalidMessage: () => new RealtimeError("INVALID_MESSAGE", "Invalid realtime message."),
  unauthorized: () => new RealtimeError("UNAUTHORIZED", "Authentication is required."),
  unsupportedCommand: (type: string) =>
    new RealtimeError("UNSUPPORTED_COMMAND", `Unsupported realtime command: ${type}.`),
  invalidState: (message: string) => new RealtimeError("INVALID_STATE", message),
} as const;
