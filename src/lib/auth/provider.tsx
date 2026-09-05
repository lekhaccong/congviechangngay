import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoginScreen } from "@/components/auth/login-screen";
import { cacheProfile, fetchMyProfile, getCachedProfile, type CloudProfile } from "@/lib/supabase/profile";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";

/**
 * App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
 *
 *   <AuthProvider><Outlet /></AuthProvider>
 *
 * Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
 * its `useSession()` works standalone — so this is a passthrough today. It's
 * kept as the single, stable mount point for any future client-side providers
 * (e.g. a toast or theme provider) without churning the root shell.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(() => typeof localStorage === "undefined" ? null : getCachedProfile());
  const [ready, setReady] = useState(!supabaseConfigured);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let alive = true;
    const resolve = async (next: Session | null) => {
      if (!alive) return;
      setSession(next);
      if (!next) { setProfile(null); cacheProfile(null); setReady(true); return; }
      if (!navigator.onLine && getCachedProfile()?.id === next.user.id) { setProfile(getCachedProfile()); setReady(true); return; }
      try {
        const nextProfile = await fetchMyProfile();
        if (!nextProfile.active) { await client.auth.signOut(); setMessage("Tài khoản đã bị khóa."); return; }
        if (alive) setProfile(nextProfile);
      } catch { if (!getCachedProfile()) setMessage("Không đọc được hồ sơ tài khoản. Hãy kiểm tra kết nối mạng."); }
      finally { if (alive) setReady(true); }
    };
    void client.auth.getSession().then(({ data }) => resolve(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => { void resolve(next); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  if (!supabaseConfigured) return <>{children}</>;
  if (!ready) return <div className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">Đang kiểm tra tài khoản…</div>;
  if (!session || !profile?.active) return <LoginScreen message={message} />;
  return <>{children}</>;
}
