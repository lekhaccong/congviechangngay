import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";

export function LoginScreen({ message }: { message?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  return <main className="grid min-h-dvh place-items-center bg-bg p-5 text-fg"><section className="w-full max-w-sm space-y-5 rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
    <div><p className="text-xs uppercase tracking-[0.14em] text-muted">Quản lý kho E</p><h1 className="mt-1 text-2xl font-semibold">Đăng nhập</h1><p className="mt-1 text-sm text-muted">Dùng tài khoản đã được quản trị viên tạo.</p></div>
    {message || errorMessage ? <p className="rounded-lg bg-surface-2 p-3 text-sm text-warn">{message || errorMessage}</p> : null}
    <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); if (!supabase) return; setBusy(true); setErrorMessage(""); const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); setBusy(false); if (error) setErrorMessage(error.message); }}>
      <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      <Field label="Mật khẩu"><Input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      <Button className="w-full" type="submit" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
    </form>
    <p className="text-xs text-muted">Sau lần đăng nhập đầu tiên, app vẫn mở dữ liệu đã lưu khi mất mạng và sẽ tự đồng bộ khi có mạng lại.</p>
  </section></main>;
}
