# Lumora Cipher

密码学实验与双机安全通信平台。包含 Multiliteral、Autokey ciphertext、Playfair、Double-Transposition、CA / Rule 30、AES-256-GCM、SM2 / SM3、MD5 与 DH 密钥交换。

首页右上角可进入账户页，支持注册、登录、退出、昵称、背景自动轮播、水纹交互和减少动态效果等偏好。密码使用 scrypt 加盐摘要保存，会话使用 HttpOnly Cookie；实验明文、密钥和传输文件不会写入账户档案。用户数据默认保存在运行目录下的 `data/users.json`（已加入 `.gitignore`）。

“AI 创新”中包含独立的 Lumora Agent 中文界面。登录后可与千问流式对话，或让 Agent 打开 AES、DH、双机通信和算法档案页面，执行白名单限制的导航、高亮与教学演示。未配置千问 API Key 时自动使用本地演示模式，页面操作能力仍可测试；完整配置见 [AGENT-SETUP.md](AGENT-SETUP.md)。

## 本机开发

GitHub 获取源码：在[项目仓库](https://github.com/shintamelinda319-sys/lumora-cipher)点 **Code → Download ZIP** 后完整解压，或在终端执行 `git clone https://github.com/shintamelinda319-sys/lumora-cipher.git`，然后 `cd lumora-cipher`。不要只下载 `src`，登录视频、锁文件和后端也需要保留。GitHub 仅传代码不代表网页已部署；双机仍需配置共享中继。

给队友的完整解压、启动、媒体播放与故障排查说明见 [TEAM-SETUP.md](TEAM-SETUP.md)。Windows 可双击 `start-local.cmd`。需要 Node.js 24+；复现环境为 Node 24.19.0 / npm 11.17.0。

```powershell
npm ci
npm run dev
```

打开 `http://localhost:5173`。开发服务器已经集成 WebSocket 中继。

保持原版素材加载方式：首页四段 MP4 从原 CDN 地址在线播放，车窗图片和 Instrument Serif 字体使用原外链；登录鲸鱼视频/图片与音乐仍从 `public/assets` 本地加载。首次安装依赖及使用在线素材时需要联网。原始外链清单见 `public/assets/ONLINE-SOURCES.json`。

1.1.1 媒体修复：登录视频默认静音自动播放，点击底部“开启声音并播放”开启原视频音轨；进入首页/实验页后播放背景音乐，首次被浏览器拦截时点击音乐按钮或提示即可。手动暂停后会保持暂停。更新代码后重启开发服务；若使用 `npm start`，先重新 `npm run build`，再刷新页面。

如果 Windows PowerShell 阻止执行 `npm.ps1`，将命令中的 `npm` 改为 `npm.cmd` 即可。

## 双机运行

两台电脑使用新版源码，各自在本机启动网页：

```powershell
npm run dev
```

各自打开 `http://localhost:5173`。选择 A 作为中继，在 A 的“双机通信”里展开“本机作为中继：查看可分享地址”，例如 `ws://192.168.1.10:5173/ws`。**双方“中继服务器地址”都填写 A 的这个地址**，选择相反角色、填写相同房间码，然后连接、核对服务标识/会话指纹并接受算法。

同一局域网无需上线网站；A 保持运行且双方网络互通即可。跨网络需要双方可访问的公共中继/WSS 或既有互通 VPN，本项目没有自动公网部署。不要把 localhost 地址分享给对方，也不要直接在普通局域网 IP 的 HTTP 页面执行 AES/DH。具体步骤与排查见 [TEAM-SETUP.md](TEAM-SETUP.md)。

Windows 防火墙首次提示时需要允许 Node.js 访问专用网络。双机页面会依次完成 Socket 连接、DH 公钥交换和算法协商，然后开放消息与文件传输。

## 验收脚本

```powershell
npm run build
node scripts/crypto-qa.mjs
npm run test:unicode
npm run test:relay
npm run test:network
npm run test:media
npm run test:agent
npm run test:agent-api
```

`scripts/qa.mjs` 还会启动本机 Chrome，执行界面、双浏览器 Socket 消息与文件传输验收。

`test:network` 使用两个独立服务与浏览器上下文测试跨服务中文通信、文件及重连。新手动用例见 `test-data/中文与双机回归用例.md`。古典算法通过可逆 UTF-8 扩展处理中文；完整保留密文的 `LUMORA-UTF8-V1` 前缀才能解密。MD5 是摘要，不可解密。算法与通信仅供教学，古典扩展不提供现代加密安全性。

服务已运行时，可用下面的脚本回归登录、会话、毛玻璃、水纹性能上限和移动端布局：

```powershell
node scripts/auth-ripple-qa.mjs http://127.0.0.1:5173/
```

## 制作队友源码包（Windows）

```powershell
npm.cmd run pack:share
```

在线原版压缩包生成到 `release`（文件名含 `online-source`），保留源码、锁文件、原有本地素材与测试文件，排除额外下载的在线素材副本、账号数据、依赖、构建产物及缓存。无需将整个工作文件夹直接压缩。
