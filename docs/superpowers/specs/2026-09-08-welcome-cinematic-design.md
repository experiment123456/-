# 欢迎页电影感开场（深渊穿行）设计文档

- 日期：2026-09-08
- 状态：已与需求方逐节确认（视觉主角、分镜结构、色彩/粒子方案均已通过）
- 关联代码：`src/components/WelcomeScreen.tsx`、`src/components/WelcomeAbyssCanvas.tsx`、`src/components/ParticleVortexCanvas.tsx`、`src/App.tsx`、`src/index.css`

## 1. 背景与目标

现有欢迎页 = 云端背景视频 + 气泡画布 + 居中文字，观感平淡（需求方原话："太死气，没有设计感"）。

目标：把需求方提出的三个创意——①四周云雾散开显出微光、②镜头由远及近推向一个物体后浮现欢迎语、③图片画布从两侧向中间铺开后变清晰——整合为**一个 11 秒、一镜到底的电影感开场**，看完直接无缝飞入主页面。硬性要求：**成品必须足够美观**（通过色彩脚本、粒子、光效、缓动逐项保障，见 §4/§5）。

### 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 现有云端视频 | 保留，作为推进段（S1）的深海底层素材；永不阻塞时间轴 |
| 总时长 | 标准版 8–12s → 定为 ≈11s 固定时间轴 |
| 结尾 | 无缝飞入主页面（真实应用由小放大、由模糊变清晰） |
| 视觉主角 | 发光深海水母（呼应主应用水母/珊瑚礁视觉基因）+ 密文雨氛围（B+C 混搭） |
| 结构 | 方案一「深渊穿行」一镜到底，六幕连续运镜 |
| 色彩 | 青/紫/金三色相体系（需求方要求色彩丰富，不要全蓝青） |
| 粒子 | 移植 AI 导师（Ocean 仪表盘 `ParticleVortexCanvas`）的漩涡粒子效果 |
| 复播策略 | 沿用现状：刷新才播，不写 sessionStorage |

## 2. 成片分镜（≈11s，GSAP master timeline，一镜到底）

| 时间 | 幕（label） | 画面与运镜 |
|---|---|---|
| 0–1.2s | `awaken` 深渊初醒 | 近黑场。四周云雾缓慢流动合围，正中央一点青蓝微光呼吸脉动 |
| 1.2–4s | `descent` 冲入极光密文雨 | 雾向两侧滑散，镜头开始推进：十六进制密文列自屏幕深处向观者掠过（近大远小、速度模糊），**按列分配青/紫/金三色（极光雨）**；漩涡粒子绕镜头螺旋掠过（密度最高段）；视频层淡入至 35% 透明度做深海底层（暗化+青染滤镜） |
| 4–6.5s | `guardian` 水母现身 | 雨列变稀变暗让出焦点，发光水母自远处推近放大至约 45vh：伞盖青→紫渐变、搏动，触须贝塞尔飘摆、末端品红/金光点，生物发光脉动；粒子收拢成水母周围椭圆漩涡光环（AI 导师 hub 手感），气泡与尘埃多层视差 |
| 6.5–8.5s | `unfold` 帷幕·画布铺开 | 到达最近点：水母上移出画、光幕向两侧拉开，1 帧暖金光爆；9 格画布拼贴启动——8 张项目截图从两侧带 3D 透视（rotateY/位移/模糊）飞入，各拖一条青紫金循环彗尾，与中央发光核心格吸附成 3×3 画布（back.out(1.2) 轻微过冲回弹，模糊→清晰，吸附瞬间暖金闪光） |
| 8.5–10s | `decrypt` 解密标题 | 画布后退压暗成背景（scale 0.94 + 渐暗遮罩），「欢迎进入密码实验室」以解密动画逐字浮现（密文字符滚动→定格），字距 0.3em 收拢至 0.08em；眉题/标语/hint 次第亮起 |
| 10–11s | `reveal` 飞入主页面 | 镜头前推穿过画布（放大 + 景深模糊 + 青白金三色光晕），真实主页面自 scale 0.92 / blur(12px) 迎面放大至 scale 1 / 清晰，overlay 淡出卸载 |

**跳过机制**：任意时刻点击 / Enter / Space / Esc → 0.4s 青白快闪后直接进入主页面（沿用现有键盘监听模式与 `onDismiss` 契约）。

**文案沿用现有**：眉题 `Lumora · Cipher Laboratory`、标题「欢迎进入密码实验室」、标语「在深海噪声之外，守住每一段密钥。」、提示「点击任意位置进入」。

## 3. 素材与播放清单

- **视频**（沿用现有外链 MP4）：仅 S1 段底层，opacity ≤0.35，现有暗化滤镜 `saturate(1.05) brightness(0.72) contrast(1.12) hue-rotate(-8deg)` 不变。
- **拼贴截图 9 格**（全部本地已有，`public/active-theory/assets/`）：
  - `agent-cards/`：`capabilities.png`、`guide.png`、`launch.png`、`security.png`
  - `agent-details/`：`agent-workspace.png`、`cryptography-lab.png`、`interactive-guide.png`、`security-boundaries.png`
  - 中央第 9 格：发光核心格（径向渐变 + 项目徽标/「L」字素，程序化绘制，不用图片）
- 其余视觉元素（雾、密文雨、水母、粒子、气泡、尘埃、颗粒、光柱）全部程序化实时绘制，**无网络依赖**。

## 4. 美观保障清单

**色彩脚本——「青 / 紫 / 金」三色相体系**（背景恒定深蓝黑，保证丰富但不乱）：

| 色相 | 色值 | 用途 |
|---|---|---|
| 生物发光青 | `#7dd3fc / #a5f3fc` | 主光：水母主体、标题光晕、核心光 |
| 极光紫 | `#c084fc / #f0abfc` | 次级色：伞盖渐变根部、触须尖端光点、部分密文雨列 |
| 暖金 | `#ffca85` | 点睛：粒子高光、S3 光爆、拼贴吸附闪光 |

统一约束：发光元素亮度 ≥70%；背景锁 `#010b16 → #043047` 深蓝黑带。

**层次与质感**：
- 五层视差景深：远雾 < 视频底层 < 密文雨/粒子 < 水母 < 近景气泡尘埃；推进时近快远慢
- 光效：生物发光 shadowBlur、水母现身镜头微光晕、S3 开头 1 帧暖金光爆
- 质感：细胶片颗粒（opacity ≈0.03）+ 四角 vignette + 缓慢摆动的水下光柱
- 动效曲线：推进段 `expo.in`，铺开段 `back.out(1.2)`，GSAP 全程精调
- 字体动效：标题解密式浮现（复用 `DecryptedText`，`animateOn="view"` 挂载即触发）+ 青色光晕 text-shadow

**粒子系统（移植 `ParticleVortexCanvas`）**：
- 移植其绘制逻辑：previousX→previousY 拖尾线、shadowBlur 辉光、半径呼吸、**指针能量交互**（鼠标靠近→能量上升、粒子加速变亮）
- S1：粒子绕镜头螺旋掠过（漩涡×隧道结合）；S2–S4：收拢为水母周围椭圆漩涡光环（同 AI 导师 hub 构图）
- 配色按 AI 导师同款比例：≈12% 暖金，其余青/紫分配

## 5. 技术架构

```
App.tsx (reveal 状态: is-revealing → 主内容容器 scale/blur 过渡)
└── WelcomeScreen.tsx (重写; 保留 onDismiss/键盘跳过/leaving 契约, 新增 onReveal)
    ├── 深渊渲染器 canvas (改造自 WelcomeAbyssCanvas, 单实例单 rAF)
    │   └─ 雾团 / 极光密文雨 / 水母 / 漩涡粒子 / 气泡尘埃 / 颗粒 / vignette / 光柱
    ├── 拼贴层 (DOM: 9 格真实 <img> + GSAP transform/opacity/filter)
    ├── 文字层 (DecryptedText + 现有 welcome-content 样式改造)
    └── WelcomeCinematic 编排器 (GSAP master timeline, 六幕 label)
```

- **`WelcomeScreen.tsx`（重写）**：对外契约保留——`onDismiss()`；新增 `onReveal()`，在 `reveal` 幕开始时调用，App 给主内容根容器加 `is-revealing` class（scale 0.92→1 / blur 12→0 过渡 0.8s），随后 `onDismiss()` 卸载 overlay。现有 `onAnimationEnd` 卸载机制、`is-leaving` 逻辑、键盘监听保留。
- **移除**「视频时长决定停留时间」逻辑（`stayMs`/`onLoadedMetadata`），改为固定 11s 时间轴驱动；进度条改为时间轴进度。
- **Canvas 单渲染器**：所有程序化视觉在同一个 `<canvas>` 同一个 rAF 循环绘制；DPR 上限沿用 1.5；保留鼠标拖尾彩蛋；各幕参数由 GSAP timeline 通过进度插值驱动（渲染器暴露 `setPhase(progress)` 类接口，不用 GSAP 直接操作 canvas 内部对象）。
- **拼贴层**：9 格真实 `<img>`，GSAP 只动 transform/opacity/filter（合成层友好）；3×3 网格布局，飞入轨迹两侧对称。
- 依赖：仅新增使用 `gsap`（已在 package.json ^3.15.0），无新依赖。

## 6. 降级与容错

- **视频永不阻塞**：时间轴照跑；`canplay` 后才淡入。4s 内未就绪或 `error` → 永久改用程序化深海背景（径向渐变 + 光柱），视觉无缝。
- **断网可播**：拼贴截图与字体全本地，动画纯程序化。
- **prefers-reduced-motion**：跳过运镜，直接呈现「画布+标题」静态海报构图（复用 `decrypt` 幕终态），停留 ~2s 后淡入主页面；沿用现有 media query 机制。
- **弱机降载**：rAF 检测 <30fps 持续 2s → 关闭胶片颗粒/光柱、雨列与粒子数减半（一次性降级，不回弹）。
- **跳过**：任意时刻点击/Enter/Space/Esc → 0.4s 青白快闪 → `onReveal` + `onDismiss` 直进主页面。

## 7. 测试

- **新增 `scripts/welcome-qa.mjs`**（仿 `scripts/media-qa.mjs` 的 playwright-core 模式）：
  1. 加载页面，overlay 存在、z-index 正确
  2. 时间轴播放至各幕无 JS 报错
  3. 6 个时间点（0.5/2/5/7/9/10.5s）截帧非空、非纯黑
  4. 点击跳过后 overlay 卸载、主页面可交互
  5. route abort 模拟外链视频失败 → 时间轴仍完整走完
  6. `prefers-reduced-motion` 仿真截图验证海报式降级
- **手动验收**：连续刷新 3 次节奏一致；DevTools 4x CPU 降速完整跑一遍；11s 自动进入与点击跳过各验一遍；与 AI 导师界面的粒子手感对比。
- 现有 `npm run build`（tsc + vite）通过。

## 8. 明确不做（YAGNI）

- 不做声音/配乐（现有 home 音乐体系不与开场联动）
- 不做 sessionStorage 复播记忆
- 不做 WebGP/Three.js——Canvas 2D + GSAP 足够
- 不改登录页与主应用任何视觉
