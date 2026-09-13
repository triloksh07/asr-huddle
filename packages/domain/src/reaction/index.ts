export const REACTION_TYPES = [
  '👍',
  '😅',
  '🔥',
  '🥲',
  '😂',
  '👏',
  '👋',
  '😏',
  '🙂',
  '👀',
  '🥀',
  '❤️',
  '💯',
] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];
