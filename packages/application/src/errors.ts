export class ApplicationError extends Error {
  constructor(
    readonly code:
      | "UNAUTHENTICATED"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "CONFLICT"
      | "CAPACITY_EXCEEDED"
      | "ROOM_ENDED"
      | "INVALID_STATE",
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
