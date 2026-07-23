/**
 * Per-user, per-room chat appearance override (wallpaper, theme, font size, compact
 * mode, animations). Takes priority over the room's admin-managed background
 * (`ChatRoom.backgroundUrl`) — see SYSTEM_DESIGN.md §14.10.
 */
export interface UserChatSettings {
  id: string;

  userId: string;

  roomId: string;

  backgroundUrl: string | null;

  backgroundType: 'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN' | null;

  theme: string | null;

  fontSize: number | null;

  compactMode: boolean;

  animationEnabled: boolean;

  createdAt: Date;

  updatedAt: Date;
}
