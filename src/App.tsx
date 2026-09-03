import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Braces, CircleUserRound, KeyRound, LogIn, Menu, Network, Play, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { apiRequest, type AccountUser } from "./auth";
import BackgroundRipples from "./components/BackgroundRipples";
import CatalogView from "./views/CatalogView";
import DhView from "./views/DhView";
import NetworkView from "./views/NetworkView";
import WorkbenchView from "./views/WorkbenchView";
import AccountView from "./views/AccountView";
import AuthView from "./views/AuthView";
import InnovationView from "./views/InnovationView";
import ImageLabView from "./views/ImageLabView";
import OceanDashboard from "./views/OceanDashboard";
import AgentExperience, { type AgentNavigateTarget } from "./components/AgentExperience";

type LabView = "workbench" | "dh" | "network" | "catalog" | "innovation";
type ModuleView = "image-lab" | "ocean";
type AppView = "home" | LabView | ModuleView | "agent" | "login" | "account";

const videos = [
  { label: "Golden Hour", src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081127_0992a171-d3c6-4978-8213-0ec5df8b6d63.mp4" },
  { label: "Still Water", src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_092026_dd05b805-ea0f-40b2-8c52-332b88502592.mp4" },
  { label: "Deep Woods", src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081042_df7202bf-bd80-4b2b-bbc6-1f09ba2870e9.mp4" },
  { label: "Quiet Dawn", src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_080959_4cac5234-3573-464e-a5b7-76b94b8a7d61.mp4" },
];

const navigation: Array<{ view: LabView; label: string; icon: typeof Braces }> = [
  { view: "workbench", label: "单机实验", icon: Braces },
  { view: "dh", label: "DH 交换", icon: KeyRound },
  { view: "network", label: "双机通信", icon: Network },
  { view: "catalog", label: "算法档案", icon: BookOpen },
  { view: "innovation", label: "AI 创新", icon: Sparkles },
];

const uiFont: CSSProperties = { fontFamily: "system-ui, sans-serif" };

function viewFromHash(): AppView {
  const value = location.hash.replace(/^#\/?/, "") as AppView;
  return ["workbench", "dh", "network", "catalog", "innovation", "image-lab", "ocean", "agent", "login", "account"].includes(value) ? value : "login";
}

function App() {
  const [view, setView] = useState<AppView>(() => viewFromHash());
  const [activeVideo, setActiveVideo] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginVideoNeedsAction, setLoginVideoNeedsAction] = useState(true);
  const [loginVideoMuted, setLoginVideoMuted] = useState(true);
  const [loginVideoPlaying, setLoginVideoPlaying] = useState(false);
  const [loginVideoError, setLoginVideoError] = useState(false);
  const [homeMusicEnabled, setHomeMusicEnabled] = useState(true);
  const [homeMusicPlaying, setHomeMusicPlaying] = useState(false);
  const [homeMusicNeedsAction, setHomeMusicNeedsAction] = useState(false);
  const [homeMusicError, setHomeMusicError] = useState(false);
  const timerRef = useRef<number | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const loginVideoRef = useRef<HTMLVideoElement | null>(null);
  const homeMusicRef = useRef<HTMLAudioElement | null>(null);
  const mediaViewRef = useRef(view);
  mediaViewRef.current = view;
  const musicEnabledRef = useRef(homeMusicEnabled);
  musicEnabledRef.current = homeMusicEnabled;
  const musicRequestRef = useRef(0);
  const loginRequestRef = useRef(0);
  const loginSoundRef = useRef(false);
  const isDarkContent = activeVideo === 2;
  const settings = user?.settings ?? { backgroundAutoplay: true, ripplesEnabled: true, reducedMotion: false };
  const isLoginView = view === "login";
  const isInnovationView = view === "innovation";
  const isImageLab = view === "image-lab";
  const isOcean = view === "ocean";
  const isModuleView = isImageLab || isOcean;
  const isAgentView = view === "agent";
  const isInnovationSurface = isInnovationView || isAgentView;

  const playLoginVideo = useCallback((video: HTMLVideoElement, withSound: boolean) => {
    const request = ++loginRequestRef.current;
    const current = () => loginRequestRef.current === request && loginVideoRef.current === video && mediaViewRef.current === "login";
    loginSoundRef.current = withSound;
    video.muted = !withSound;
    video.volume = 0.85;
    setLoginVideoMuted(!withSound);
    void video.play().then(() => {
      if (current()) setLoginVideoNeedsAction(video.muted);
    }).catch((reason: unknown) => {
      if (!current()) return;
      setLoginVideoNeedsAction(true);
      if (video.error || (reason instanceof DOMException && reason.name === "NotSupportedError")) {
        setLoginVideoError(true);
        return;
      }
      // An audible autoplay rejection must not leave the background as a poster.
      if (withSound) {
        loginSoundRef.current = false;
        video.muted = true;
        setLoginVideoMuted(true);
        void video.play().catch(() => { if (current()) setLoginVideoNeedsAction(true); });
      }
    });
  }, []);

  const playHomeMusic = useCallback(() => {
    const audio = homeMusicRef.current;
    if (!audio || mediaViewRef.current === "login" || !musicEnabledRef.current) return;
    const request = ++musicRequestRef.current;
    const current = () => musicRequestRef.current === request && mediaViewRef.current !== "login" && musicEnabledRef.current;
    if (audio.error) audio.load();
    audio.muted = false;
    audio.volume = 0.24;
    setHomeMusicError(false);
    void audio.play().then(() => {
      if (!current()) return;
      setHomeMusicNeedsAction(false);
      setHomeMusicError(false);
    }).catch((reason: unknown) => {
      if (!current() || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setHomeMusicNeedsAction(true);
      setHomeMusicError(Boolean(audio.error) || (reason instanceof DOMException && reason.name === "NotSupportedError"));
    });
  }, []);

  useEffect(() => {
    const update = () => setView(viewFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ user: AccountUser | null }>("/api/auth/me")
      .then((payload) => { if (!cancelled) setUser(payload.user); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [menuOpen]);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (!["login", "innovation", "ocean", "image-lab", "agent"].includes(view) && index === activeVideo) void video.play().catch(() => undefined);
      else video.pause();
    });
  }, [activeVideo, view]);

  useEffect(() => {
    const video = loginVideoRef.current;
    if (!video) return;
    if (view !== "login") {
      video.pause();
      return;
    }
    setLoginVideoError(false);
    playLoginVideo(video, loginSoundRef.current);
    return () => { loginRequestRef.current += 1; };
  }, [view, playLoginVideo]);

  useEffect(() => {
    const audio = homeMusicRef.current;
    if (!audio) return;

    if (view === "login" || !homeMusicEnabled) {
      musicRequestRef.current += 1;
      audio.pause();
      return;
    }
    playHomeMusic();
  }, [homeMusicEnabled, view, playHomeMusic]);

  useEffect(() => {
    if (view === "login" || !homeMusicEnabled || !homeMusicNeedsAction || homeMusicError) return;

    const resumeAfterGesture = (event: Event) => {
      // A sound-control click has its own handler. Starting in capture phase
      // would make that handler see "playing" and immediately pause it again.
      if (event.target instanceof Element && event.target.closest(".home-music-toggle, [data-music-control]")) return;
      playHomeMusic();
    };

    window.addEventListener("pointerup", resumeAfterGesture, { capture: true });
    window.addEventListener("keydown", resumeAfterGesture, { capture: true });
    return () => {
      window.removeEventListener("pointerup", resumeAfterGesture, true);
      window.removeEventListener("keydown", resumeAfterGesture, true);
    };
  }, [homeMusicEnabled, homeMusicNeedsAction, homeMusicError, view, playHomeMusic]);

  useEffect(() => {
    if (authChecked && view === "account" && !user) {
      location.hash = "login";
      setView("login");
    }
  }, [authChecked, user, view]);

  const toggleHomeMusic = () => {
    const audio = homeMusicRef.current;
    if (!audio) return;
    if (audio.paused || homeMusicNeedsAction || homeMusicError) {
      musicEnabledRef.current = true;
      setHomeMusicEnabled(true);
      playHomeMusic();
    } else {
      musicEnabledRef.current = false;
      musicRequestRef.current += 1;
      setHomeMusicEnabled(false);
      setHomeMusicNeedsAction(false);
      audio.pause();
    }
  };

  const navigate = (requested: AppView) => {
    const next = requested === "account" && !user ? "login" : requested;
    mediaViewRef.current = next;
    if (next !== "login") {
      loginRequestRef.current += 1;
      loginVideoRef.current?.pause();
      // Run in the navigation click, while browser user activation is available.
      if (musicEnabledRef.current) playHomeMusic();
    }
    if (next === "login") {
      musicRequestRef.current += 1;
      homeMusicRef.current?.pause();
    }
    setMenuOpen(false);
    if (next === "home") history.pushState(null, "", `${location.pathname}${location.search}`);
    else location.hash = next;
    setView(next);
  };

  const switchVideo = (index: number) => {
    if (index === activeVideo || isTransitioning) return;
    const selectedVideo = videoRefs.current[index];
    if (selectedVideo) selectedVideo.currentTime = 0;
    setIsTransitioning(true);
    setActiveVideo(index);
    timerRef.current = window.setTimeout(() => setIsTransitioning(false), 1000);
  };

  const authenticated = (account: AccountUser) => {
    setUser(account);
    setMenuOpen(false);
    // A successful sign-in is the explicit opt-in point for the home soundtrack.
    // Keep the ref in sync immediately so navigate() can start it in this turn.
    musicEnabledRef.current = true;
    setHomeMusicEnabled(true);
    navigate("home");
  };

  const logout = async () => {
    try {
      await apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      navigate("home");
    }
  };

  const playLoginVideoWithSound = () => {
    const video = loginVideoRef.current;
    if (!video) return;
    setLoginVideoError(false);
    if (video.error) video.load();
    playLoginVideo(video, true);
  };

  return (
    <section id="app-scene" className={`relative h-[100svh] w-full overflow-hidden bg-black text-white ${settings.reducedMotion ? "motion-reduced" : ""}`}>
      {isInnovationSurface ? (
        <div className={`absolute inset-0 z-0 ${isAgentView ? "bg-[#060808]" : "bg-[#06404b]"}`} aria-hidden="true" />
      ) : isModuleView ? (
        <div className="absolute inset-0 z-0" aria-hidden="true">
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 50% 0%, #043047 0%, #021428 62%, #010c18 100%)" }} />
          {isImageLab && !settings.reducedMotion && (
            <video
              className="il-bg-video"
              autoPlay
              muted
              loop
              playsInline
              poster="/assets/image-lab/lab-ambient-poster.jpg"
              src="/assets/image-lab/lab-ambient-loop.mp4"
            />
          )}
          {isImageLab && (
            <>
              <div className="cinematic-wash absolute inset-0" />
              <div className="film-grain absolute inset-0" />
            </>
          )}
        </div>
      ) : isLoginView ? (
        <>
          <div className="absolute inset-0 z-0 bg-[#01070d]" aria-hidden="true" />
          <img className="auth-whale-poster pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" src="/assets/abyss-whale-login.png" alt="" aria-hidden="true" />
          <video
            ref={loginVideoRef}
            className="auth-whale-video pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
            src="/assets/abyss-whale-login.mp4"
            poster="/assets/abyss-whale-login.png"
            autoPlay
            muted={loginVideoMuted}
            loop
            playsInline
            preload="auto"
            onCanPlay={(event) => {
              if (mediaViewRef.current === "login") playLoginVideo(event.currentTarget, loginSoundRef.current);
            }}
            onPlaying={(event) => {
              setLoginVideoPlaying(true);
              setLoginVideoError(false);
              setLoginVideoNeedsAction(event.currentTarget.muted);
            }}
            onPause={() => {
              setLoginVideoPlaying(false);
              if (mediaViewRef.current === "login") setLoginVideoNeedsAction(true);
            }}
            onError={() => { setLoginVideoError(true); setLoginVideoPlaying(false); }}
            aria-label="有声深海抹香鲸背景视频"
          />
          <div className="auth-ocean-wash pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
          <div className="auth-particles pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
          <div className="film-grain pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
          {(loginVideoNeedsAction || loginVideoError) && (
            <button className={`auth-sound-gate ${loginVideoError ? "is-error" : ""}`} type="button" onClick={playLoginVideoWithSound} data-ripple-block>
              <span>{loginVideoError ? <Play /> : <Volume2 />}</span>
              <span><b>{loginVideoError ? "重新加载背景视频" : "开启声音并播放"}</b><small>{loginVideoError ? "视频加载失败，请确认完整下载素材后重试" : loginVideoPlaying ? "画面正在播放，点击开启原视频声音" : "浏览器暂停了自动播放，点击恢复画面与声音"}</small></span>
            </button>
          )}
        </>
      ) : (
        <>
          <div className="absolute inset-0 z-0 bg-[#111]" aria-hidden="true" />
          {videos.map((video, index) => (
            <video
              key={video.src}
              ref={(element) => { videoRefs.current[index] = element; }}
              className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${activeVideo === index ? "opacity-100" : "opacity-0"}`}
              src={video.src}
              autoPlay muted playsInline
              preload={index === 0 ? "auto" : "metadata"}
              onCanPlay={(event) => { if (index === activeVideo) void event.currentTarget.play().catch(() => undefined); }}
              onEnded={() => {
                if (index !== activeVideo || !settings.backgroundAutoplay) return;
                const nextIndex = (index + 1) % videos.length;
                const nextVideo = videoRefs.current[nextIndex];
                if (nextVideo) nextVideo.currentTime = 0;
                setIsTransitioning(true);
                setActiveVideo(nextIndex);
                timerRef.current = window.setTimeout(() => setIsTransitioning(false), 1000);
              }}
              aria-label={`${video.label} ambient background`}
            />
          ))}
          <div className="cinematic-wash absolute inset-0 z-[1]" aria-hidden="true" />
          <img className="train-bob pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover" src="https://soft-zoom-63098134.figma.site/_assets/v11/0b4a435b2df2747593c43d7a1c9b4578f7d8d90c.png" alt="" aria-hidden="true" />
          <div className="film-grain pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
        </>
      )}

      {(view === "home" || view === "login") && <BackgroundRipples active={settings.ripplesEnabled && !settings.reducedMotion} intensity={view === "login" ? 1.22 : 1} />}

      {isInnovationView ? (
        <div className="absolute inset-0 z-[3]">
          <InnovationView
            onNavigate={navigate}
            musicPlaying={homeMusicPlaying}
            musicNeedsAction={homeMusicNeedsAction}
            onToggleMusic={toggleHomeMusic}
          />
        </div>
      ) : isModuleView ? (
        <div className="absolute inset-0 z-[3] overflow-y-auto">
          {isImageLab && <ImageLabView onNavigate={navigate} />}
          {isOcean && <OceanDashboard onNavigate={navigate} />}
        </div>
      ) : isAgentView ? null : (
      <div className="relative z-[3] flex h-full flex-col px-4 py-4 sm:px-7 sm:py-6 lg:px-10 lg:py-7 xl:px-14">
        <nav className="flex shrink-0 items-center justify-between gap-3 text-white" aria-label="主导航" data-ripple-block>
          <button type="button" className="group flex items-center gap-3 text-left" onClick={() => navigate("home")} aria-label="返回首页">
            {view !== "home" && <span className="liquid-glass grid h-9 w-9 place-items-center rounded-full transition group-hover:-translate-x-0.5"><ArrowLeft className="h-4 w-4" /></span>}
            <span><b className="block text-xl font-normal italic tracking-[-0.02em] sm:text-2xl">Lumora</b>{view !== "home" && <small className="hidden text-[9px] uppercase tracking-[0.25em] text-white/45 sm:block">Cipher Laboratory</small>}</span>
          </button>

          <div className="liquid-glass hidden items-center gap-1 rounded-full p-1.5 md:flex" style={uiFont}>
            {navigation.map((item) => (
              <button key={item.view} type="button" data-agent-id={`nav.${item.view}`} onClick={() => navigate(item.view)} className={`rounded-full px-4 py-2 text-sm transition-colors duration-300 lg:px-5 ${view === item.view ? "bg-white/12 text-white" : "text-white/75 hover:text-white"}`}>
                {item.label}
              </button>
            ))}
            <button className="ml-1 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#1d2428] transition duration-300 hover:scale-[1.02] hover:bg-white/90" type="button" onClick={() => navigate("workbench")}>开始实验</button>
          </div>

          <div className="flex items-center gap-2" style={uiFont}>
            {view !== "login" && (
              <button
                className={`home-music-toggle liquid-glass grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/10 ${homeMusicPlaying ? "is-playing" : ""} ${homeMusicNeedsAction ? "needs-action" : ""}`}
                type="button"
                data-music-control
                onClick={toggleHomeMusic}
                aria-label={homeMusicError ? "重新加载背景音乐" : homeMusicPlaying ? "暂停舒缓背景音乐" : "播放舒缓背景音乐"}
                title={homeMusicError ? "音乐加载失败，点击重试" : homeMusicNeedsAction ? "点击开启舒缓音乐" : homeMusicPlaying ? "暂停舒缓音乐" : "播放舒缓音乐"}
              >
                {homeMusicPlaying ? <Volume2 className="h-4 w-4" /> : homeMusicNeedsAction ? <Play className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}
            <button className="liquid-glass hidden h-11 items-center gap-2 rounded-full px-3 text-xs text-white/82 transition hover:bg-white/10 md:flex xl:px-4" type="button" onClick={() => navigate(user ? "account" : "login")} aria-label={user ? "打开账户中心" : "登录账户"}>
              {user ? <CircleUserRound className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              <span className="hidden xl:inline">{user ? user.displayName : "登录"}</span>
            </button>
            <button className="liquid-glass relative grid h-11 w-11 place-items-center rounded-full md:hidden" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen}>
              <Menu className={`absolute h-5 w-5 transition-all duration-300 ${menuOpen ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
              <X className={`absolute h-5 w-5 transition-all duration-300 ${menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"}`} />
            </button>
          </div>
        </nav>

        {view === "home" ? (
          <>
            <main className="flex min-h-0 flex-1 items-center justify-center pb-2 pt-4 sm:pt-7 lg:pb-5">
              <div className={`hero-theme w-full text-center ${isDarkContent ? "dark-content" : "light-content"}`}>
                <div className="hero-reveal mx-auto flex max-w-5xl flex-col items-center" data-ripple-block>
                  <div className="liquid-glass mb-5 rounded-full px-4 py-2 sm:mb-7 sm:px-5" style={uiFont}>
                    <span className="flex items-center gap-2 text-[11px] font-medium sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />7 类密码 · MD5 · DH · Socket 双机安全通信</span>
                  </div>
                  <h1 className="max-w-4xl text-4xl leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-7xl lg:text-[5.5rem] lg:leading-[1.02]">
                    Security in an Endlessly<span className="block italic">Connected Universe</span>
                  </h1>
                  <div className="liquid-glass mt-6 flex items-center gap-1.5 rounded-full p-1.5 sm:mt-8" style={uiFont}>
                    <button className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#1d2428] transition duration-300 hover:scale-[1.02] hover:bg-white/90" type="button" onClick={() => navigate("workbench")}>进入单机实验台</button>
                    <button className="flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition hover:bg-white/10" type="button" onClick={() => navigate("network")}>双机通信 <ArrowRight className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-6 flex max-w-full items-center gap-3 overflow-x-auto px-3 pb-1 sm:mt-8 sm:gap-6" style={uiFont}>
                    {videos.map((video, index) => (
                      <button key={video.label} className={`shrink-0 border-b pb-2 text-[11px] transition-all duration-300 sm:text-xs ${activeVideo === index ? "active-video border-current opacity-100" : "border-transparent opacity-50 hover:opacity-80"}`} type="button" onClick={() => switchVideo(index)} disabled={isTransitioning && activeVideo !== index} aria-pressed={activeVideo === index}>{video.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </main>

            <footer className="flex shrink-0 flex-col items-center justify-end gap-3 text-white sm:gap-4" style={uiFont} data-ripple-block>
              <p className="max-w-3xl px-4 text-center text-xs leading-relaxed text-white/85 sm:text-sm lg:text-base">
                从古典替代密码到 SM2 公钥体系，在同一个沉浸式实验平台中完成加解密、密钥交换与双机传输。
              </p>
              <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-white/70 sm:text-xs lg:gap-x-6 lg:text-sm">
                {navigation.map((item, index) => {
                  const Icon = item.icon;
                  const captions = ["8 项完整算法", "MODP 2048-bit", "消息与文件传输", "实现原理与索引", "动态海洋概念"];
                  return <div className="flex items-center gap-x-3 lg:gap-x-6" key={item.view}>{index > 0 && <span className="hidden text-white/30 sm:inline">|</span>}<button className="footer-entry group flex items-center gap-2" type="button" onClick={() => navigate(item.view)}><Icon className="h-3.5 w-3.5 opacity-60" /><span><b className="font-medium">{item.label}</b><small className="ml-1.5 opacity-55">{captions[index]}</small></span></button></div>;
                })}
              </div>
            </footer>
          </>
        ) : view === "login" ? (
          <AuthView onAuthenticated={authenticated} />
        ) : (
          <main className={`min-h-0 flex-1 py-3 sm:py-5 ${view === "dh" ? "flex items-center justify-center" : ""}`}>
            {view === "workbench" && <WorkbenchView />}
            {view === "dh" && <DhView />}
            {view === "network" && <NetworkView />}
            {view === "catalog" && <CatalogView onOpen={navigate} />}
            {view === "account" && user && <AccountView user={user} onUserChange={setUser} onLogout={() => { void logout(); }} />}
          </main>
        )}
      </div>
      )}

      <AgentExperience
        mode={isLoginView ? "hidden" : isAgentView ? "studio" : "dock"}
        userId={user?.id}
        userName={user?.displayName}
        onNavigate={(target: AgentNavigateTarget) => navigate(target)}
      />

      <div className={`fixed inset-0 z-50 md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!menuOpen} data-ripple-block>
        <div className={`absolute inset-0 bg-[#101516]/45 backdrop-blur-lg transition-opacity duration-500 ${menuOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${menuOpen ? "opacity-100" : "opacity-0"}`} style={uiFont}>
          <button className="mb-4 text-sm uppercase tracking-[0.25em] text-white/45" type="button" onClick={() => navigate("home")}>Lumora Cipher</button>
          {navigation.map((item, index) => { const Icon = item.icon; return <button key={item.view} type="button" onClick={() => navigate(item.view)} className={`flex items-center gap-3 text-3xl text-white transition-all duration-500 ${menuOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`} style={{ transitionDelay: menuOpen ? `${100 + index * 50}ms` : "0ms" }}><Icon className="h-5 w-5 opacity-50" />{item.label}</button>; })}
          <button type="button" onClick={() => navigate(user ? "account" : "login")} className={`mt-2 flex items-center gap-3 text-2xl text-cyan-50/85 transition-all duration-500 ${menuOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}><CircleUserRound className="h-5 w-5 opacity-60" />{user ? "账户中心" : "登录账户"}</button>
        </div>
        <button type="button" className={`liquid-glass !absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full text-white transition-all duration-500 ${menuOpen ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} onClick={() => setMenuOpen(false)} aria-label="关闭导航"><X className="h-5 w-5" /></button>
      </div>

      {!isLoginView && homeMusicEnabled && (homeMusicNeedsAction || homeMusicError) && (
        <button className={`auth-sound-gate home-music-notice ${homeMusicError ? "is-error" : ""}`} type="button" data-music-control data-ripple-block onClick={toggleHomeMusic}>
          <span><Volume2 /></span>
          <span><b>{homeMusicError ? "重新加载背景音乐" : "开启背景音乐"}</b><small>{homeMusicError ? "音乐加载失败，请确认完整下载素材后重试" : "点击开启音乐，之后切换实验页面会继续播放"}</small></span>
        </button>
      )}
      <audio
        ref={homeMusicRef}
        src="/assets/komorebi.mp3"
        loop
        preload="auto"
        onPlaying={(event) => {
          if (mediaViewRef.current === "login" || !musicEnabledRef.current) { event.currentTarget.pause(); return; }
          setHomeMusicPlaying(true);
          setHomeMusicNeedsAction(false);
          setHomeMusicError(false);
        }}
        onPause={() => {
          setHomeMusicPlaying(false);
          if (mediaViewRef.current !== "login" && musicEnabledRef.current) setHomeMusicNeedsAction(true);
        }}
        onError={() => { setHomeMusicPlaying(false); setHomeMusicError(true); setHomeMusicNeedsAction(true); }}
        aria-label="Komorebi 舒缓背景音乐"
      />
    </section>
  );
}

export default App;
