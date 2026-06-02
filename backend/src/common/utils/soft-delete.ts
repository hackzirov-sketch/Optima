/**
 * Keeps `isDeleted` and `deletedAt` in sync for entities that expose both fields.
 */
export interface SoftDeletableEntity {
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

export function applySoftDelete<T extends SoftDeletableEntity>(
  entity: T,
  deletedBy?: string,
): T {
  entity.isDeleted = true;
  entity.deletedAt = new Date();
  if (deletedBy !== undefined && 'deletedBy' in entity) {
    (entity as T & { deletedBy?: string }).deletedBy = deletedBy;
  }
  return entity;
}

export function isSoftDeleted(entity: SoftDeletableEntity | null | undefined): boolean {
  if (!entity) return true;
  return Boolean(entity.isDeleted || entity.deletedAt);
}

/** Type guard: entity exists and is not soft-deleted. */
export function isActiveEntity<T extends SoftDeletableEntity>(
  entity: T | null | undefined,
): entity is T {
  return entity != null && !entity.isDeleted && !entity.deletedAt;
}
