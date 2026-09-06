# 欢迎页 v5 改版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 欢迎页停留时长与背景视频实际时长自动同步（6s 兜底 / 20s 上限），视频播放完整后自动进入登录页。

**设计文档:** `docs/superpowers/specs/2026-09-06-welcome-screen-design.md`（v5 章节）

---

### Task 15: 停留时长同步视频

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: WelcomeScreen 增加 `stayMs` state 与元数据同步**

```tsx
const [stayMs, setStayMs] = useState(6000);
```

定时器 effect 改为依赖 `stayMs`：

```tsx
useEffect(() => {
  const timer = window.setTimeout(dismiss, stayMs);
  return () => window.clearTimeout(timer);
}, [dismiss, stayMs]);
```

`welcome-media` 视频增加内联处理器：

```tsx
onLoadedMetadata={(event) => {
  const duration = event.currentTarget.duration;
  if (Number.isFinite(duration) && duration > 0) {
    setStayMs(Math.min(Math.round(duration * 1000), 20000));
  }
}}
```

进度条 span 增加内联动画时长：

```tsx
<span className="welcome-progress" style={{ animationDuration: `${stayMs}ms` }} aria-hidden="true" />
```

- [ ] **Step 2: index.css 进度条注释更新**

`/* 6s 无延迟：与组件内 6 秒定时器同步走完 */` 改为 `/* 时长无延迟：由组件内联 animationDuration 与视频时长同步 */`（`animation` 行去掉固定 `6s` 改为 `both` 前的默认时长可保留占位值，内联样式覆盖）。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/WelcomeScreen.tsx src/index.css
git commit -m "feat: sync welcome stay duration to background video length"
```

---

### Task 16: 浏览器验证（v5）

- [ ] **Step 1: 临时 Playwright 脚本验证**

1. 视频加载后 `video.duration` ≈ 8.04s
2. 欢迎页在 ~8s（>7.5s、<10s）后才 detach，登录页出现
3. 进度条 `getComputedStyle().animationDuration` ≈ "8.042s"
4. 另开一页点击仍可提前进入
5. 无控制台报错

- [ ] **Step 2: 删除临时脚本，`git status` 确认除 `data/users.json` 外干净**
