import { useEffect, useState, type FormEvent } from "react";
import { Activity, CalendarDays, Film, LoaderCircle, LogOut, Save, ShieldCheck, SlidersHorizontal, UserRound, Waves } from "lucide-react";
import { apiRequest, type AccountSettings, type AccountUser, type ActivityItem } from "../auth";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function PreferenceSwitch({ checked, onChange, icon: Icon, title, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: typeof Waves;
  title: string;
  description: string;
}) {
  return (
    <label className="account-setting">
      <span className="account-setting-icon"><Icon /></span>
      <span className="min-w-0 flex-1"><b>{title}</b><small>{description}</small></span>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={`account-switch ${checked ? "is-on" : ""}`} aria-hidden="true"><i /></span>
    </label>
  );
}

export default function AccountView({ user, onUserChange, onLogout }: {
  user: AccountUser;
  onUserChange: (user: AccountUser) => void;
  onLogout: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [settings, setSettings] = useState<AccountSettings>(user.settings);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void apiRequest<{ activity: ActivityItem[] }>("/api/account/activity")
      .then((payload) => setActivity(payload.activity))
      .catch(() => setActivity([]));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const payload = await apiRequest<{ user: AccountUser }>("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName, settings }),
      });
      onUserChange(payload.user);
      setNotice("账户偏好已保存");
      const history = await apiRequest<{ activity: ActivityItem[] }>("/api/account/activity");
      setActivity(history.activity);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-panel panel-reveal soft-scroll h-full overflow-y-auto rounded-[28px]" data-ripple-block>
      <div className="account-header">
        <div className="account-avatar">{user.displayName.slice(0, 1).toLocaleUpperCase()}</div>
        <div>
          <p className="eyebrow">ACCOUNT / SECURE PROFILE</p>
          <h1 className="mt-1 text-3xl sm:text-5xl">{user.displayName}</h1>
          <p className="mt-1 text-xs text-white/38">@{user.username}</p>
        </div>
        <button className="secondary-button ml-auto" type="button" onClick={onLogout}><LogOut />退出登录</button>
      </div>

      <form className="account-grid" onSubmit={save}>
        <section className="account-section">
          <div className="account-section-title"><UserRound /><div><b>个人档案</b><small>用于区分实验使用者，不公开展示</small></div></div>
          <label className="field-label mt-5"><span>显示昵称</span><input className="field-control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={1} maxLength={24} required /></label>
          <label className="field-label mt-4"><span>用户名</span><input className="field-control" value={user.username} disabled /></label>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="account-stat"><CalendarDays /><span><small>创建时间</small><b>{formatDate(user.createdAt)}</b></span></div>
            <div className="account-stat"><Activity /><span><small>最近登录</small><b>{formatDate(user.lastLoginAt)}</b></span></div>
          </div>
        </section>

        <section className="account-section">
          <div className="account-section-title"><SlidersHorizontal /><div><b>沉浸式偏好</b><small>登录后在本账户中保持一致</small></div></div>
          <div className="mt-5 space-y-3">
            <PreferenceSwitch checked={settings.backgroundAutoplay} onChange={(checked) => setSettings((current) => ({ ...current, backgroundAutoplay: checked }))} icon={Film} title="背景自动轮播" description="视频结束后自动切换下一段风景" />
            <PreferenceSwitch checked={settings.ripplesEnabled} onChange={(checked) => setSettings((current) => ({ ...current, ripplesEnabled: checked }))} icon={Waves} title="水面交互" description="开启点击涟漪与指针滑动扰动" />
            <PreferenceSwitch checked={settings.reducedMotion} onChange={(checked) => setSettings((current) => ({ ...current, reducedMotion: checked }))} icon={ShieldCheck} title="减少动态效果" description="暂停装饰性漂浮与连续指针尾迹" />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? "正在保存" : "保存偏好"}</button>
            <span className="text-xs text-emerald-100/60" aria-live="polite">{notice}</span>
          </div>
        </section>

        <section className="account-section">
          <div className="account-section-title"><ShieldCheck /><div><b>安全边界</b><small>账户只承担必要的身份与偏好功能</small></div></div>
          <ul className="account-security-list">
            <li><span>01</span><p><b>scrypt 加盐摘要</b><small>服务端不保存可还原的明文密码</small></p></li>
            <li><span>02</span><p><b>HttpOnly 会话</b><small>脚本无法直接读取登录令牌</small></p></li>
            <li><span>03</span><p><b>实验数据隔离</b><small>明文、密钥与传输文件不写入账户档案</small></p></li>
          </ul>
        </section>

        <section className="account-section">
          <div className="account-section-title"><Activity /><div><b>账户活动</b><small>仅记录账户安全相关动作</small></div></div>
          <div className="account-timeline mt-5">
            {activity.length ? activity.slice(0, 6).map((item) => (
              <div key={item.id}><i /><span><b>{item.label}</b><small>{item.detail}</small></span><time>{formatDate(item.at)}</time></div>
            )) : <p className="text-xs text-white/35">暂无活动记录</p>}
          </div>
        </section>
      </form>
    </div>
  );
}
