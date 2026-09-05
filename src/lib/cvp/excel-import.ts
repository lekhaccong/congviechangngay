import JSZip from "jszip";
import { getDb } from "./db";
import { createEmployee, createOvertime, normalizeEmployeeCode, updateEmployee, upsertDataItem, writeAudit } from "./repo";
import { makeSyncOperation } from "@/lib/sync/queue";
import { cleanShiftCode } from "./business-shifts";
import { nid } from "./ids";
import { isInPlanningWeek, planningWeek } from "./planning-week";
import type { BusinessShiftCode, DataStatus, Employee, GoodsItem, GoodsStatus, Group, Shift, WorkSchedule } from "./types";

export type ExcelImportKind = "people" | "data" | "export" | "air" | "sea" | "ot";
type Cell = string | number | Date | null;
type Sheet = { name: string; rows: Cell[][] };

export type PersonImportRow = { code: string; name: string; position: string; phone: string; groupName: string };
export type ScheduleImportRow = { code: string; date: string; shiftCode: BusinessShiftCode };
export type DataImportRow = { productCode: string; designCode: string; invoice: string; lot: string; quantity: number; receivedAt: number; status: DataStatus; note: string };
export type ExportImportRow = { productCode: string; itemCode: string; invoice: string; lot: string; quantity: number; exportDate: string; status: GoodsStatus; note: string; sourceKind: "SEA" | "AIR"; destination: string; confirmation: string; containerCount: number; looseQuantity: string; warehouse: string };
export type OtImportRow = { code: string; name: string; startTime: string; endTime: string; type: string; note: string; date: string | null };
export type ImportRow = PersonImportRow | DataImportRow | ExportImportRow | OtImportRow;
export type ImportPreview = { sheetName: string; rows: ImportRow[]; scheduleRows?: ScheduleImportRow[]; skipped: number; warnings: string[] };

const text = (value: Cell | undefined) => value instanceof Date ? value.toLocaleDateString("en-CA") : String(value ?? "").trim();
const normalized = (value: Cell | undefined) => text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numberValue = (value: Cell | undefined) => Number(String(value ?? "").replace(/[,\s]/g, "")) || 0;
const codeValue = (value: Cell | undefined) => {
  const raw = text(value);
  return /^\d+$/.test(raw) ? raw.padStart(5, "0") : raw;
};

function toDate(value: Cell | undefined, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toLocaleDateString("en-CA");
  const raw = text(value);
  const ymd = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]!.padStart(2, "0")}-${ymd[3]!.padStart(2, "0")}`;
  const dmy = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) return `${dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return fallback;
}

function colIndex(ref: string): number {
  let out = 0;
  for (const char of ref.replace(/\d/g, "")) out = out * 26 + char.charCodeAt(0) - 64;
  return out - 1;
}

function excelDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

async function readWorkbook(file: File): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = async (path: string) => zip.file(path)?.async("text") ?? "";
  const parse = (source: string) => new DOMParser().parseFromString(source, "application/xml");
  const sharedDoc = parse(await xml("xl/sharedStrings.xml"));
  const shared = Array.from(sharedDoc.getElementsByTagName("si")).map((node) => Array.from(node.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const stylesDoc = parse(await xml("xl/styles.xml"));
  const customFormats = new Map(Array.from(stylesDoc.getElementsByTagName("numFmt")).map((n) => [Number(n.getAttribute("numFmtId")), n.getAttribute("formatCode") ?? ""]));
  const xfs = Array.from(stylesDoc.getElementsByTagName("cellXfs")[0]?.getElementsByTagName("xf") ?? []).map((n) => Number(n.getAttribute("numFmtId") ?? 0));
  const isDateFormat = (style: number) => {
    const id = xfs[style] ?? 0;
    return [14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47].includes(id) || /[dmy]/i.test(customFormats.get(id) ?? "");
  };
  const wb = parse(await xml("xl/workbook.xml"));
  const relDoc = parse(await xml("xl/_rels/workbook.xml.rels"));
  const relationships = new Map(Array.from(relDoc.getElementsByTagName("Relationship")).map((n) => [n.getAttribute("Id") ?? "", n.getAttribute("Target") ?? ""]));
  const result: Sheet[] = [];
  for (const node of Array.from(wb.getElementsByTagName("sheet"))) {
    const target = relationships.get(node.getAttribute("r:id") ?? "") ?? "";
    const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const doc = parse(await xml(path));
    const rows: Cell[][] = [];
    for (const row of Array.from(doc.getElementsByTagName("row"))) {
      const rowIndex = Number(row.getAttribute("r") ?? 1) - 1;
      const cells: Cell[] = rows[rowIndex] ?? [];
      for (const cell of Array.from(row.getElementsByTagName("c"))) {
        const index = colIndex(cell.getAttribute("r") ?? "A1");
        const type = cell.getAttribute("t");
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        const inline = Array.from(cell.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
        const value: Cell = type === "s" ? (shared[Number(raw)] ?? "") : type === "inlineStr" ? inline : type === "b" ? (raw === "1" ? "Có" : "Không") : raw === "" ? null : isDateFormat(Number(cell.getAttribute("s") ?? 0)) ? excelDate(Number(raw)) : Number.isFinite(Number(raw)) ? Number(raw) : raw;
        cells[index] = value;
      }
      rows[rowIndex] = cells;
    }
    result.push({ name: node.getAttribute("name") ?? "Sheet", rows });
  }
  return result;
}

function chooseSheet(sheets: Sheet[], kind: ExcelImportKind): Sheet | undefined {
  const targets: Record<ExcelImportKind, string[]> = { people: ["lich lam viec"], ot: ["lam them"], data: ["shoindata", "shohindata"], export: ["ke hoach"], air: ["air"], sea: ["w."] };
  const matched = sheets.find((sheet) => targets[kind].some((target) => normalized(sheet.name).includes(target)));
  // DATA bắt buộc đọc đúng sheet nghiệp vụ, không tự rơi sang sheet đầu tiên.
  return matched ?? (kind === "data" ? undefined : sheets[0]);
}

function headerRow(sheet: Sheet, required: string[]): number {
  return sheet.rows.slice(0, 35).findIndex((row) => required.every((term) => row.some((cell) => normalized(cell).includes(term))));
}

function findColumn(row: Cell[], aliases: string[]): number {
  return row.findIndex((cell) => aliases.some((alias) => normalized(cell).includes(alias)));
}

function parseTime(value: Cell | undefined): { startTime: string; endTime: string; type: string } | null {
  const raw = text(value);
  const match = raw.match(/(\d{1,2})\s*(?:h|:)\s*[-–—]\s*(\d{1,2})\s*(?:h|:)?/i);
  if (!match) return null;
  return { startTime: `${match[1]!.padStart(2, "0")}:00`, endTime: `${match[2]!.padStart(2, "0")}:00`, type: raw.replace(/\(.+?\)/, "").trim() || "OT Excel" };
}

function dateAtOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toLocaleDateString("en-CA");
}

function joinNote(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" · ");
}

function parseAirExport(sheet: Sheet, fallbackDate: string): ImportPreview {
  const headerIndex = headerRow(sheet, ["ngay xuat", "invoice"]);
  if (headerIndex < 0) throw new Error("Không nhận diện được tiêu đề kế hoạch Air");
  const headers = sheet.rows[headerIndex] ?? [];
  const dateCol = findColumn(headers, ["ngay xuat"]);
  const invoiceCol = findColumn(headers, ["invoice"]);
  // Mapping nghiệp vụ ưu tiên: G ngày, H invoice, N kiện, O box, W nhà máy.
  // Một số file cũ có tiêu đề Kiện/Box lệch sang U/V, nên giữ fallback theo header.
  const totalFallback = findColumn(headers, ["kien"]);
  const boxFallback = findColumn(headers, ["box"]);
  const factoryCol = 22; // W
  let currentDate = fallbackDate;
  let skipped = 0;
  const rows: ExportImportRow[] = [];
  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (row?.[6]) currentDate = toDate(row[6], currentDate);
    const invoice = text(row?.[invoiceCol]);
    if (!invoice) continue;
    const factory = text(row?.[factoryCol]);
    if (normalized(factory) !== "e") { skipped++; continue; }
    if (!currentDate || !isInPlanningWeek(currentDate, fallbackDate)) { skipped++; continue; }
    const quantity = numberValue(row?.[13]) || numberValue(row?.[totalFallback]);
    const box = numberValue(row?.[14]) || numberValue(row?.[boxFallback]);
    rows.push({
      productCode: invoice,
      itemCode: "AIR",
      invoice,
      lot: invoice,
      quantity,
      exportDate: currentDate,
      status: "WAITING",
      note: joinNote(["Kế hoạch Hàng Air", box ? `Box: ${box}` : ""]),
      sourceKind: "AIR",
      destination: "AIR",
      confirmation: "",
      containerCount: 0,
      looseQuantity: box ? String(box) : "",
      warehouse: factory,
    });
  }
  const week = planningWeek(fallbackDate);
  return { sheetName: sheet.name, rows, skipped, warnings: rows.length ? [] : [`Không có Hàng Air nhà máy E trong tuần ${week.start}–${week.end}.`] };
}

function parseSeaExport(sheets: Sheet[], fallbackDate: string): ImportPreview {
  const candidates = sheets.filter((sheet) => /^w[.\s]/i.test(sheet.name) && headerRow(sheet, ["invoice", "so kien"]) >= 0);
  if (!candidates.length) throw new Error("Không tìm thấy sheet tuần W.xx trong kế hoạch xuất hàng");
  const chosen = new Map<string, { sheet: Sheet; updated: number }>();
  for (const sheet of candidates) {
    const weekStartCell = sheet.rows[1]?.find((cell) => cell instanceof Date);
    const weekStart = toDate(weekStartCell, fallbackDate);
    const titleRow = sheet.rows[1] ?? [];
    const updatedLabel = titleRow.findIndex((cell) => normalized(cell).includes("cap nhat"));
    const updatedCell = updatedLabel >= 0 ? titleRow[updatedLabel + 1] : null;
    const updated = updatedCell instanceof Date ? updatedCell.getTime() : 0;
    const previous = chosen.get(weekStart);
    if (!previous || updated >= previous.updated) chosen.set(weekStart, { sheet, updated });
  }
  const rows: ExportImportRow[] = [];
  const destinationByConfirmation: Record<string, string> = {
    AT: "NAGOYA", NT: "NAGOYA", BT: "NAGOYA", ST: "NAGOYA", TT: "NAGOYA",
    HT: "HAKATA", KT: "USLAX-USLAX", CT: "CAVAN-CAVAN", UT: "USLAX-USLAX",
    WT: "SHEKOU", SS: "SHIMIZU", ET: "KEELUNG", MT: "MANILA", SP: "MANILA",
    WS: "MANZANILLO", LT: "LEAM CHABANG", VN: "SDVN",
  };
  let skipped = 0;
  for (const [weekStart, { sheet }] of chosen) {
    if (!isInPlanningWeek(weekStart, fallbackDate)) continue;
    const headerIndex = headerRow(sheet, ["invoice", "so kien"]);
    const headers = sheet.rows[headerIndex] ?? [];
    const dayCol = findColumn(headers, ["ngay"]);
    const confirmationCol = findColumn(headers, ["xac nhan"]);
    const destinationCol = findColumn(headers, ["cang den"]);
    const invoiceCol = findColumn(headers, ["invoice"]);
    const quantityCol = findColumn(headers, ["so kien"]);
    const totalCol = findColumn(headers, ["tong"]);
    const containerCol = findColumn(headers, ["cont 44"]);
    const looseCol = findColumn(headers, ["le"]);
    const checkCol = findColumn(headers, ["check"]);
    const noteCol = findColumn(headers, ["ghi chu"]);
    let currentDate = weekStart;
    let lastDestination = "";
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const day = normalized(row?.[dayCol]);
      const dayMatch = day.match(/^thu\s*(\d)$/);
      if (dayMatch) currentDate = dateAtOffset(weekStart, Math.max(0, Number(dayMatch[1]) - 2));
      else if (row?.[dayCol] instanceof Date) currentDate = toDate(row[dayCol], currentDate);
      if (text(row?.[destinationCol])) lastDestination = text(row[destinationCol]);
      const prefix = text(row?.[invoiceCol]);
      if (!prefix || !/^iv/i.test(prefix)) continue;
      const suffix = text(row?.[invoiceCol + 1]);
      const invoice = `${prefix}${suffix}`.replace(/\s+/g, "");
      const confirmation = text(row?.[confirmationCol]);
      const destination = text(row?.[destinationCol]) || destinationByConfirmation[confirmation] || lastDestination;
      if (!currentDate || !invoice) { skipped++; continue; }
      rows.push({
        productCode: confirmation || invoice,
        itemCode: destination || confirmation || invoice,
        invoice,
        lot: invoice,
        quantity: numberValue(row?.[quantityCol]),
        exportDate: currentDate,
        status: normalized(row?.[checkCol]) === "ok" ? "COMPLETED" : "WAITING",
        note: joinNote([`Sheet ${sheet.name}`, text(row?.[noteCol]), totalCol >= 0 && numberValue(row?.[totalCol]) ? `Tổng: ${numberValue(row?.[totalCol])}` : ""]),
        sourceKind: "SEA",
        destination,
        confirmation,
        containerCount: numberValue(row?.[containerCol]),
        looseQuantity: text(row?.[looseCol]),
        warehouse: "",
      });
    }
  }
  const week = planningWeek(fallbackDate);
  return { sheetName: `Tuần ${week.start}–${week.end}`, rows, skipped, warnings: rows.length ? [] : [`Không có kế hoạch xuất thường trong tuần ${week.start}–${week.end}.`] };
}

function parseExportWorkbook(sheets: Sheet[], fallbackDate: string): ImportPreview {
  const air = sheets.find((sheet) => normalized(sheet.name).includes("air"));
  return air ? parseAirExport(air, fallbackDate) : parseSeaExport(sheets, fallbackDate);
}

export async function previewExcelImport(file: File, kind: ExcelImportKind, fallbackDate: string): Promise<ImportPreview> {
  const sheets = await readWorkbook(file);
  if (kind === "air") {
    const sheet = sheets.find((item) => normalized(item.name).includes("air"));
    if (!sheet) throw new Error("Không tìm thấy sheet Hàng Air trong file");
    return parseAirExport(sheet, fallbackDate);
  }
  if (kind === "sea") return parseSeaExport(sheets, fallbackDate);
  if (kind === "export") return parseExportWorkbook(sheets, fallbackDate);
  const sheet = chooseSheet(sheets, kind);
  if (!sheet) throw new Error(kind === "data" ? "Không tìm thấy sheet Shoindata trong file Excel" : "Không tìm thấy sheet trong file Excel");
  const required = kind === "people" ? ["sbd", "ho"] : kind === "ot" ? ["sbd", "ca"] : kind === "data" ? ["ma san pham"] : ["invoice"];
  const headerIndex = headerRow(sheet, required);
  if (headerIndex < 0) throw new Error("Không nhận diện được dòng tiêu đề. Hãy dùng mẫu Excel đã cung cấp.");
  const headers = sheet.rows[headerIndex] ?? [];
  const column = (...aliases: string[]) => findColumn(headers, aliases);
  const code = column("sbd", "ma nhan vien"); const name = column("ho va ten", "ho ten");
  const product = column("ma san pham", "ma hang"); const design = column("thiet ke"); const invoice = column("invoice", "invoi", "san pham co the xuat");
  const lot = column("case no", "lot", "so lo"); const quantity = column("so kien", "so luong", "tong", "so luong acs"); const planDate = column("ngay pc", "ngay xuat", "ngay giao");
  const factory = column("nha may"); const actualDate = column("thuc te", "nhan qa"); const work = column("cong viec"); const shift = column("ca gio", "ca ");
  const position = column("vi tri"); const phone = column("dien thoai"); const group = column("nhom", "to", "group");
  const rows: ImportRow[] = []; let skipped = 0; const warnings: string[] = [];
  const scheduleRows: ScheduleImportRow[] = [];
  const sheetDate = sheet.rows.slice(0, 10).flat().find((cell): cell is Date => cell instanceof Date);
  let personnelTableStarted = false;
  for (const row of sheet.rows.slice(headerIndex + 1)) {
    if (!row?.some((cell) => text(cell))) continue;
    if (factory >= 0 && text(row[factory]) && normalized(row[factory]) !== "e") continue;
    if (kind === "people") {
      const employeeCode = codeValue(row[code]); const employeeName = text(row[name]);
      // Sheet "Lịch làm việc" còn có các bảng phụ lặp lại SBD ở phía dưới.
      // Dừng tại dòng trống đầu tiên sau bảng nhân sự để cột D của bảng phụ
      // (ví dụ giá trị "2") không ghi đè Vị trí/Nhóm thật ở dòng 4–23.
      if (personnelTableStarted && !employeeCode && !employeeName) break;
      if (!employeeCode || !employeeName) { skipped++; continue; }
      personnelTableStarted = true;
      const positionName = text(row[position >= 0 ? position : 3]).trim();
      rows.push({ code: employeeCode, name: employeeName, position: positionName, phone: text(row[phone >= 0 ? phone : 4]), groupName: positionName });
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
        if (!(headers[columnIndex] instanceof Date)) continue;
        const shiftCode = cleanShiftCode(row[columnIndex]);
        if (shiftCode) scheduleRows.push({ code: employeeCode, date: toDate(headers[columnIndex], fallbackDate), shiftCode });
      }
    } else if (kind === "ot") {
      const employeeCode = codeValue(row[code]);
      const timingText = shift >= 0 ? ([row[shift], row[shift + 1], row[shift + 2]].map(text).join(" ") as Cell) : row[work];
      const timing = parseTime(timingText);
      if (!employeeCode || !timing) { skipped++; continue; }
      rows.push({ code: employeeCode, name: text(row[name]), ...timing, note: text(row[work]), date: sheetDate ? toDate(sheetDate, fallbackDate) : fallbackDate });
    } else if (kind === "data") {
      // Theo mẫu thực tế, cột N (index 13) là điều kiện lấy dữ liệu.
      if (normalized(row[13]) !== "chua gui") { skipped++; continue; }
      const productCode = text(row[product]);
      if (!productCode) { skipped++; continue; }
      const inv = text(row[invoice]);
      rows.push({ productCode, designCode: text(row[design]), invoice: inv, lot: text(row[lot]) || text(row[design]) || inv, quantity: numberValue(row[quantity]), receivedAt: new Date(`${toDate(row[actualDate >= 0 ? actualDate : planDate], fallbackDate)}T00:00:00`).getTime(), status: "NEW", note: `Nhập Shoindata · Cột N: Chưa gửi${factory >= 0 ? ` · NM ${text(row[factory])}` : ""}` });
    }
  }
  if (!rows.length) warnings.push(kind === "data" ? "Không có dòng nào trong Shoindata có cột N = Chưa gửi." : "Không có dòng hợp lệ để nhập; hãy kiểm tra sheet và nhà máy E.");
  return { sheetName: sheet.name, rows, scheduleRows: kind === "people" ? scheduleRows : undefined, skipped, warnings };
}

export async function importPeople(rows: PersonImportRow[], groupId: string, shiftId: string, schedules: ScheduleImportRow[] = []): Promise<{ created: number; updated: number; scheduled: number }> {
  const db = getDb(); const existing = await db.employees.toArray(); const byCode = new Map(existing.map((item) => [normalizeEmployeeCode(item.code), item])); let created = 0; let updated = 0;
  const uniqueByCode = new Map<string, PersonImportRow>();
  for (const row of rows) {
    const normalizedCode = normalizeEmployeeCode(row.code);
    if (!uniqueByCode.has(normalizedCode)) uniqueByCode.set(normalizedCode, { ...row, code: normalizedCode });
  }
  const uniqueRows = [...uniqueByCode.values()];
  for (const row of uniqueRows) {
    const groupName = row.groupName.trim();
    let resolvedGroupId = groupId;
    if (groupName) {
      let found = await db.groups.filter((item) => item.name.trim().toLowerCase() === groupName.toLowerCase()).first();
      if (!found) { found = { id: nid(), name: groupName, order: (await db.groups.count()) + 1 }; await db.groups.add(found); }
      resolvedGroupId = found.id;
    }
    const old = byCode.get(row.code); const note = [row.position && `Vị trí: ${row.position}`].filter(Boolean).join(" · ");
    if (old) { await updateEmployee(old.id, { name: row.name, groupId: resolvedGroupId, shiftId, serialNumber: row.code, phone: row.phone, note }); updated++; }
    else { const createdRow = await createEmployee({ code: row.code, name: row.name, serialNumber: row.code, groupId: resolvedGroupId, shiftId, status: "ACTIVE", role: "EMPLOYEE", phone: row.phone, note }); byCode.set(row.code, createdRow); created++; }
  }
  // Sau khi mọi nhân sự đã được chuyển sang nhóm từ cột D, xóa các nhóm rỗng
  // cũ như "Nhóm 1", "Nhóm 2" hoặc "2" để màn Nhóm phản ánh đúng file Excel.
  const usedGroupIds = new Set((await db.employees.toArray()).map((item) => item.groupId));
  const obsoleteGroups = (await db.groups.toArray()).filter((item) => !usedGroupIds.has(item.id));
  if (obsoleteGroups.length) await db.groups.bulkDelete(obsoleteGroups.map((item) => item.id));
  const employees = await db.employees.toArray();
  const employeeByCode = new Map(employees.map((item) => [normalizeEmployeeCode(item.code), item]));
  const existingSchedules = await db.workSchedules.toArray();
  const scheduleByKey = new Map(existingSchedules.map((item) => [`${item.employeeId}|${item.date}`, item]));
  const scheduleRowsToSave: WorkSchedule[] = [];
  for (const schedule of schedules) {
    const employee = employeeByCode.get(normalizeEmployeeCode(schedule.code));
    if (!employee) continue;
    const now = Date.now();
    const old = scheduleByKey.get(`${employee.id}|${schedule.date}`);
    scheduleRowsToSave.push({ id: old?.id ?? `${employee.id}-${schedule.date}`, employeeId: employee.id, date: schedule.date, shiftCode: schedule.shiftCode, source: "Lịch làm việc Excel", createdAt: old?.createdAt ?? now, updatedAt: now });
  }
  if (scheduleRowsToSave.length) await db.transaction("rw", db.workSchedules, db.syncQueue, async () => {
    await db.workSchedules.bulkPut(scheduleRowsToSave);
    await db.syncQueue.bulkAdd(scheduleRowsToSave.map((row) => makeSyncOperation("work_schedules", row.id, "UPSERT", row)));
  });
  const scheduled = scheduleRowsToSave.length;
  await writeAudit({ action: "IMPORT", module: "employees", recordId: "excel", newValue: { created, updated, scheduled } }); return { created, updated, scheduled };
}

export async function importData(rows: DataImportRow[]): Promise<{ created: number; updated: number }> {
  const existing = await getDb().dataItems.toArray(); let created = 0; let updated = 0;
  for (const row of rows) { const old = existing.find((item) => item.productCode === row.productCode && item.designCode === row.designCode && item.invoice === row.invoice && item.lot === row.lot); await upsertDataItem({ ...row, id: old?.id }); old ? updated++ : created++; }
  await writeAudit({ action: "IMPORT", module: "dataItems", recordId: "excel", newValue: { created, updated } }); return { created, updated };
}

export async function importExport(rows: ExportImportRow[]): Promise<{ created: number; updated: number }> {
  const db = getDb();
  const existing = await db.goodsItems.toArray();
  const keyOf = (item: Pick<GoodsItem, "sourceKind" | "invoice" | "exportDate">) => `${item.sourceKind ?? ""}|${item.invoice}|${item.exportDate}`;
  const uniqueRows = [...new Map(rows.map((row) => [keyOf(row), row])).values()];
  const existingByKey = new Map(existing.map((item) => [keyOf(item), item]));
  // Bản cũ chưa lưu nguồn SEA/AIR: vẫn ghép theo invoice + ngày để tránh tạo trùng.
  const legacyByInvoiceDate = new Map(existing.map((item) => [`${item.invoice}|${item.exportDate}`, item]));
  let created = 0; let updated = 0; const now = Date.now();
  const toSave: GoodsItem[] = uniqueRows.map((row) => {
    const old = existingByKey.get(keyOf(row)) ?? legacyByInvoiceDate.get(`${row.invoice}|${row.exportDate}`);
    old ? updated++ : created++;
    return { ...row, id: old?.id ?? nid(), createdAt: old?.createdAt ?? now, updatedAt: now };
  });
  await db.transaction("rw", db.goodsItems, db.auditLogs, async () => {
    if (toSave.length) await db.goodsItems.bulkPut(toSave);
    await writeAudit({ action: "IMPORT", module: "goodsItems", recordId: "excel", newValue: { created, updated } });
  });
  return { created, updated };
}

export async function importOt(rows: OtImportRow[], employees: Employee[], date: string, shiftId: string): Promise<{ created: number; skipped: number }> {
  const db = getDb(); const existing = await db.overtimes.toArray(); let created = 0; let skipped = 0;
  for (const row of rows) { const employee = employees.find((item) => item.code === row.code); const workDate = row.date ?? date; if (!employee || existing.some((item) => item.employeeId === employee.id && item.date === workDate && item.startTime === row.startTime && item.endTime === row.endTime && item.type === row.type)) { skipped++; continue; } await createOvertime({ employeeId: employee.id, date: workDate, shiftId, startTime: row.startTime, endTime: row.endTime, type: row.type, note: row.note }); created++; }
  await writeAudit({ action: "IMPORT", module: "overtimes", recordId: "excel", newValue: { created, skipped } }); return { created, skipped };
}

export type ImportDialogOptions = { groups: Group[]; shifts: Shift[] };
