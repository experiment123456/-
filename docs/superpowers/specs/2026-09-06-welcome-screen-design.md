# 欢迎页（Welcome Screen）设计文档

日期：2026-09-06
状态：已确认（用户批准）；同日 v2 改版获批，见文末「v2 改版」章节

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

---

## v2 改版（2026-09-06，已确认）

首版上线后用户提出四点改进：停留时间加长、新增中文主标题、背景与站内其他页面区分开、增加鼠标拖尾交互。

### 已确认决策

| 决策点 | 结论 |
|---|---|
| 默认停留时间 | 3 秒 → **6 秒**（点击 / Enter / Escape 仍可提前进入） |
| 主标题 | 新增中文大标题「欢迎进入密码实验室」，原英文品牌 "Lumora" 收进 eyebrow 行 |
| 背景 | **移除** `dark-curtain-loop.mp4` + `aurex-jellyfish-overlay.mp4` 两段视频（与 Ocean 仪表盘撞车），改为纯 Canvas 程序化生成，与站内所有页面区分 |
| 交互 | 鼠标移动出现发光粒子彗星拖尾；气泡被鼠标靠近时轻轻推开 |

### 背景画布设计（新增 `src/components/WelcomeAbyssCanvas.tsx`）

纯 Canvas 程序化绘制，零视频、零图片加载：

| 元素 | 行为 |
|---|---|
| 光柱 | 3~4 道自顶部斜射的光束，`lighter` 加法混合发光，角度与透明度随 sin 缓慢摆动 |
| 气泡 | 40 个大小/速度随机的气泡自下而上飘浮、左右轻摆，升顶后回收重生；鼠标 90px 范围内被径向推开 |
| 拖尾 | `pointermove` 采样轨迹点（保留 ~900ms 生命周期），每帧以发光圆点绘制，半径与透明度随年龄衰减，形成彗星尾；触屏滑动同样生效 |

工程要求：

- 复用 `ParticleVortexCanvas` 的既定模式：devicePixelRatio 适配、ResizeObserver 响应容器、卸载时 cancelAnimationFrame + 移除监听。
- `prefers-reduced-motion: reduce` 时只绘制一帧静态画面（光柱 + 气泡定格），不启动动画循环，不监听指针。

### 文字结构（v2）

```
Lumora · Cipher Laboratory    ← eyebrow（合并原品牌行）
欢迎进入密码实验室              ← 新主标题（特大号 + 青蓝发光，中文用系统无衬线）
在深海噪声之外，守住每一段密钥   ← 标语保留
点击任意位置进入               ← 呼吸提示保留
▁▁▁▁▁▁▁▁                      ← 进度条，动画时长同步改为 6s
```

### 文件清单（v2）

| 文件 | 改动 |
|---|---|
| `src/components/WelcomeAbyssCanvas.tsx` | 新增：交互式背景画布（约 150 行） |
| `src/components/WelcomeScreen.tsx` | 移除视频层与 scrim、接入画布、标题结构改版、定时器 3s→6s |
| `src/index.css` | 删除 `welcome-base/-media/-scrim/-jelly`，新增画布与中文标题样式，进度条 6s |

### 验证（v2 增补）

在原验证清单基础上：画布元素存在且页面无 `<video>`、主标题文本正确、自动进入时长约 6s、reduced-motion 下无拖尾无动画但静态画面正常。

---

## v3 改版（2026-09-06，已确认）

v2 的画布背景观感不佳，用户要求恢复 v1 的水母视频背景并稍作变化，其余 v2 内容（6 秒、中文主标题、拖尾交互）全部保留。

### 已确认决策

| 决策点 | 结论 |
|---|---|
| 背景 | 恢复 `dark-curtain-loop.mp4` + `aurex-jellyfish-overlay.mp4` 双视频（v1 结构） |
| 画布 | 保留气泡 + 鼠标拖尾叠在视频上方；**光柱移除**（叠视频会显乱） |
| 与 Ocean 仪表盘的区分 | ① 暗幕视频改用更深夜蓝滤镜（`hue-rotate(-8deg) brightness(0.72) contrast(1.12)`）② 新增青蓝 wash 罩染层 ③ 气泡 + 拖尾动态叠层 |
| 不变 | 中文主标题、6 秒定时、点击/键盘退出、reduced-motion 行为 |

### 分层结构（自下而上）

底色渐变 → `welcome-media`（暗幕视频，v3 滤镜）→ `welcome-wash`（青蓝罩染，新增）→ `welcome-jelly`（水母视频，v1 参数）→ 画布（气泡+拖尾）→ 文字层。

### 文件清单（v3）

| 文件 | 改动 |
|---|---|
| `src/components/WelcomeScreen.tsx` | 加回双视频层 + wash，画布移到视频上方 |
| `src/components/WelcomeAbyssCanvas.tsx` | 删除光柱绘制 |
| `src/index.css` | 恢复并调整视频层样式、新增 wash、画布/文字层 z-index 调整 |

### 验证（v3）

画布存在且在动、`<video>` 数量为 2、标题/时长/交互/reduced-motion/其他页刷新同 v2 清单。

---

## v4 改版（2026-09-06，已确认）

用户提供 "Synthetic Nature" 设计稿，确认**只替换背景视频源**，其余一切不动。

| 决策点 | 结论 |
|---|---|
| 背景视频 | 移除 `dark-curtain-loop.mp4` + `aurex-jellyfish-overlay.mp4` 双层，改为单层外链视频：`https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4`（autoPlay muted loop playsInline，object-cover） |
| 不变 | 深蓝底色渐变（视频加载失败兜底）、青蓝 wash、滤镜、气泡 + 拖尾画布、中文主标题、6 秒定时、点击/键盘退出 |
| poster | 移除（无对应本地海报，底色渐变承担加载兜底） |

### 文件清单（v4）

| 文件 | 改动 |
|---|---|
| `src/components/WelcomeScreen.tsx` | 删水母视频层，暗幕层改为新外链视频 |
| `src/index.css` | 删除 `.welcome-jelly` 规则 |

### 验证（v4）

新视频可播放（readyState ≥ 2）、`<video>` 数量为 1、画布在动、标题/时长/交互同 v3 清单。
