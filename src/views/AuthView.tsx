import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { apiRequest, type AccountUser } from "../auth";

type AuthMode = "login" | "register";

export default function AuthView({ onAuthenticated }: { onAuthenticated: (user: AccountUser) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setError("");
    setConfirmPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await apiRequest<{ user: AccountUser }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, displayName, password, remember }),
      });
      onAuthenticated(payload.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法完成登录");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout min-h-0 flex-1">
      <section className="auth-story" aria-label="平台简介">
        <p className="eyebrow !text-cyan-100/55">ABYSSAL SECURITY / 01</p>
        <h1>在深海噪声之外，<br /><i>守住每一段密钥。</i></h1>
        <p>建立你的实验档案，保存沉浸式界面偏好与账户活动。算法输入、密钥和传输文件始终留在当前实验流程中。</p>
        <div className="auth-depth-line"><span />ENCRYPTION DEPTH · 2048 BIT</div>
      </section>

      <form
        className="auth-card"
        data-ripple-block
        style={{ backdropFilter: "blur(15px) saturate(125%)", WebkitBackdropFilter: "blur(15px) saturate(125%)" }}
        onSubmit={submit}
        aria-label={mode === "login" ? "登录账户" : "注册账户"}
      >
        <div className="auth-card-glow" aria-hidden="true" />
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow !text-cyan-50/45">SECURE ACCESS</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">{mode === "login" ? "欢迎归航" : "创建实验档案"}</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/45" style={{ fontFamily: "system-ui, sans-serif" }}>
              {mode === "login" ? "进入 Lumora Cipher 安全实验平台" : "注册后即可同步你的视觉与动效偏好"}
            </p>
          </div>
          <span className="auth-seal"><ShieldCheck /></span>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="账户操作">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => changeMode("login")}>登录</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} onClick={() => changeMode("register")}>注册</button>
        </div>

        <div className="mt-6 space-y-4" style={{ fontFamily: "system-ui, sans-serif" }}>
          {mode === "register" && (
            <label className="auth-field">
              <span>昵称</span>
              <span className="auth-input"><UserRound /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={24} placeholder="你希望显示的名字" required /></span>
            </label>
          )}
          <label className="auth-field">
            <span>用户名</span>
            <span className="auth-input"><UserRound /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={24} placeholder="3–24 位中文、字母或数字" required /></span>
          </label>
          <label className="auth-field">
            <span>密码</span>
            <span className="auth-input"><LockKeyhole /><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} placeholder="至少 8 位" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</button></span>
          </label>
          {mode === "register" && (
            <label className="auth-field">
              <span>确认密码</span>
              <span className="auth-input"><LockKeyhole /><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} placeholder="再次输入密码" required /></span>
            </label>
          )}
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-[11px] text-white/48" style={{ fontFamily: "system-ui, sans-serif" }}>
          <input className="auth-checkbox" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          在这台设备上保持登录
        </label>

        <div className="mt-4 min-h-5" aria-live="polite">
          {error && <p className="text-xs text-rose-200/90" style={{ fontFamily: "system-ui, sans-serif" }}>{error}</p>}
        </div>

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}
          <span>{busy ? "正在建立安全会话" : mode === "login" ? "进入实验平台" : "创建并进入"}</span>
          {!busy && <ArrowRight />}
        </button>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] leading-relaxed text-white/32" style={{ fontFamily: "system-ui, sans-serif" }}>
          <ShieldCheck className="h-3 w-3" /> 密码经 scrypt 加盐摘要保存，浏览器仅持有 HttpOnly 会话凭证
        </p>
      </form>
    </main>
  );
}
