(() => {
  // Attach to the renderer's card hit-test callbacks, never the whole canvas.
  const cardRoutes = new Set([
    "work/welcome", "work/guide", "work/crypto-lab", "work/security", "work/launch-agent",
  ]);
  let audioContext;

  async function playClick() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioContext ??= new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      if (audioContext.state !== "running") return;

      // A quiet, short glass-like tick; generated locally, without media downloads.
      const start = audioContext.currentTime;
      const tone = audioContext.createOscillator();
      const gain = audioContext.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(1200, start);
      tone.frequency.exponentialRampToValueAtTime(620, start + 0.085);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      gain.gain.linearRampToValueAtTime(0, start + 0.11);
      tone.connect(gain);
      gain.connect(audioContext.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(start);
      tone.stop(start + 0.12);
    } catch {
      // Audio restrictions must never interrupt the existing card interaction.
    }
  }

  if (!window.Interaction3D?.find) return;
  const interactions = new WeakSet();
  const find = window.Interaction3D.find;
  window.Interaction3D.find = function (...args) {
    const interaction = find.apply(this, args);
    if (!interactions.has(interaction)) {
      interactions.add(interaction);
      const add = interaction.add;
      interaction.add = function (meshes, hover, click, move, seo) {
        const options = seo || (typeof move === "object" ? move : null);
        if (cardRoutes.has(options?.url) && typeof click === "function") {
          const originalClick = click;
          click = function (...clickArgs) {
            void playClick();
            return originalClick.apply(this, clickArgs);
          };
        }
        return add.call(this, meshes, hover, click, move, seo);
      };
    }
    return interaction;
  };
})();
