export interface HostDelegator {
  execute(command: { roomSessionId: string; previousHostParticipantId: string }): Promise<unknown>;
}
