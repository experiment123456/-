import { useEffect, useRef, useState } from "react";
import { ArrowRight, Image as ImageIcon, MousePointer2, X } from "lucide-react";
import { createPortal } from "react-dom";
import ParticleVortexCanvas from "./ParticleVortexCanvas";
import GlareHover from "./react-bits/GlareHover";
import "./ImageLabPreviewDialog.css";

type ImageLabPreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  onEnter: () => void;
};

const capabilities = ["局部隐私脱敏", "隐写攻防", "数字水印取证", "自适应密码编排"];

export default function ImageLabPreviewDialog({ open, onClose, onEnter }: ImageLabPreviewDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [activeCapability, setActiveCapability] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    window.addEventListener("keydown", onKeyDown);
    setActiveCapability(0);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      previousActive?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActiveCapability((current) => (current + 1) % capabilities.length), 2600);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="image-lab-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="image-lab-dialog" role="dialog" aria-modal="true" aria-labelledby="image-lab-dialog-title">
        <div className="image-lab-dialog-glow" aria-hidden="true" />
        <header className="image-lab-dialog-header">
          <div className="image-lab-dialog-title-wrap">
            <span className="image-lab-dialog-mark"><ImageIcon size={16} /></span>
            <div>
              <span className="image-lab-dialog-eyebrow">LOCAL IMAGE WORKBENCH</span>
              <h2 id="image-lab-dialog-title">图片安全实验室</h2>
            </div>
          </div>
          <button ref={closeRef} className="image-lab-dialog-close" type="button" onClick={onClose} aria-label="关闭图片安全实验室预览">
            <X size={18} />
          </button>
        </header>

        <GlareHover className="image-lab-dialog-preview">
          <img src="/assets/image-lab/lab-ambient-poster.jpg" alt="图片安全实验室界面预览" />
          <ParticleVortexCanvas variant="compact" />
          <div className="image-lab-dialog-preview-caption">
            <span>LOCAL IMAGE WORKBENCH</span>
            <b>实验界面预览</b>
          </div>
        </GlareHover>

        <div className="image-lab-dialog-status">
          <span>图片安全实验室</span>
          <b><i />已就绪</b>
        </div>

        <div className="image-lab-dialog-capabilities" aria-label="实验室能力">
          {capabilities.map((capability, index) => (
            <span className={index === activeCapability ? "is-active" : ""} key={capability}>
              <i>{String(index + 1).padStart(2, "0")}</i>{capability}
            </span>
          ))}
        </div>

        <p className="image-lab-dialog-copy">在浏览器本地完成图像脱敏、隐写分析、水印取证与密码策略编排。</p>
        <footer className="image-lab-dialog-footer">
          <div className="image-lab-dialog-hint"><MousePointer2 size={15} /><span>移动光标，观察预览中的粒子流动</span></div>
          <button className="image-lab-dialog-enter" type="button" onClick={onEnter}>
            <span>进入互动图片实验室</span><ArrowRight size={17} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
