export const APP_NAME = "Quản lý kho E";
export const APP_VERSION = "1.5.0";
export const DB_VERSION = 4;
export const BACKUP_VERSION = 1;

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

export type EmployeeStatus = "ACTIVE" | "LEAVE" | "SUSPENDED";

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EARLY_LEAVE"
  | "OVERTIME"
  | "CHECKED_IN";

export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "OVERDUE";

export type DataStatus =
  | "NEW"
  | "PROCESSING"
  | "ENOUGH"
  | "MISSING"
  | "PUSHED"
  | "COMPLETED";

export type GoodsStatus =
  | "WAITING"
  | "PREPARING"
  | "ENOUGH"
  | "MISSING"
  | "PROCESSING"
  | "COMPLETED";

export type LotStatus = "OPEN" | "PROCESSING" | "ENOUGH" | "CLOSED";

export type AbnormalStatus = "NEW" | "PROCESSING" | "RESOLVED" | "CLOSED";

export type AbnormalSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AmhStatus = "DECLARED" | "APPROVED" | "REJECTED" | "DONE";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "COMPLETE"
  | "CHECK_IN"
  | "CHECK_OUT"
  | "OT_CREATE"
  | "LOT_CLOSE"
  | "BACKUP"
  | "RESTORE"
  | "IMPORT"
  | "EXPORT"
  | "PHOTO"
  | "PROGRESS"
  | "HANDOVER"
  | "SHIFT_CHANGE"
  | "SHIFT_REVERT"
  | "ATTENDANCE_CONFIRM"
  | "OT_CONFIRM";

export type ModuleKey =
  | "employees"
  | "groups"
  | "shifts"
  | "workSchedules"
  | "scheduleAdjustments"
  | "attendance"
  | "workBlocks"
  | "tasks"
  | "checklists"
  | "checklistItems"
  | "photos"
  | "blobs"
  | "auditLogs"
  | "overtimes"
  | "amhs"
  | "dataItems"
  | "goodsItems"
  | "lots"
  | "lotClosures"
  | "threeS"
  | "abnormalities"
  | "notifications"
  | "settings"
  | "handovers";

export interface Employee {
  id: string;
  code: string;
  name: string;
  serialNumber: string;
  groupId: string;
  shiftId: string;
  status: EmployeeStatus;
  role: Role;
  phone?: string;
  note: string;
  sample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  order: number;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  order: number;
}

export type BusinessShiftCode = "M" | "M1" | "A" | "D" | "X" | "X5" | "X3" | "SM" | "SM1" | "S" | "SA" | "E" | "P" | "CK" | "RO" | "TS" | "O";

export interface WorkSchedule {
  id: string;
  employeeId: string;
  date: string;
  shiftCode: BusinessShiftCode;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export type ScheduleAdjustmentStatus = "ACTIVE" | "REVERTED";
export type ScheduleAdjustmentKind = "CHANGE" | "SWAP";

export interface ScheduleAdjustment {
  id: string;
  batchId: string;
  date: string;
  employeeId: string;
  originalShiftCode: BusinessShiftCode;
  adjustedShiftCode: BusinessShiftCode;
  kind: ScheduleAdjustmentKind;
  reason: string;
  status: ScheduleAdjustmentStatus;
  createdBy: string;
  createdAt: number;
  revertedAt: number | null;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  checkIn: number | null;
  checkOut: number | null;
  status: AttendanceStatus;
  otMinutes: number;
  note: string;
  actualShiftCode?: BusinessShiftCode;
  confirmedAt?: number;
  confirmedBy?: string;
  sample?: boolean;
  createdAt: number;
}

export type SyncEntityType = "employees" | "work_schedules" | "schedule_adjustments" | "attendance";
export type SyncOperationType = "UPSERT" | "DELETE";

export interface SyncOperation {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  payload: string;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  nextRetryAt: number;
}

export interface SyncState { key: string; value: string; }

export interface SyncConflict {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  localValue: string;
  serverValue: string;
  reason: string;
  createdAt: number;
  resolvedAt: number | null;
}

export interface WorkBlock {
  id: string;
  name: string;
  order: number;
}

export interface Task {
  id: string;
  name: string;
  blockId: string;
  assigneeId: string;
  date: string;
  shiftId: string;
  estimatedMinutes: number;
  deadline: number | null;
  reminderTime: number | null;
  status: TaskStatus;
  progress: number;
  note: string;
  sample?: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface Checklist {
  id: string;
  blockId: string;
  name: string;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  taskId: string | null;
  threeSId: string | null;
  label: string;
  done: boolean;
  completedAt: number | null;
  completedBy: string | null;
  photoId: string | null;
  note: string;
  order: number;
  sample?: boolean;
}

export interface Photo {
  id: string;
  ownerModule: string;
  ownerId: string;
  kind: string;
  blobId: string;
  note: string;
  createdAt: number;
}

export interface BlobRow {
  id: string;
  mime: string;
  data: Blob;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: AuditAction;
  module: string;
  recordId: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: number;
  date: string;
  shiftId: string | null;
}

export interface Overtime {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  type: string;
  note: string;
  ratePercent?: number;
  rateLabel?: string;
  attendanceConfirmedAt?: number;
  attendanceConfirmedBy?: string;
  sample?: boolean;
  createdAt: number;
}

export interface Amh {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  hours: number;
  status: AmhStatus;
  note: string;
  taskId: string | null;
  sample?: boolean;
  createdAt: number;
}

export interface DataItem {
  id: string;
  productCode: string;
  designCode: string;
  receivedAt: number;
  invoice: string;
  lot: string;
  quantity: number;
  status: DataStatus;
  note: string;
  sample?: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface GoodsItem {
  id: string;
  invoice: string;
  itemCode: string;
  productCode: string;
  lot: string;
  quantity: number;
  exportDate: string;
  status: GoodsStatus;
  note: string;
  sourceKind?: "SEA" | "AIR";
  destination?: string;
  confirmation?: string;
  containerCount?: number;
  looseQuantity?: string;
  warehouse?: string;
  sample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Lot {
  id: string;
  lotCode: string;
  invoice: string;
  productCode: string;
  date: string;
  quantity: number;
  status: LotStatus;
  sample?: boolean;
  createdAt: number;
}

export interface LotClosure {
  id: string;
  lotId: string;
  closedBy: string;
  closedAt: number;
  note: string;
  photoId: string | null;
}

export interface ThreeSRecord {
  id: string;
  date: string;
  shiftId: string;
  note: string;
  completedAt: number | null;
  sample?: boolean;
  createdAt: number;
}

export interface Abnormality {
  id: string;
  type: string;
  description: string;
  severity: AbnormalSeverity;
  detectedBy: string;
  detectedAt: number;
  handlerId: string | null;
  deadline: number | null;
  status: AbnormalStatus;
  linkedModule: string | null;
  linkedId: string | null;
  sample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  module: string;
  recordId: string | null;
  dueAt: number;
  read: boolean;
  createdAt: number;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface Handover {
  id: string;
  date: string;
  shiftId: string;
  createdBy: string;
  summary: string;
  note: string;
  createdAt: number;
}

export interface BackupManifest {
  app: string;
  backupVersion: number;
  createdAt: string;
  databaseVersion: number;
  imageCount: number;
  checksum: string;
  modules: ModuleKey[];
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  OVERDUE: "Quá hạn",
};

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  NEW: "Mới",
  PROCESSING: "Đang xử lý",
  ENOUGH: "Đủ",
  MISSING: "Thiếu",
  PUSHED: "Đã đẩy",
  COMPLETED: "Hoàn thành",
};

export const GOODS_STATUS_LABEL: Record<GoodsStatus, string> = {
  WAITING: "Chờ",
  PREPARING: "Đang chuẩn bị",
  ENOUGH: "Đủ",
  MISSING: "Thiếu",
  PROCESSING: "Đang xử lý",
  COMPLETED: "Hoàn thành",
};

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  OPEN: "Chưa chốt",
  PROCESSING: "Đang xử lý",
  ENOUGH: "Đủ",
  CLOSED: "Đã chốt",
};

export const ABNORMAL_STATUS_LABEL: Record<AbnormalStatus, string> = {
  NEW: "Mới",
  PROCESSING: "Đang xử lý",
  RESOLVED: "Đã xử lý",
  CLOSED: "Đóng",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Nghỉ",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  OVERTIME: "Làm thêm",
  CHECKED_IN: "Đã vào",
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Đang làm",
  LEAVE: "Nghỉ",
  SUSPENDED: "Tạm hoãn",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị",
  MANAGER: "Quản lý",
  EMPLOYEE: "Nhân sự",
  VIEWER: "Chỉ xem",
};

export const AMH_STATUS_LABEL: Record<AmhStatus, string> = {
  DECLARED: "Đã khai",
  APPROVED: "Duyệt",
  REJECTED: "Từ chối",
  DONE: "Xong",
};

export const SEVERITY_LABEL: Record<AbnormalSeverity, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

export const OT_TYPES = ["Ngày thường", "Cuối tuần", "Lễ", "Ca đêm", "AMH"] as const;

export const PHOTO_KINDS = [
  "Trước",
  "Trong quá trình",
  "Sau",
  "Bất thường",
  "Hàng",
  "Lot",
  "Khác",
] as const;

export const ABNORMAL_TYPES = [
  "DATA thiếu",
  "Hàng thiếu",
  "Lot lỗi",
  "3S / 3D",
  "Máy / thiết bị",
  "An toàn",
  "Khác",
] as const;
