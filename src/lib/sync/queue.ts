import { nid } from "../cvp/ids.ts";
import type { SyncEntityType, SyncOperation, SyncOperationType } from "../cvp/types.ts";

export function makeSyncOperation(entityType: SyncEntityType, entityId: string, operation: SyncOperationType, payload: unknown): SyncOperation {
  const now = Date.now();
  return { id: nid(), entityType, entityId, operation, payload: JSON.stringify(payload), attempts: 0, lastError: null, createdAt: now, nextRetryAt: now };
}

export function retryDelay(attempts: number): number {
  return Math.min(5 * 60_000, 2 ** Math.min(attempts, 20) * 1_000);
}
