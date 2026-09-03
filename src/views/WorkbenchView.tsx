import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Download, FileUp, KeyRound, LoaderCircle, Play, Sparkles } from "lucide-react";
import {
  algorithms,
  generateKey,
  isClassicalAlgorithm,
  UTF8_CIPHER_PREFIX,
  processAlgorithm,
  type AlgorithmId,
  type CipherMode,
} from "../crypto/engine";
import ProcessDemo from "./ProcessDemo";

const samples: Record<AlgorithmId, string> = {
  multiliteral: "你好，世界！MEET AT GATE 2026",
  autokey: "你好，世界！Autokey 中文测试 2026",
  playfair: "你好，世界！Playfair 保留中文、空格与标点。",
  double: "你好，置换密码测试 2026 🔐",
  ca: "元胞自动机正在生成密钥流。",
  aes: "真正需要保护的内容，应该同时具备机密性与完整性。",
  sm2: "SM2 public-key encryption / 国密公钥加密",
  md5: "hello",
};

export default function WorkbenchView() {
  const [algorithm, setAlgorithm] = useState<AlgorithmId>("aes");
  const [mode, setMode] = useState<CipherMode>("encrypt");
  const [input, setInput] = useState(samples.aes);
  const [output, setOutput] = useState("");
  const [key, setKey] = useState("");
  const [secondKey, setSecondKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const selected = useMemo(() => algorithms.find((item) => item.id === algorithm)!, [algorithm]);

  useEffect(() => {
    runRef.current += 1;
    setBusy(false);
    const generated = generateKey(algorithm);
    setKey(generated.key);
    setSecondKey(generated.secondKey ?? "");
    setInput(samples[algorithm]);
    setOutput("");
    setError("");
    setNotice("");
    if (!algorithms.find((item) => item.id === algorithm)?.reversible) setMode("encrypt");
  }, [algorithm]);

  const run = async () => {
    const runId = ++runRef.current;
    setBusy(true);
    setError("");
    setNotice("");
    setOutput("");
    try {
      const result = await processAlgorithm({ algorithm, mode, input, key, secondKey });
      if (runRef.current !== runId) return;
      setOutput(result);
      setNotice(algorithm === "md5" ? "摘要计算完成" : mode === "encrypt" ? result.startsWith(UTF8_CIPHER_PREFIX) ? "加密完成 · UTF-8 全字符扩展" : "加密完成" : "解密完成");
    } catch (reason) {
      if (runRef.current !== runId) return;
      setError(reason instanceof Error ? reason.message : "处理失败");
    } finally {
      if (runRef.current === runId) setBusy(false);
    }
  };

  const refreshKey = () => {
    const generated = generateKey(algorithm);
    setKey(generated.key);
    setSecondKey(generated.secondKey ?? "");
    setNotice("已生成新密钥");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("单机文本实验台支持 5 MB 以内文件；任意二进制文件请使用双机通信页");
      return;
    }
    try {
      setInput(await file.text());
      setNotice(`已载入 ${file.name}`);
      setError("");
    } catch {
      setError("文件读取失败");
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setNotice("结果已复制到剪贴板");
  };

  const downloadOutput = () => {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lumora-${algorithm}-${mode}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-panel panel-reveal grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-[30px] lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="panel-sidebar hidden min-h-0 border-r border-white/10 p-4 lg:flex lg:flex-col" data-agent-id="workbench.algorithms">
        <div className="px-2 pb-4 pt-1">
          <p className="eyebrow">LOCAL LAB / 01</p>
          <h2 className="mt-2 text-2xl">单机密码实验台</h2>
        </div>
        <div className="soft-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {algorithms.map((item, index) => (
            <button
              key={item.id}
              data-agent-id={`workbench.algorithm.${item.id}`}
              type="button"
              onClick={() => setAlgorithm(item.id)}
              className={`algorithm-tab w-full rounded-2xl px-3 py-3 text-left ${algorithm === item.id ? "is-active" : ""}`}
            >
              <span className="mr-3 font-mono text-[10px] opacity-40">{String(index + 1).padStart(2, "0")}</span>
              <span className="text-sm">{item.family}</span>
              <span className="mt-1 block pl-8 text-[11px] opacity-50">{item.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="soft-scroll min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-7">
        <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="rounded-full border border-white/15 px-2.5 py-1">{selected.family}</span>
              <span>真实算法实现</span>
            </div>
            <h1 className="mt-3 text-3xl leading-none sm:text-4xl">{selected.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">{selected.summary}</p>
          </div>
          <select
            className="field-control block w-full lg:hidden"
            value={algorithm}
            onChange={(event) => setAlgorithm(event.target.value as AlgorithmId)}
            aria-label="选择算法"
          >
            {algorithms.map((item) => <option key={item.id} value={item.id}>{item.family} · {item.name}</option>)}
          </select>
          <div className="segmented shrink-0 self-start xl:self-auto">
            <button type="button" className={mode === "encrypt" ? "is-active" : ""} onClick={() => setMode("encrypt")}>
              {algorithm === "md5" ? "生成摘要" : "加密"}
            </button>
            {selected.reversible && (
              <button type="button" className={mode === "decrypt" ? "is-active" : ""} onClick={() => setMode("decrypt")}>解密</button>
            )}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="workspace-card flex min-h-[235px] flex-col rounded-3xl p-4">
              <span className="mb-3 flex items-center justify-between text-xs text-white/45">
                <span>INPUT / 输入</span><span>{Array.from(input).length} chars</span>
              </span>
              <textarea
                data-agent-id="workbench.input"
                className="soft-scroll min-h-[170px] flex-1 resize-none bg-transparent font-mono text-sm leading-7 text-white/90 outline-none placeholder:text-white/25"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入明文或密文…"
                spellCheck={false}
              />
            </label>
            <div className="workspace-card flex min-h-[235px] flex-col rounded-3xl p-4">
              <span className="mb-3 flex items-center justify-between text-xs text-white/45">
                <span>OUTPUT / 结果</span>
                <span className="flex gap-1">
                  <button className="icon-button" type="button" onClick={copyOutput} title="复制"><Clipboard /></button>
                  <button className="icon-button" type="button" onClick={downloadOutput} title="下载"><Download /></button>
                </span>
              </span>
              <textarea
                data-agent-id="workbench.output"
                className="soft-scroll min-h-[170px] flex-1 resize-none bg-transparent font-mono text-sm leading-7 text-emerald-50/90 outline-none placeholder:text-white/20"
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                placeholder="处理结果会显示在这里…"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="workspace-card rounded-3xl p-4" data-agent-id="workbench.key">
              {isClassicalAlgorithm(algorithm) && <p className="mb-4 text-xs leading-5 text-white/55">支持中文、Emoji 与混合文本；自动使用 UTF-8 编码后再执行所选算法。解密时请保留 LUMORA-UTF8-V1 前缀。古典密码与扩展仅供教学，不等同于现代安全加密。</p>}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-white/45">KEY MATERIAL / 密钥</span>
                {algorithm !== "md5" && (
                  <button className="mini-action" data-agent-id="workbench.generate-key" type="button" onClick={refreshKey}><Sparkles />生成</button>
                )}
              </div>
              {algorithm === "md5" ? (
                <div className="rounded-2xl border border-white/8 bg-black/10 p-4 text-sm leading-6 text-white/50">
                  MD5 不使用密钥，只输出 128 位摘要。
                </div>
              ) : (
                <>
                  <label className="field-label">
                    <span>{selected.keyLabel}</span>
                    {algorithm === "sm2" ? (
                      <textarea className="field-control soft-scroll h-32 resize-none font-mono text-[10px] leading-4" value={key} onChange={(event) => setKey(event.target.value)} spellCheck={false} />
                    ) : (
                      <input className="field-control font-mono" value={key} onChange={(event) => setKey(event.target.value)} spellCheck={false} />
                    )}
                  </label>
                  {selected.secondKeyLabel && (
                    <label className="field-label mt-3">
                      <span>{selected.secondKeyLabel}</span>
                      <input className="field-control font-mono" value={secondKey} onChange={(event) => setSecondKey(event.target.value)} spellCheck={false} />
                    </label>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
                <FileUp />载入文本
              </button>
              <button type="button" className="secondary-button" data-agent-id="workbench.sample" onClick={() => setInput(samples[algorithm])}>
                <KeyRound />示例内容
              </button>
              <input ref={fileRef} className="hidden" type="file" onChange={(event) => void loadFile(event.target.files?.[0])} />
            </div>

            <button className="primary-button w-full" data-agent-id="workbench.run" type="button" onClick={() => void run()} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
              {algorithm === "md5" ? "计算 MD5" : mode === "encrypt" ? "执行加密" : "执行解密"}
            </button>
            {(notice || error) && (
              <div className={`status-note ${error ? "is-error" : ""}`}>
                {error ? <span>!</span> : <Check />} {error || notice}
              </div>
            )}
          </div>
        </div>

        <ProcessDemo algorithm={algorithm} algorithmName={selected.name} mode={mode} input={input} keyValue={key} secondKey={secondKey} />
      </section>
    </div>
  );
}
