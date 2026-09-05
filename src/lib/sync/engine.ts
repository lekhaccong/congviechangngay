import { getDb } from "@/lib/cvp/db";
import type { SyncEntityType } from "@/lib/cvp/types";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { applyCloudRow, toCloud } from "./mapping";
import { retryDelay } from "./queue";
import { makeSyncOperation } from "./queue";
import { nid } from "@/lib/cvp/ids";

const ENTITIES: SyncEntityType[] = ["employees", "work_schedules", "schedule_adjustments", "attendance"];
let running = false; let timer: number | null = null; let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

async function setState(key: string, value: string) { await getDb().syncState.put({ key, value }); }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Repair schedule IDs produced by pre-Phase-1 Excel imports (`employeeId-date`). */
async function repairLegacyScheduleIds(): Promise<void> {
  const db = getDb();
  const legacyRows = await db.workSchedules.filter((row) => !UUID_PATTERN.test(row.id)).toArray();
  if (!legacyRows.length) return;
  await db.transaction("rw", db.workSchedules, db.syncQueue, async () => {
    for (const oldRow of legacyRows) {
      const row = { ...oldRow, id: nid(), updatedAt: Date.now() };
      await db.workSchedules.delete(oldRow.id);
      await db.workSchedules.put(row);
      const stale = await db.syncQueue.where("entityType").equals("work_schedules").filter((item) => item.entityId === oldRow.id).primaryKeys();
      if (stale.length) await db.syncQueue.bulkDelete(stale);
      await db.syncQueue.add(makeSyncOperation("work_schedules", row.id, "UPSERT", row));
    }
  });
}

/**
 * Backups made before Phase 1 do not contain a sync queue. After restore, child
 * rows can therefore be queued without their employee parent. Re-queue every
 * real referenced employee first and discard sample-only child operations.
 */
async function ensureReferencedEmployeesQueued(): Promise<void> {
  const db = getDb();
  const queue = await db.syncQueue.toArray();
  const childOperations = queue.filter((item) => item.entityType !== "employees");
  const employeeIds = new Set<string>();
  const invalidOperationIds: string[] = [];
  for (const operation of childOperations) {
    try {
      const payload = JSON.parse(operation.payload) as { employeeId?: string };
      if (payload.employeeId) employeeIds.add(payload.employeeId);
    } catch {
      invalidOperationIds.push(operation.id);
    }
  }
  const employees = (await db.employees.bulkGet([...employeeIds])).filter((row) => Boolean(row));
  const realEmployees = employees.filter((row) => !row!.sample);
  const realIds = new Set(realEmployees.map((row) => row!.id));
  for (const operation of childOperations) {
    try {
      const payload = JSON.parse(operation.payload) as { employeeId?: string };
      if (payload.employeeId && !realIds.has(payload.employeeId)) invalidOperationIds.push(operation.id);
    } catch { /* already marked above */ }
  }
  await db.transaction("rw", db.syncQueue, async () => {
    if (invalidOperationIds.length) await db.syncQueue.bulkDelete([...new Set(invalidOperationIds)]);
    const alreadyQueued = new Set(queue.filter((item) => item.entityType === "employees").map((item) => item.entityId));
    const parents = realEmployees.filter((row) => row && !alreadyQueued.has(row.id));
    if (parents.length) await db.syncQueue.bulkAdd(parents.map((row) => makeSyncOperation("employees", row!.id, "UPSERT", row)));
  });
}

async function ensureInitialSnapshot(): Promise<void> {
  const db = getDb();
  if (await db.syncState.get("initialSnapshotQueued")) return;
  const [employees, schedules, adjustments, attendance] = await Promise.all([
    db.employees.filter((row) => !row.sample).toArray(), db.workSchedules.toArray(), db.scheduleAdjustments.toArray(), db.attendance.filter((row) => !row.sample).toArray(),
  ]);
  const realEmployeeIds = new Set(employees.map((row) => row.id));
  const operations = [
    ...employees.map((row) => makeSyncOperation("employees", row.id, "UPSERT", row)),
    ...schedules.filter((row) => realEmployeeIds.has(row.employeeId)).map((row) => makeSyncOperation("work_schedules", row.id, "UPSERT", row)),
    ...adjustments.filter((row) => realEmployeeIds.has(row.employeeId)).map((row) => makeSyncOperation("schedule_adjustments", row.id, "UPSERT", row)),
    ...attendance.filter((row) => realEmployeeIds.has(row.employeeId)).map((row) => makeSyncOperation("attendance", row.id, "UPSERT", row)),
  ];
  await db.transaction("rw", db.syncQueue, db.syncState, async () => {
    if (operations.length) await db.syncQueue.bulkAdd(operations);
    await db.syncState.put({ key: "initialSnapshotQueued", value: String(Date.now()) });
  });
}

export async function pushPending(): Promise<void> {
  if (!supabase || !navigator.onLine || running) return;
  running = true; await setState("status", "SYNCING");
  const db = getDb();
  try {
    const queue = await db.syncQueue.where("nextRetryAt").belowOrEqual(Date.now()).sortBy("createdAt");
    let completed = 0;
    await setState("progress", `0/${queue.length}`);
    // Preserve foreign-key order and send rows in batches instead of one HTTP
    // request per calendar day.
    let dependencyFailed = false;
    for (const entityType of ENTITIES) {
      if (dependencyFailed) break;
      const entityQueue = queue.filter((item) => item.entityType === entityType);
      const latestById = new Map(entityQueue.map((item) => [item.entityId, item]));
      const latest = [...latestById.values()];
      for (let offset = 0; offset < latest.length; offset += 100) {
        const batch = latest.slice(offset, offset + 100);
        try {
          const deleted = batch.filter((item) => item.operation === "DELETE");
          if (deleted.length) {
            const { error } = await supabase.from(entityType).update({ deleted_at: new Date().toISOString() }).in("id", deleted.map((item) => item.entityId));
            if (error) throw error;
          }
          const upserts = batch.filter((item) => item.operation === "UPSERT");
          if (upserts.length) {
            const rows = await Promise.all(upserts.map((item) => toCloud(entityType, JSON.parse(item.payload))));
            const { error } = await supabase.from(entityType).upsert(rows, { onConflict: "id" });
            if (error) throw error;
          }
          const entityIds = new Set(batch.map((item) => item.entityId));
          await db.syncQueue.bulkDelete(entityQueue.filter((item) => entityIds.has(item.entityId)).map((item) => item.id));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const entityIds = new Set(batch.map((item) => item.entityId));
          const failed = entityQueue.filter((item) => entityIds.has(item.entityId));
          await db.syncQueue.bulkPut(failed.map((item) => {
            const attempts = item.attempts + 1;
            return { ...item, attempts, lastError: message, nextRetryAt: Date.now() + retryDelay(attempts) };
          }));
          await setState("lastError", message);
          dependencyFailed = true;
        }
        completed += batch.length;
        await setState("progress", `${Math.min(completed, queue.length)}/${queue.length}`);
      }
    }
    await setState("lastSyncedAt", String(Date.now()));
    await setState("status", (await db.syncQueue.count()) ? "ERROR" : "IDLE");
  } finally { running = false; }
}

export async function pullChanges(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const db = getDb();
  for (const entity of ENTITIES) {
    const cursorKey = `cursor:${entity}`; const cursor = Number((await db.syncState.get(cursorKey))?.value ?? 0);
    const { data, error } = await supabase.from(entity).select("*").gt("server_version", cursor).order("server_version", { ascending: true }).limit(1000);
    if (error) throw error;
    for (const row of data ?? []) await applyCloudRow(entity, row);
    const latest = (data ?? []).reduce((max, row) => Math.max(max, Number(row.server_version ?? 0)), cursor);
    if (latest !== cursor) await setState(cursorKey, String(latest));
  }
}

async function syncNow() {
  if (!navigator.onLine) return setState("status", "OFFLINE");
  try {
    await repairLegacyScheduleIds();
    await ensureReferencedEmployeesQueued();
    if (!(await getDb().syncState.get("initialSnapshotQueued"))) await pullChanges();
    await ensureInitialSnapshot(); await pushPending(); await pullChanges();
  } catch (error) { await setState("status", "ERROR"); console.error("[sync]", error); }
}

export function startSyncEngine(): () => void {
  if (!supabaseConfigured || !supabase) return () => {};
  const onOnline = () => { void syncNow(); }; const onFocus = () => { if (document.visibilityState === "visible") void syncNow(); };
  window.addEventListener("online", onOnline); document.addEventListener("visibilitychange", onFocus);
  channel = supabase.channel("phase1-sync").on("postgres_changes", { event: "*", schema: "public" }, () => { void pullChanges(); }).subscribe();
  timer = window.setInterval(() => { void syncNow(); }, 60_000); void syncNow();
  return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onFocus); if (timer) clearInterval(timer); if (channel && supabase) void supabase.removeChannel(channel); };
}
