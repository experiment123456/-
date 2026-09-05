import { useEffect, useRef } from "react";
import { reefFragmentShader } from "./reefShader";

const imagePath = "/assets/ocean/innovation-reef-no-fish.png";
const vertexSource = "attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}";

/** Decorative scene only; navigation and the original jellyfish stay in React. */
export default function ReefBackground() {
  const waterRef = useRef<HTMLCanvasElement>(null);
  const lifeRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = waterRef.current;
    const life = lifeRef.current;
    if (!canvas || !life) return;
    const ctx = life.getContext("2d");
    if (!ctx) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const background = new Image();
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    let ready = false;
    let disposed = false;
    let lost = false;
    let w = 1, h = 1, time = 8, previous = 0, frame = 0;
    let lifeScale = 1;
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const release = () => {
      if (!gl) return;
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      texture = buffer = program = null;
    };
    const initialise = () => {
      if (!gl) return false;
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
        gl.deleteShader(shader);
        return null;
      };
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, reefFragmentShader);
      program = gl.createProgram();
      if (!vertex || !fragment || !program) {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        release();
        return false;
      }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return false; }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!buffer || !texture) { release(); return false; }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, background);
      gl.uniform1i(gl.getUniformLocation(program, "scene"), 0);
      for (const name of ["resolution", "imageSize", "pointer", "time", "strength"]) uniforms[name] = gl.getUniformLocation(program, name);
      return true;
    };

    const fishBody = new Path2D("M.63-.01C.47-.13 .27-.27 .04-.25C-.22-.24-.4-.12-.55 0C-.35.09-.17.23.07.22C.33.2.51.1.63-.01Z");
    const fish = (x: number, y: number, size: number, direction: number, phase: number, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size * direction, size);
      ctx.rotate(Math.sin(time * 1.3 + phase) * 0.018);
      ctx.globalAlpha = alpha;
      ctx.lineJoin = "round";
      const beat = Math.sin(time * 3.5 + phase);
      const tailSpread = 0.74 + 0.26 * Math.cos(time * 3.5 + phase);
      // A forked, translucent tail keeps its shape throughout each stroke.
      ctx.save(); ctx.translate(-0.51, 0); ctx.rotate(beat * 0.16);
      ctx.scale(1, tailSpread);
      const fin = ctx.createLinearGradient(-0.48, -0.25, 0.06, 0.16);
      fin.addColorStop(0, "rgba(142,219,236,.52)"); fin.addColorStop(1, "#24769a");
      ctx.fillStyle = fin; ctx.beginPath(); ctx.moveTo(0.08, 0);
      ctx.bezierCurveTo(-0.13, -0.07, -0.35, -0.3, -0.45, -0.28);
      ctx.quadraticCurveTo(-0.3, -0.06, -0.28, 0);
      ctx.quadraticCurveTo(-0.31, 0.1, -0.44, 0.26);
      ctx.bezierCurveTo(-0.27, 0.22, -0.11, 0.04, 0.08, 0); ctx.fill();
      ctx.strokeStyle = "rgba(174,230,242,.28)"; ctx.lineWidth = 0.012;
      for (const ray of [-0.21, -0.1, 0.1, 0.2]) {
        ctx.beginPath(); ctx.moveTo(-0.03, 0); ctx.lineTo(-0.36, ray); ctx.stroke();
      }
      ctx.restore();
      // Soft dorsal and lower fins sit behind the body.
      ctx.fillStyle = "rgba(101,182,212,.54)";
      ctx.beginPath(); ctx.moveTo(0.16, -0.2); ctx.quadraticCurveTo(-0.06, -0.48, -0.19, -0.38);
      ctx.quadraticCurveTo(-0.19, -0.26, -0.35, -0.11); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.02, 0.17); ctx.lineTo(-0.22, 0.34);
      ctx.quadraticCurveTo(-0.19, 0.23, -0.32, 0.1); ctx.closePath(); ctx.fill();
      const body = ctx.createLinearGradient(0, -0.26, 0.05, 0.25);
      body.addColorStop(0, "#286a91"); body.addColorStop(0.23, "#69b8d0");
      body.addColorStop(0.45, "#90cbd9"); body.addColorStop(0.64, "#438aa8");
      body.addColorStop(1, "#163e61");
      ctx.fillStyle = body; ctx.fill(fishBody);
      ctx.strokeStyle = "rgba(167,224,237,.4)"; ctx.lineWidth = 0.012; ctx.stroke(fishBody);
      ctx.save(); ctx.clip(fishBody);
      // Small, low-contrast scale marks follow the flank instead of glowing.
      ctx.strokeStyle = "rgba(211,244,247,.19)"; ctx.lineWidth = 0.01;
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 6; column++) {
          const sx = -0.35 + column * 0.1 + row % 2 * 0.045;
          const sy = -0.13 + row * 0.1;
          ctx.beginPath(); ctx.arc(sx, sy, 0.062, -0.75, 0.8); ctx.stroke();
        }
      }
      const shine = ctx.createLinearGradient(-0.4, 0, 0.4, 0);
      shine.addColorStop(0, "rgba(213,251,255,0)"); shine.addColorStop(0.65, "rgba(213,251,255,.40)"); shine.addColorStop(1, "rgba(213,251,255,0)");
      ctx.strokeStyle = shine; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.moveTo(-0.4, -0.025); ctx.quadraticCurveTo(0, -0.11, 0.4, -0.05); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(10,50,77,.65)"; ctx.lineWidth = 0.019;
      ctx.beginPath(); ctx.moveTo(0.27, -0.16); ctx.quadraticCurveTo(0.13, -0.02, 0.26, 0.14); ctx.stroke();
      ctx.fillStyle = "rgba(118,197,221,.6)"; ctx.beginPath(); ctx.moveTo(0.16, 0.025);
      ctx.quadraticCurveTo(-0.01, 0.12 + beat * 0.035, -0.12, 0.25 + beat * 0.025);
      ctx.quadraticCurveTo(0.07, 0.18, 0.16, 0.025); ctx.fill();
      ctx.fillStyle = "#a6d2dc"; ctx.beginPath(); ctx.arc(0.43, -0.045, 0.041, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#041b30"; ctx.beginPath(); ctx.arc(0.437, -0.045, 0.027, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(242,255,255,.85)"; ctx.beginPath(); ctx.arc(0.445, -0.057, 0.01, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const draw = () => {
      if (ready && gl && !lost) {
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform2f(uniforms.imageSize, background.naturalWidth, background.naturalHeight);
        gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
        gl.uniform1f(uniforms.time, time);
        gl.uniform1f(uniforms.strength, 1.2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      ctx.setTransform(lifeScale, 0, 0, lifeScale, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 110; i++) {
        const x = ((i * 137.51 + time * (12 + i % 8) + Math.sin(time * 0.38 + i) * 18) % w + w) % w;
        const y = ((i * 91.73 - time * (3 + i % 4) + Math.sin(x / w * 7 + time * 0.4 + i) * 12) % h + h) % h;
        const bubble = i % 19 === 0;
        ctx.beginPath(); ctx.arc(x, y, bubble ? 1.7 : 0.65, 0, Math.PI * 2);
        if (bubble) { ctx.strokeStyle = "rgba(161,222,248,.22)"; ctx.lineWidth = 0.6; ctx.stroke(); }
        else { ctx.fillStyle = "rgba(161,222,248,.19)"; ctx.fill(); }
      }
      ctx.save(); ctx.lineCap = "round";
      for (let i = 0; i < 22; i++) {
        const x = ((i * 179.3 + time * (25 + i % 6)) % (w + 60) + w + 60) % (w + 60) - 30;
        const y = h * (0.12 + i % 8 * 0.09) + Math.sin(x / w * 7 + time * 0.45 + i) * 14;
        const length = 3 + i % 7;
        ctx.strokeStyle = `rgba(147,228,249,${(0.12 + 0.09 * Math.sin(time * 0.7 + i)) * 1.2})`;
        ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - length, y + 1);
        ctx.quadraticCurveTo(x - length * 0.5, y, x, y); ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 20; i++) {
        const direction = i % 2 ? 1 : -1;
        const x = ((i * 171.7 + time * (8 + i % 5) * direction) % (w + 100) + w + 100) % (w + 100) - 50;
        const y = h * (0.28 + i % 8 * 0.065) + Math.sin(time * 0.35 + i) * 7;
        fish(x, y, (9 + i * 7 % 13) * 1.65, direction, i * 2.1, Math.abs(x - w / 2) < w * 0.25 ? 0.3 : 0.72);
      }
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      w = Math.max(bounds.width, 1); h = Math.max(bounds.height, 1);
      const scale = Math.min(devicePixelRatio || 1, 1.4, 2560 / w, Math.sqrt(3_700_000 / (w * h)));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      lifeScale = Math.min(devicePixelRatio || 1, 2);
      life.width = Math.round(w * lifeScale); life.height = Math.round(h * lifeScale);
      if (ready && gl) gl.viewport(0, 0, canvas.width, canvas.height);
      draw();
    };
    const animate = (now: number) => {
      frame = 0;
      if (disposed || motion.matches || document.hidden) return;
      if (!previous || now - previous >= 1000 / 30) {
        time += previous ? Math.min((now - previous) / 1000, 0.1) : 0;
        previous = now;
        pointer.x += (target.x - pointer.x) * 0.04; pointer.y += (target.y - pointer.y) * 0.04;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (disposed) return;
      draw();
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(animate);
    };
    const move = (event: PointerEvent) => {
      if (motion.matches || event.pointerType === "touch") return;
      const bounds = canvas.getBoundingClientRect();
      target.x = (event.clientX - bounds.left) / w - 0.5;
      target.y = (event.clientY - bounds.top) / h - 0.5;
    };
    const leave = () => { target.x = target.y = 0; };
    const onLost = (event: Event) => {
      event.preventDefault(); lost = true; ready = false;
      canvas.classList.remove("is-ready");
    };
    const onRestored = () => {
      if (disposed) return;
      lost = false;
      ready = initialise(); canvas.classList.toggle("is-ready", ready); resize();
    };
    background.onload = () => {
      if (disposed) return;
      ready = initialise(); canvas.classList.toggle("is-ready", ready); resize();
    };
    background.src = imagePath;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", leave);
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    resize(); sync();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      background.onload = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      release(); canvas.classList.remove("is-ready");
    };
  }, []);

  return <div className="reef-background" aria-hidden="true">
    <canvas ref={waterRef} className="reef-water" />
    <canvas ref={lifeRef} className="reef-life" />
    <div className="reef-shade" />
  </div>;
}
