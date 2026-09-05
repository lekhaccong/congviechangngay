import type { Role } from "./types";

export type Perm =
  | "manage_people"
  | "manage_tasks"
  | "manage_goods"
  | "manage_ot"
  | "execute"
  | "attendance"
  | "backup"
  | "settings"
  | "view";

const MAP: Record<Role, Perm[]> = {
  ADMIN: [
    "manage_people",
    "manage_tasks",
    "manage_goods",
    "manage_ot",
    "execute",
    "attendance",
    "backup",
    "settings",
    "view",
  ],
  MANAGER: [
    "manage_people",
    "manage_tasks",
    "manage_goods",
    "manage_ot",
    "execute",
    "attendance",
    "view",
  ],
  EMPLOYEE: ["execute", "attendance", "view"],
  VIEWER: ["view"],
};

export function can(role: Role | null | undefined, perm: Perm): boolean {
  if (!role) return false;
  return MAP[role]?.includes(perm) ?? false;
}
