import { type CSSProperties, type PointerEvent, type ReactNode, useRef } from "react";

type GlareHoverProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glareColor?: string;
  glareOpacity?: number;
};

export default function GlareHover({ children, className = "", style, glareColor = "rgba(214, 255, 250, 0.74)", glareOpacity = 0.34 }: GlareHoverProps) {
  const glareRef = useRef<HTMLSpanElement>(null);
  const moveGlare = (event: PointerEvent<HTMLDivElement>) => {
    const glare = glareRef.current;
    if (!glare) return;
    const rect = event.currentTarget.getBoundingClientRect();
    glare.style.setProperty("--glare-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    glare.style.setProperty("--glare-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <div className={`rb-glare-hover ${className}`} style={style} onPointerMove={moveGlare}>
      {children}
      <span className="rb-glare-hover-effect" ref={glareRef} style={{ "--glare-color": glareColor, "--glare-opacity": glareOpacity } as CSSProperties} aria-hidden="true" />
    </div>
  );
}
