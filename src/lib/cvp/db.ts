import Dexie, { type Table } from "dexie";
import type {
  Abnormality,
  Amh,
  AppNotification,
  AppSetting,
  Attendance,
  AuditLog,
  BlobRow,
  Checklist,
  ChecklistItem,
  DataItem,
  Employee,
  GoodsItem,
  Group,
  Handover,
  Lot,
  LotClosure,
  Overtime,
  Photo,
  Shift,
  ScheduleAdjustment,
  Task,
  ThreeSRecord,
  WorkBlock,
  WorkSchedule,
  SyncConflict,
  SyncOperation,
  SyncState,
} from "./types";

export class CvpDB extends Dexie {
  employees!: Table<Employee, string>;
  groups!: Table<Group, string>;
  shifts!: Table<Shift, string>;
  workSchedules!: Table<WorkSchedule, string>;
  scheduleAdjustments!: Table<ScheduleAdjustment, string>;
  attendance!: Table<Attendance, string>;
  workBlocks!: Table<WorkBlock, string>;
  tasks!: Table<Task, string>;
  checklists!: Table<Checklist, string>;
  checklistItems!: Table<ChecklistItem, string>;
  photos!: Table<Photo, string>;
  blobs!: Table<BlobRow, string>;
  auditLogs!: Table<AuditLog, string>;
  overtimes!: Table<Overtime, string>;
  amhs!: Table<Amh, string>;
  dataItems!: Table<DataItem, string>;
  goodsItems!: Table<GoodsItem, string>;
  lots!: Table<Lot, string>;
  lotClosures!: Table<LotClosure, string>;
  threeS!: Table<ThreeSRecord, string>;
  abnormalities!: Table<Abnormality, string>;
  notifications!: Table<AppNotification, string>;
  settings!: Table<AppSetting, string>;
  handovers!: Table<Handover, string>;
  syncQueue!: Table<SyncOperation, string>;
  syncState!: Table<SyncState, string>;
  syncConflicts!: Table<SyncConflict, string>;

  constructor() {
    super("congviecpro");
    this.version(1).stores({
      employees: "id, code, groupId, shiftId, status, name",
      groups: "id, order",
      shifts: "id, order",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]",
      workBlocks: "id, order",
      tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId",
      checklistItems: "id, checklistId, taskId, threeSId, done",
      photos: "id, ownerModule, ownerId, createdAt",
      blobs: "id",
      auditLogs: "id, timestamp, module, recordId, date, shiftId, action",
      overtimes: "id, employeeId, date, shiftId",
      amhs: "id, employeeId, date, shiftId, status",
      dataItems: "id, productCode, invoice, lot, status",
      goodsItems: "id, invoice, productCode, lot, status, exportDate",
      lots: "id, lotCode, invoice, productCode, status, date",
      lotClosures: "id, lotId, closedAt",
      threeS: "id, date, shiftId",
      abnormalities: "id, status, detectedAt, linkedModule, linkedId",
      notifications: "id, dueAt, read",
      settings: "key",
      handovers: "id, date, shiftId",
    });

    // Migration checkpoint. Keep this explicit so future schema changes can
    // be added as version(3), version(4), ... without rewriting old data.
    this.version(2).stores({
      employees: "id, code, groupId, shiftId, status, name",
      groups: "id, order",
      shifts: "id, order",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]",
      workBlocks: "id, order",
      tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId",
      checklistItems: "id, checklistId, taskId, threeSId, done",
      photos: "id, ownerModule, ownerId, createdAt",
      blobs: "id",
      auditLogs: "id, timestamp, module, recordId, date, shiftId, action",
      overtimes: "id, employeeId, date, shiftId",
      amhs: "id, employeeId, date, shiftId, status",
      dataItems: "id, productCode, invoice, lot, status",
      goodsItems: "id, invoice, productCode, lot, status, exportDate",
      lots: "id, lotCode, invoice, productCode, status, date",
      lotClosures: "id, lotId, closedAt",
      threeS: "id, date, shiftId",
      abnormalities: "id, status, detectedAt, linkedModule, linkedId",
      notifications: "id, dueAt, read",
      settings: "key",
      handovers: "id, date, shiftId",
    });

    this.version(3).stores({
      employees: "id, code, groupId, shiftId, status, name",
      groups: "id, order",
      shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]",
      workBlocks: "id, order",
      tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId",
      checklistItems: "id, checklistId, taskId, threeSId, done",
      photos: "id, ownerModule, ownerId, createdAt",
      blobs: "id",
      auditLogs: "id, timestamp, module, recordId, date, shiftId, action",
      overtimes: "id, employeeId, date, shiftId",
      amhs: "id, employeeId, date, shiftId, status",
      dataItems: "id, productCode, invoice, lot, status",
      goodsItems: "id, invoice, productCode, lot, status, exportDate",
      lots: "id, lotCode, invoice, productCode, status, date",
      lotClosures: "id, lotId, closedAt",
      threeS: "id, date, shiftId",
      abnormalities: "id, status, detectedAt, linkedModule, linkedId",
      notifications: "id, dueAt, read",
      settings: "key",
      handovers: "id, date, shiftId",
    });

    this.version(4).stores({
      employees: "id, code, groupId, shiftId, status, name",
      groups: "id, order",
      shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]",
      scheduleAdjustments: "id, batchId, date, employeeId, status, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]",
      workBlocks: "id, order",
      tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId",
      checklistItems: "id, checklistId, taskId, threeSId, done",
      photos: "id, ownerModule, ownerId, createdAt",
      blobs: "id",
      auditLogs: "id, timestamp, module, recordId, date, shiftId, action",
      overtimes: "id, employeeId, date, shiftId",
      amhs: "id, employeeId, date, shiftId, status",
      dataItems: "id, productCode, invoice, lot, status",
      goodsItems: "id, invoice, productCode, lot, status, exportDate",
      lots: "id, lotCode, invoice, productCode, status, date",
      lotClosures: "id, lotId, closedAt",
      threeS: "id, date, shiftId",
      abnormalities: "id, status, detectedAt, linkedModule, linkedId",
      notifications: "id, dueAt, read",
      settings: "key",
      handovers: "id, date, shiftId",
    });

    // Chuyển tên bốn ca cũ, giữ nguyên id để toàn bộ chấm công/OT/task cũ vẫn liên kết đúng.
    this.version(5).stores({
      employees: "id, code, groupId, shiftId, status, name", groups: "id, order", shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]", scheduleAdjustments: "id, batchId, date, employeeId, status, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]", workBlocks: "id, order", tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId", checklistItems: "id, checklistId, taskId, threeSId, done", photos: "id, ownerModule, ownerId, createdAt", blobs: "id", auditLogs: "id, timestamp, module, recordId, date, shiftId, action", overtimes: "id, employeeId, date, shiftId", amhs: "id, employeeId, date, shiftId, status", dataItems: "id, productCode, invoice, lot, status", goodsItems: "id, invoice, productCode, lot, status, exportDate", lots: "id, lotCode, invoice, productCode, status, date", lotClosures: "id, lotId, closedAt", threeS: "id, date, shiftId", abnormalities: "id, status, detectedAt, linkedModule, linkedId", notifications: "id, dueAt, read", settings: "key", handovers: "id, date, shiftId",
    }).upgrade(async (tx) => {
      const names: Record<string, string> = { "Ca 1": "M", "Ca 2": "M1", "Ca 3": "A", "Ca 4": "D" };
      await tx.table("shifts").toCollection().modify((row) => { if (names[row.name]) row.name = names[row.name]; });
    });

    // Bổ sung đủ bảy ca và sắp đúng thứ tự, giữ id bốn ca cũ để không mất liên kết dữ liệu.
    this.version(6).stores({
      employees: "id, code, groupId, shiftId, status, name", groups: "id, order", shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]", scheduleAdjustments: "id, batchId, date, employeeId, status, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]", workBlocks: "id, order", tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId", checklistItems: "id, checklistId, taskId, threeSId, done", photos: "id, ownerModule, ownerId, createdAt", blobs: "id", auditLogs: "id, timestamp, module, recordId, date, shiftId, action", overtimes: "id, employeeId, date, shiftId", amhs: "id, employeeId, date, shiftId, status", dataItems: "id, productCode, invoice, lot, status", goodsItems: "id, invoice, productCode, lot, status, exportDate", lots: "id, lotCode, invoice, productCode, status, date", lotClosures: "id, lotId, closedAt", threeS: "id, date, shiftId", abnormalities: "id, status, detectedAt, linkedModule, linkedId", notifications: "id, dueAt, read", settings: "key", handovers: "id, date, shiftId",
    }).upgrade(async (tx) => {
      await tx.table("shifts").bulkPut([
        { id: "shift-1", name: "M", startTime: "06:00", endTime: "14:00", crossesMidnight: false, order: 1 },
        { id: "shift-2", name: "M1", startTime: "08:00", endTime: "17:00", crossesMidnight: false, order: 2 },
        { id: "shift-x5", name: "X5", startTime: "07:00", endTime: "16:00", crossesMidnight: false, order: 3 },
        { id: "shift-x", name: "X", startTime: "08:00", endTime: "17:00", crossesMidnight: false, order: 4 },
        { id: "shift-x3", name: "X3", startTime: "09:00", endTime: "18:00", crossesMidnight: false, order: 5 },
        { id: "shift-3", name: "A", startTime: "14:00", endTime: "22:00", crossesMidnight: false, order: 6 },
        { id: "shift-4", name: "D", startTime: "22:00", endTime: "06:00", crossesMidnight: true, order: 7 },
      ]);
    });

    // Sửa giờ M1 cho cả dữ liệu đã tồn tại mà không thay id/liên kết nghiệp vụ.
    this.version(7).stores({
      employees: "id, code, groupId, shiftId, status, name", groups: "id, order", shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]", scheduleAdjustments: "id, batchId, date, employeeId, status, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]", workBlocks: "id, order", tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId", checklistItems: "id, checklistId, taskId, threeSId, done", photos: "id, ownerModule, ownerId, createdAt", blobs: "id", auditLogs: "id, timestamp, module, recordId, date, shiftId, action", overtimes: "id, employeeId, date, shiftId", amhs: "id, employeeId, date, shiftId, status", dataItems: "id, productCode, invoice, lot, status", goodsItems: "id, invoice, productCode, lot, status, exportDate", lots: "id, lotCode, invoice, productCode, status, date", lotClosures: "id, lotId, closedAt", threeS: "id, date, shiftId", abnormalities: "id, status, detectedAt, linkedModule, linkedId", notifications: "id, dueAt, read", settings: "key", handovers: "id, date, shiftId",
    }).upgrade(async (tx) => {
      await tx.table("shifts").update("shift-2", { startTime: "06:00", endTime: "15:00" });
    });

    // Online Phase 1: thêm hàng đợi đồng bộ, không xóa hoặc thay thế dữ liệu nghiệp vụ local.
    this.version(8).stores({
      employees: "id, code, groupId, shiftId, status, name", groups: "id, order", shifts: "id, order",
      workSchedules: "id, employeeId, date, shiftCode, [employeeId+date]", scheduleAdjustments: "id, batchId, date, employeeId, status, [employeeId+date]",
      attendance: "id, employeeId, date, shiftId, [employeeId+date+shiftId]", workBlocks: "id, order", tasks: "id, blockId, assigneeId, date, shiftId, status, deadline",
      checklists: "id, blockId", checklistItems: "id, checklistId, taskId, threeSId, done", photos: "id, ownerModule, ownerId, createdAt", blobs: "id", auditLogs: "id, timestamp, module, recordId, date, shiftId, action", overtimes: "id, employeeId, date, shiftId", amhs: "id, employeeId, date, shiftId, status", dataItems: "id, productCode, invoice, lot, status", goodsItems: "id, invoice, productCode, lot, status, exportDate", lots: "id, lotCode, invoice, productCode, status, date", lotClosures: "id, lotId, closedAt", threeS: "id, date, shiftId", abnormalities: "id, status, detectedAt, linkedModule, linkedId", notifications: "id, dueAt, read", settings: "key", handovers: "id, date, shiftId",
      syncQueue: "id, entityType, entityId, createdAt, nextRetryAt, [entityType+entityId]",
      syncState: "key",
      syncConflicts: "id, entityType, entityId, createdAt, resolvedAt",
    }).upgrade(async (tx) => {
      await tx.table("employees").toCollection().modify((row) => {
        if (row.role === "LEADER") row.role = "MANAGER";
        if (row.role === "USER") row.role = "EMPLOYEE";
      });
    });
  }
}

let _db: CvpDB | null = null;

export function canUseDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function getDb(): CvpDB {
  if (!canUseDb()) {
    throw new Error("IndexedDB không khả dụng");
  }
  if (!_db) _db = new CvpDB();
  return _db;
}

export async function resetDatabase(): Promise<void> {
  const db = getDb();
  await db.delete();
  _db = null;
}
