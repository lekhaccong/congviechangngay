import { getDb } from "@/lib/cvp/db";
import type { SyncEntityType } from "@/lib/cvp/types";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { applyCloudRow, toCloud } from "./mapping";
import { retryDelay } from "./queue";
import { makeSyncOperation } from "./queue";

const ENTITIES: SyncEntityType[] = ["employees", "work_schedules", "schedule_adjustments", "attendance"];
let running = false; let timer: number | null = null; let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

async function setState(key: string, value: string) { await getDb().syncState.put({ key, value }); }

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
    for (const operation of queue) {
      try {
        if (operation.operation === "DELETE") {
          const { error } = await supabase.from(operation.entityType).update({ deleted_at: new Date().toISOString() }).eq("id", operation.entityId);
          if (error) throw error;
        } else {
          const cloud = await toCloud(operation.entityType, JSON.parse(operation.payload));
          const { error } = await supabase.from(operation.entityType).upsert(cloud, { onConflict: "id" });
          if (error) throw error;
        }
        await db.syncQueue.delete(operation.id);
      } catch (error) {
        const attempts = operation.attempts + 1;
        await db.syncQueue.update(operation.id, { attempts, lastError: error instanceof Error ? error.message : String(error), nextRetryAt: Date.now() + retryDelay(attempts) });
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
