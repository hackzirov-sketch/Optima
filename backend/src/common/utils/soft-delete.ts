/**
 * Single source of truth for soft-delete state: `deletedAt` (+ optional `deletedBy`).
 * `isDeleted` boolean is intentionally NOT used anywhere (system design v2 §3) —
 * active check is always `deletedAt IS NULL`.
 */
export interface SoftDeletableEntity {
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

export function applySoftDelete<T extends SoftDeletableEntity>(
  entity: T,
  deletedBy?: string,
): T {
  entity.deletedAt = new Date();
  if (deletedBy !== undefined && 'deletedBy' in entity) {
    (entity as T & { deletedBy?: string }).deletedBy = deletedBy;
  }
  return entity;
}

export function isSoftDeleted(
  entity: SoftDeletableEntity | null | undefined,
): boolean {
  if (!entity) return true;
  return Boolean(entity.deletedAt);
}

/** Type guard: entity exists and is not soft-deleted. */
export function isActiveEntity<T extends SoftDeletableEntity>(
  entity: T | null | undefined,
): entity is T {
  return entity != null && !entity.deletedAt;
}
