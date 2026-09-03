import type { ReactNode } from "react";
import { CheckCircle2, Circle, Play } from "lucide-react";
import type { LoadedImage } from "../../image-lab/types";

export interface RoadmapItem {
  label: string;
  phase: 1 | 2 | 3;
}

interface PanelShellProps {
  color: string;
  glow: string;
  title: string;
  mission: string;
  image: LoadedImage | null;
  roadmap: RoadmapItem[];
  actionLabel: string;
  onAction: () => void;
  actionHint: string;
  children?: ReactNode;
}

// 四个功能舱共享的 Phase 1 骨架：任务说明 + 图片预览槽 + 路线图 + 演示动作。
export default function PanelShell({ color, glow, title, mission, image, roadmap, actionLabel, onAction, actionHint, children }: PanelShellProps) {
  return (
    <div className="il-panel">
      <div className="il-panel-main">
        <header className="il-panel-head">
          <span className="il-panel-dot" style={{ background: color, boxShadow: `0 0 18px ${glow}` }} />
          <div>
            <h2 style={{ color }}>{title}</h2>
            <p>{mission}</p>
          </div>
        </header>

        <div className="il-preview" style={{ borderColor: `${color}55` }}>
          {image ? (
            <>
              <img src={image.url} alt={image.name} />
              <div className="il-preview-meta">
                <span>{image.name}</span>
                <span>{image.width}×{image.height} · {(image.bytes / 1024).toFixed(1)} KB</span>
              </div>
            </>
          ) : (
            <div className="il-preview-empty">上传图片后在此预览 · Phase 2 将支持交互操作</div>
          )}
        </div>

        {children}
      </div>

      <aside className="il-panel-side">
        <div className="il-roadmap workspace-card">
          <span className="il-side-title" style={{ color }}>能力路线</span>
          <ul>
            {roadmap.map((item) => (
              <li key={item.label} className={item.phase === 1 ? "is-ready" : ""}>
                {item.phase === 1 ? <CheckCircle2 size={14} style={{ color }} /> : <Circle size={14} />}
                <span>{item.label}</span>
                <b>P{item.phase}</b>
              </li>
            ))}
          </ul>
        </div>

        <button className="il-action" type="button" onClick={onAction} style={{ borderColor: color, color }}>
          <Play size={15} /> {actionLabel}
        </button>
        <p className="il-action-hint">{actionHint}</p>
      </aside>
    </div>
  );
}
