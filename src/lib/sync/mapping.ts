import { getDb } from "@/lib/cvp/db";
import type { Attendance, Employee, ScheduleAdjustment, SyncEntityType, WorkSchedule } from "@/lib/cvp/types";

export async function toCloud(entityType: SyncEntityType, value: unknown): Promise<Record<string, unknown>> {
  if (entityType === "employees") {
    const row = value as Employee; const group = await getDb().groups.get(row.groupId);
    return { id: row.id, sbd: row.code, name: row.name, group_name: group?.name ?? "", phone: row.phone ?? "", status: row.status, note: row.note, local_role: row.role, local_shift_id: row.shiftId, client_updated_at: new Date(row.updatedAt).toISOString(), deleted_at: null };
  }
  if (entityType === "work_schedules") {
    const row = value as WorkSchedule;
    return { id: row.id, employee_id: row.employeeId, work_date: row.date, shift_code: row.shiftCode, source: row.source, client_updated_at: new Date(row.updatedAt).toISOString(), deleted_at: null };
  }
  if (entityType === "schedule_adjustments") {
    const row = value as ScheduleAdjustment;
    return { id: row.id, batch_id: row.batchId, work_date: row.date, employee_id: row.employeeId, original_shift_code: row.originalShiftCode, adjusted_shift_code: row.adjustedShiftCode, kind: row.kind, reason: row.reason, status: row.status, created_by_name: row.createdBy, client_created_at: new Date(row.createdAt).toISOString(), reverted_at: row.revertedAt ? new Date(row.revertedAt).toISOString() : null, deleted_at: null };
  }
  const row = value as Attendance;
  return { id: row.id, employee_id: row.employeeId, work_date: row.date, manager_shift_id: row.shiftId, actual_shift_code: row.actualShiftCode ?? null, status: row.status, note: row.note, confirmed_at: row.confirmedAt ? new Date(row.confirmedAt).toISOString() : null, confirmed_by_name: row.confirmedBy ?? null, check_in: row.checkIn ? new Date(row.checkIn).toISOString() : null, check_out: row.checkOut ? new Date(row.checkOut).toISOString() : null, ot_minutes: row.otMinutes, client_created_at: new Date(row.createdAt).toISOString(), deleted_at: null };
}

function millis(value: string | null | undefined): number | null { return value ? new Date(value).getTime() : null; }

export async function applyCloudRow(entityType: SyncEntityType, row: Record<string, any>): Promise<void> {
  const db = getDb();
  if (row.deleted_at) {
    if (entityType === "employees") await db.employees.delete(row.id);
    else if (entityType === "work_schedules") await db.workSchedules.delete(row.id);
    else if (entityType === "schedule_adjustments") await db.scheduleAdjustments.delete(row.id);
    else await db.attendance.delete(row.id);
    return;
  }
  if (entityType === "employees") {
    let group = await db.groups.filter((item) => item.name.trim().toLowerCase() === String(row.group_name ?? "").trim().toLowerCase()).first();
    if (!group) { group = { id: `cloud-group-${crypto.randomUUID()}`, name: row.group_name || "Chưa phân nhóm", order: (await db.groups.count()) + 1 }; await db.groups.add(group); }
    await db.employees.put({ id: row.id, code: row.sbd, serialNumber: row.sbd, name: row.name, groupId: group.id, shiftId: row.local_shift_id ?? "shift-2", status: row.status, role: row.local_role ?? "EMPLOYEE", phone: row.phone ?? "", note: row.note ?? "", createdAt: millis(row.created_at) ?? Date.now(), updatedAt: millis(row.client_updated_at) ?? millis(row.updated_at) ?? Date.now() });
  } else if (entityType === "work_schedules") {
    await db.workSchedules.put({ id: row.id, employeeId: row.employee_id, date: row.work_date, shiftCode: row.shift_code, source: row.source, createdAt: millis(row.created_at) ?? Date.now(), updatedAt: millis(row.client_updated_at) ?? millis(row.updated_at) ?? Date.now() });
  } else if (entityType === "schedule_adjustments") {
    await db.scheduleAdjustments.put({ id: row.id, batchId: row.batch_id, date: row.work_date, employeeId: row.employee_id, originalShiftCode: row.original_shift_code, adjustedShiftCode: row.adjusted_shift_code, kind: row.kind, reason: row.reason ?? "", status: row.status, createdBy: row.created_by_name ?? "Cloud", createdAt: millis(row.client_created_at) ?? Date.now(), revertedAt: millis(row.reverted_at) });
  } else {
    await db.attendance.put({ id: row.id, employeeId: row.employee_id, date: row.work_date, shiftId: row.manager_shift_id, actualShiftCode: row.actual_shift_code ?? undefined, status: row.status, note: row.note ?? "", confirmedAt: millis(row.confirmed_at) ?? undefined, confirmedBy: row.confirmed_by_name ?? undefined, checkIn: millis(row.check_in), checkOut: millis(row.check_out), otMinutes: row.ot_minutes ?? 0, createdAt: millis(row.client_created_at) ?? Date.now() });
  }
}
