import type { Role } from "@/lib/cvp/types";
import { supabase } from "./client";

export interface CloudProfile { id: string; employeeId: string | null; displayName: string; role: Role; active: boolean; }
const CACHE_KEY = "quan-ly-kho-e.profile";

export function getCachedProfile(): CloudProfile | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CloudProfile | null; } catch { return null; }
}
export function cacheProfile(profile: CloudProfile | null): void {
  if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile)); else localStorage.removeItem(CACHE_KEY);
}
export async function fetchMyProfile(): Promise<CloudProfile> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình");
  const { data, error } = await supabase.from("profiles").select("id, employee_id, display_name, role, active").single();
  if (error) throw error;
  const profile: CloudProfile = { id: data.id, employeeId: data.employee_id, displayName: data.display_name ?? "Người dùng", role: data.role, active: data.active };
  cacheProfile(profile); return profile;
}
