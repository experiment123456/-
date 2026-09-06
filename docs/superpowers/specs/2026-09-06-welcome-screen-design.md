# 欢迎页（Welcome Screen）设计文档

日期：2026-09-06
状态：已确认（用户批准）

## 背景与目标

打开网页时先展示一个全屏欢迎页，用户点击任意位置或等待 3 秒后自动进入登录页。
纯前端展示层，不承载业务功能。背景为蓝色海洋风格，与现有登录页（深海鲸鱼视频）
和 Ocean Dashboard（暗幕 + 水母视频）的视觉语言保持一致。

## 已确认的需求决策

| 决策点 | 结论 |
|---|---|
| 出现时机 | 每次打开/刷新页面都出现（无 sessionStorage 记忆） |
| 背景方案 | 海洋视频动态背景（本地素材，无外链） |
| 接入方式 | React 覆盖层（不新增路由、不改导航逻辑） |
| 自动进入 | 3 秒倒计时，或点击任意位置提前进入 |
| URL | 不占用（无 `#/welcome`），淡出后露出当前路由页（默认登录页） |

## 组件设计

新增 `src/components/WelcomeScreen.tsx`：

- 全屏覆盖层：`position: fixed; inset: 0; z-index: 60`（高于移动端菜单 z-50）。
- Props：`{ onDismiss: () => void }`。
- App.tsx 挂载方式：

```tsx
const [showWelcome, setShowWelcome] = useState(true);
...
{showWelcome && <WelcomeScreen onDismiss={() => setShowWelcome(false)} />}
```

不修改路由（`viewFromHash`）、导航与背景渲染分支。

## 视觉层次（自下而上）

| 层 | 内容 | 处理方式 |
|---|---|---|
| 底色 | 深蓝径向渐变 `#043047 → #021428 → #010c18` | 视频加载失败/未就绪时的兜底 |
| 视频 1 | `/assets/ocean/dark-curtain-loop.mp4` 深海暗幕 | 全屏 `object-fit: cover`，`opacity: .86` + `saturate(1.14) brightness(.82) contrast(1.08)`（仿 `oc2-hub-media`），poster 用 `dark-curtain-poster.jpg` |
| 压暗层 | 渐变 scrim | 保证文字可读（仿 `oc2-hub-scrim` 配方） |
| 视频 2 | `/assets/ocean/aurex-jellyfish-overlay.mp4` 水母 | `mix-blend-mode: screen; opacity: .58` + 微调滤镜（仿 `oc2-hub-jelly-media`） |
| 文字层 | 居中品牌内容 | 见下节 |

两个视频均为 `autoPlay muted loop playsInline`（静音自动播放全浏览器允许），`aria-hidden="true"`。

## 文字内容与动效

自上而下居中排布：

```
LUMORA CIPHER LABORATORY      ← eyebrow 小字，宽字距
Lumora                        ← 超大斜体标题（呼应首页 hero）
在深海噪声之外，守住每一段密钥   ← 标语（呼应登录页 auth-story）
点击任意位置进入               ← 呼吸闪烁提示
─────────────                 ← 3 秒走完的细进度条
```

- 进入动画：文字依次淡入上浮（纯 CSS animation，错开 transition-delay/animation-delay）。
- 退出动画：整体淡出 + 轻微放大（约 600ms ease），动画结束后卸载。
- 系统偏好 `prefers-reduced-motion: reduce` 时：跳过浮动/呼吸动画，仅保留简单淡入淡出；
  进度条隐藏，倒计时逻辑不变。

## 交互逻辑

- `useEffect` 内 `setTimeout(dismiss, 3000)`，卸载时清理。
- 覆盖层 `onClick` → 提前 `dismiss()`（并清除定时器）。
- 键盘 Enter/Escape 同样触发退出（无障碍）。
- `dismiss()` 置 `isLeaving = true` 触发 CSS 退出动画，`onAnimationEnd` 回调 `onDismiss()` 卸载组件。

## 文件清单

| 文件 | 改动 |
|---|---|
| `src/components/WelcomeScreen.tsx` | 新增：组件与交互（约 60 行） |
| `src/index.css` | 末尾追加 `welcome-*` 样式块 |
| `src/App.tsx` | +2 行：`showWelcome` state 与条件渲染 |

## 明确不做（YAGNI）

- 不做 sessionStorage/记忆逻辑
- 不新增路由或 QA 脚本
- 不加背景音乐/音效
- 不做跳过按钮（整屏可点击即等价）

## 验证方式

1. `npm run dev` 打开首页 → 欢迎页出现，背景两段视频均播放。
2. 等待 3 秒 → 自动淡出进入登录页。
3. 刷新后在欢迎页点击任意位置 → 立即淡出进入登录页。
4. 开启系统"减少动态效果"后刷新 → 无浮动/呼吸动画，淡入淡出正常。
5. 登录后跳转其他页面、刷新其他页面（如 `#/workbench`）→ 欢迎页仍先出现，淡出后回到原页面。
