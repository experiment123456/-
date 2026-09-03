import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { buildDemoSteps, type DemoStep, type DemoTable } from "../crypto/demoSteps";
import type { AlgorithmId, CipherMode } from "../crypto/engine";

interface ProcessDemoProps {
  algorithm: AlgorithmId;
  algorithmName: string;
  mode: CipherMode;
  input: string;
  keyValue: string;
  secondKey: string;
}

function DemoTableBlock({ table }: { table: DemoTable }) {
  return (
    <div className="soft-scroll overflow-auto rounded-2xl border border-white/8 bg-black/20 p-2" style={{ maxHeight: 330 }}>
      {table.caption && <p className="px-2 pb-1.5 pt-1 text-[10px] tracking-wider text-white/40">{table.caption}</p>}
      <table className="w-full border-collapse font-mono text-[11px] leading-5">
        {table.head && (
          <thead>
            <tr>
              {table.head.map((cell, index) => (
                <th key={index} className="whitespace-nowrap border-b border-white/10 px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-white/42">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white/[0.025]">
              {row.map((cell, cellIndex) => {
                const data = typeof cell === "string" ? { text: cell } : cell;
                return (
                  <td
                    key={cellIndex}
                    className={`whitespace-nowrap px-2 py-1 ${data.hl ? "rounded bg-emerald-300/15 text-emerald-100" : data.dim ? "text-white/28" : "text-white/72"}`}
                  >
                    {data.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcessDemo({ algorithm, algorithmName, mode, input, keyValue, secondKey }: ProcessDemoProps) {
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");

  const actionLabel = algorithm === "md5" ? "摘要计算" : mode === "encrypt" ? "加密" : "解密";

  useEffect(() => {
    setSteps([]);
    setCurrent(0);
    setPlaying(false);
    setError("");
    setSignature("");
  }, [algorithm, mode]);

  useEffect(() => {
    if (!playing || steps.length < 2) return;
    if (current >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setCurrent((value) => Math.min(steps.length - 1, value + 1)), 1150);
    return () => window.clearTimeout(timer);
  }, [playing, current, steps.length]);

  const stale = steps.length > 0 && signature !== `${algorithm}|${mode}|${input}|${keyValue}|${secondKey}`;

  const build = async () => {
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      const built = await buildDemoSteps({ algorithm, mode, input, key: keyValue, secondKey });
      setSteps(built);
      setCurrent(0);
      setSignature(`${algorithm}|${mode}|${input}|${keyValue}|${secondKey}`);
      if (built.length > 1) setPlaying(true);
    } catch (reason) {
      setSteps([]);
      setCurrent(0);
      setError(reason instanceof Error ? reason.message : "演示生成失败");
    } finally {
      setBusy(false);
    }
  };

  const step = steps[current];

  return (
    <div className="workspace-card mt-4 rounded-3xl p-4 sm:p-5" data-agent-id="workbench.process" data-agent-state={steps.length ? "ready" : "idle"}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">PROCESS DEMO / 算法过程演示</p>
          <h3 className="mt-1.5 text-xl">过程演示 · {algorithmName}</h3>
          <p className="mt-1 text-xs text-white/45">按当前输入、密钥与{actionLabel}流程，逐步展开算法的每一次中间运算。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="mini-wide-button" data-agent-id="workbench.process.build" onClick={() => void build()} disabled={busy || !input.trim()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {steps.length ? "重新生成" : "生成演示步骤"}
          </button>
          {steps.length > 0 && (
            <>
              <div className="segmented">
                <button
                  data-agent-id="workbench.process.previous"
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCurrent((value) => Math.max(0, value - 1));
                  }}
                  disabled={current === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一步
                </button>
                <button
                  data-agent-id="workbench.process.next"
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCurrent((value) => Math.min(steps.length - 1, value + 1));
                  }}
                  disabled={current >= steps.length - 1}
                >
                  下一步
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <button type="button" className="mini-wide-button" data-agent-id="workbench.process.play" onClick={() => setPlaying((value) => !value)} disabled={steps.length < 2}>
                {playing ? <Pause /> : <Play />}
                {playing ? "暂停" : "自动播放"}
              </button>
              <button
                data-agent-id="workbench.process.reset"
                type="button"
                className="icon-button"
                title="回到第一步"
                aria-label="回到第一步"
                onClick={() => {
                  setPlaying(false);
                  setCurrent(0);
                }}
              >
                <RotateCcw />
              </button>
              <span className="font-mono text-[11px] text-white/40">
                第 {current + 1} / {steps.length} 步
              </span>
            </>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-emerald-200/70 transition-all duration-300"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>
      )}

      {error && <div className="status-note is-error mt-4"><span>!</span> {error}</div>}
      {!error && stale && <div className="status-note mt-4">输入、密钥或模式已变化，点击「重新生成」刷新演算过程。</div>}

      {!step && !error ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-black/10 p-6 text-center text-xs leading-6 text-white/40">
          点击「生成演示步骤」，系统会按当前输入与密钥逐字符演算 {algorithmName} 的{actionLabel}过程：方阵构建、逐位替换、字节流与最终密文全部可视化。
        </div>
      ) : (
        step && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <ol className="soft-scroll max-h-[430px] space-y-1 overflow-y-auto pr-1" data-agent-id="workbench.process.steps">
              {steps.map((item, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setCurrent(index);
                    }}
                    className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] leading-5 transition ${
                      index === current
                        ? "bg-emerald-300/12 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(212,255,239,0.14)]"
                        : index < current
                          ? "text-white/35"
                          : "text-white/55 hover:bg-white/5"
                    }`}
                  >
                    <span className="mt-0.5 font-mono text-[9px] opacity-50">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">{item.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="soft-scroll max-h-[430px] min-h-[240px] overflow-y-auto rounded-2xl border border-white/8 bg-black/12 p-4" data-agent-id="workbench.process.current">
              <p className="eyebrow">
                STEP {current + 1} / {steps.length}
              </p>
              <h4 className="mt-1.5 text-base">{step.title}</h4>
              {step.description && <p className="mt-2 text-xs leading-6 text-white/55">{step.description}</p>}
              {step.formula && (
                <div className="mt-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-[11px] leading-6 text-emerald-100/80">
                  {step.formula}
                </div>
              )}
              {step.kv && (
                <dl className="mt-3 grid gap-1.5">
                  {step.kv.map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
                      <dt className="text-white/38">{label}</dt>
                      <dd className="min-w-0 break-all font-mono text-white/78">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {step.table && (
                <div className="mt-3">
                  <DemoTableBlock table={step.table} />
                </div>
              )}
              {step.pre && (
                <pre className="soft-scroll mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[11px] leading-6 text-white/70">
                  {step.pre}
                </pre>
              )}
              {step.note && <p className="mt-3 text-[11px] leading-5 text-amber-200/65">※ {step.note}</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}
