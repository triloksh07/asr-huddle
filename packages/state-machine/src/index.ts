export interface MicStateInput {
  role: 'host' | 'cohost' | 'speaker' | 'listener';
  micSelfEnabled: boolean;
  micModeratorMuted: boolean;
}

export function isMicEffective(state: MicStateInput): boolean {
  const isSpeakerOrHigher = ['host', 'cohost', 'speaker'].includes(state.role);
  return isSpeakerOrHigher && state.micSelfEnabled && !state.micModeratorMuted;
}
