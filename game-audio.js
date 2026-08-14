(() => {
  "use strict";

  const STORAGE_KEY = "kelvin-game-sound";
  const MASTER_VOLUME = 0.18;
  const CHIP_TICK = 1 / 120;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const cooldowns = {
    move: 55,
    turn: 54,
    flap: 48,
    shoot: 65,
    "enemy-hit": 42,
    rotate: 55,
    lock: 55,
    blast: 110,
    "heavy-blast": 160,
  };

  let context = null;
  let masterGain = null;
  let noiseBuffer = null;
  let hasWarmedUp = false;
  let enabled = Boolean(AudioContextClass && readPreference());
  const lastPlayed = new Map();

  function readPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch (_error) {
      return true;
    }
  }

  function savePreference() {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch (_error) {
      // Sound still works when storage is unavailable.
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function quantizeTime(value) {
    return Math.round(Math.max(0, value) / CHIP_TICK) * CHIP_TICK;
  }

  function quantizePitch(frequency) {
    const midiNote = Math.round(
      69 + 12 * Math.log2(Math.max(32, frequency) / 440),
    );
    return 440 * 2 ** ((midiNote - 69) / 12);
  }

  function getContext() {
    if (!AudioContextClass) return null;
    if (context) return context;

    try {
      try {
        context = new AudioContextClass({ latencyHint: "interactive" });
      } catch (_optionsError) {
        context = new AudioContextClass();
      }
      masterGain = context.createGain();
      masterGain.gain.value = enabled ? MASTER_VOLUME : 0;
      masterGain.connect(context.destination);
      return context;
    } catch (_error) {
      context = null;
      masterGain = null;
      return null;
    }
  }

  function disconnectNode(node) {
    try {
      node.disconnect();
    } catch (_error) {
      // Nodes may already be disconnected after a lifecycle event.
    }
  }

  function warmUp(activeContext) {
    if (hasWarmedUp) return;
    hasWarmedUp = true;
    try {
      const buffer = activeContext.createBuffer(1, 1, activeContext.sampleRate);
      const source = activeContext.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain);
      source.start();
      source.addEventListener("ended", () => disconnectNode(source), {
        once: true,
      });
    } catch (_error) {
      // A one-sample warm-up is only needed by some mobile browsers.
    }
  }

  function unlock() {
    if (!enabled) return false;
    const activeContext = getContext();
    if (!activeContext) return false;

    warmUp(activeContext);
    if (
      activeContext.state !== "running" &&
      activeContext.state !== "closed"
    ) {
      try {
        const result = activeContext.resume();
        result?.catch?.(() => {});
      } catch (_error) {
        return false;
      }
    }
    return activeContext.state !== "closed";
  }

  // Square-wave notes with hard gates emulate a simple console pulse channel.
  function pulse({
    frequency,
    duration = 0.055,
    delay = 0,
    volume = 0.1,
  }) {
    if (!context || !masterGain) return;
    const start = context.currentTime + quantizeTime(delay);
    const end =
      start + Math.max(CHIP_TICK * 2, quantizeTime(duration));
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(quantizePitch(frequency), start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.setValueAtTime(clamp(volume, 0.001, 0.26), start + 0.002);
    envelope.gain.setValueAtTime(clamp(volume, 0.001, 0.26), end - 0.004);
    envelope.gain.setValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
    oscillator.addEventListener(
      "ended",
      () => {
        disconnectNode(oscillator);
        disconnectNode(envelope);
      },
      { once: true },
    );
  }

  function sequence(notes, options = {}) {
    const step = quantizeTime(options.step ?? 0.048);
    const duration = quantizeTime(options.duration ?? step * 0.78);
    const delay = quantizeTime(options.delay ?? 0);
    const volume = options.volume ?? 0.1;
    notes.forEach((frequency, index) => {
      if (!frequency) return;
      pulse({
        frequency,
        duration,
        delay: delay + index * step,
        volume,
      });
    });
  }

  // Quantized sample-and-hold pitch changes make sweeps sound stepped, not smooth.
  function stepped(notes, options = {}) {
    sequence(notes, {
      step: options.step ?? 0.026,
      duration: options.duration ?? 0.03,
      delay: options.delay ?? 0,
      volume: options.volume ?? 0.1,
    });
  }

  function getNoiseBuffer() {
    if (!context) return null;
    if (noiseBuffer) return noiseBuffer;
    const sampleRate = context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * 0.5));
    noiseBuffer = context.createBuffer(1, length, sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    const hold = Math.max(1, Math.round(sampleRate / 8_000));
    let register = 0x4a7d;
    let sample = 1;

    for (let index = 0; index < length; index += 1) {
      if (index % hold === 0) {
        const bit = (register ^ (register >> 1)) & 1;
        register = (register >> 1) | (bit << 14);
        sample = register & 1 ? 1 : -1;
      }
      channel[index] = sample;
    }
    return noiseBuffer;
  }

  function noise({
    duration = 0.07,
    delay = 0,
    volume = 0.09,
    frequency = 1_200,
  }) {
    if (!context || !masterGain) return;
    const buffer = getNoiseBuffer();
    if (!buffer) return;
    const start = context.currentTime + quantizeTime(delay);
    const end =
      start + Math.max(CHIP_TICK * 2, quantizeTime(duration));
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(80, frequency), start);
    envelope.gain.setValueAtTime(clamp(volume, 0.001, 0.24), start);
    envelope.gain.setValueAtTime(clamp(volume, 0.001, 0.24), end - 0.006);
    envelope.gain.setValueAtTime(0.0001, end);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    source.start(start, 0);
    source.stop(end + 0.01);
    source.addEventListener(
      "ended",
      () => {
        disconnectNode(source);
        disconnectNode(filter);
        disconnectNode(envelope);
      },
      { once: true },
    );
  }

  function optionVolume(options, fallback) {
    return Number.isFinite(options.volume)
      ? clamp(options.volume, 0.001, 0.24)
      : fallback;
  }

  const effects = {
    "toggle-on": () => sequence([523, 784], { step: 0.055, volume: 0.09 }),
    "game-start": () => sequence([262, 330, 392, 523], { step: 0.055, volume: 0.1 }),
    flap: () => stepped([392, 494, 659, 784], { step: 0.018, volume: 0.075 }),
    score: () => sequence([784, 988, 1319], { step: 0.045, volume: 0.09 }),
    collision: () => {
      stepped([220, 196, 165, 131, 98, 65], { step: 0.035, volume: 0.12 });
      noise({ duration: 0.15, volume: 0.075, frequency: 650 });
    },
    turn: () => pulse({ frequency: 330, duration: 0.025, volume: 0.045 }),
    collect: () => sequence([523, 659, 784, 1047], { step: 0.034, volume: 0.075 }),
    victory: () => sequence([523, 659, 784, 1047, 784, 1047], { step: 0.072, duration: 0.06, volume: 0.095 }),
    shoot: (options) => {
      stepped([988, 659, 440, 330], { step: 0.012, volume: optionVolume(options, 0.065) });
    },
    "enemy-hit": () => {
      stepped([262, 196, 131], { step: 0.015, volume: 0.07 });
      noise({ duration: 0.038, volume: 0.04, frequency: 1_500 });
    },
    "player-hit": () => {
      stepped([196, 165, 131, 98, 65], { step: 0.034, volume: 0.12 });
      noise({ duration: 0.17, volume: 0.085, frequency: 520 });
    },
    wave: () => sequence([262, 392, 523, 784], { step: 0.052, volume: 0.085 }),
    "game-over": () => sequence([392, 330, 262, 196, 131], { step: 0.09, duration: 0.075, volume: 0.1 }),
    move: () => pulse({ frequency: 196, duration: 0.018, volume: 0.025 }),
    rotate: () => sequence([330, 494, 659], { step: 0.022, duration: 0.022, volume: 0.05 }),
    "hard-drop": () => {
      stepped([196, 147, 98, 65], { step: 0.018, volume: 0.085 });
      noise({ duration: 0.052, delay: 0.045, volume: 0.045, frequency: 420 });
    },
    hold: () => sequence([659, 494, 392, 494, 659], { step: 0.03, volume: 0.055 }),
    lock: () => {
      pulse({ frequency: 98, duration: 0.026, volume: 0.055 });
      noise({ duration: 0.02, volume: 0.025, frequency: 350 });
    },
    "line-clear": (options) => {
      const intensity = clamp(Math.round(options.intensity || 1), 1, 4);
      const notes = [523, 659, 784, 1047, 1319].slice(0, intensity + 1);
      sequence(notes, { step: 0.04, duration: 0.04, volume: 0.075 + intensity * 0.008 });
      if (intensity === 4) {
        sequence([1047, 1319, 1568], { step: 0.04, delay: 0.2, volume: 0.095 });
      }
    },
    deploy: () => {
      sequence([131, 196, 262], { step: 0.028, duration: 0.03, volume: 0.075 });
      noise({ duration: 0.025, delay: 0.065, volume: 0.025, frequency: 500 });
    },
    pause: () => sequence([523, 392, 262], { step: 0.055, volume: 0.055 }),
    resume: () => sequence([262, 392, 523], { step: 0.055, volume: 0.055 }),
    blast: (options) => {
      const volume = optionVolume(options, 0.105);
      stepped([147, 110, 82, 55], { step: 0.035, volume });
      noise({ duration: 0.16, volume: volume * 0.7, frequency: 380 });
    },
    "heavy-blast": (options) => {
      const volume = optionVolume(options, 0.14);
      stepped([131, 98, 73, 55, 41], { step: 0.048, volume });
      noise({ duration: 0.27, volume: volume * 0.78, frequency: 300 });
    },
    round: () => sequence([392, 523, 659, 784], { step: 0.055, volume: 0.075 }),
    "round-clear": () => sequence([392, 523, 659, 784, 1047], { step: 0.05, volume: 0.085 }),
  };

  function play(name, options = {}) {
    if (!enabled || document.hidden || !effects[name]) return false;
    const timestamp = performance.now?.() ?? Date.now();
    const channel = options.channel || name;
    const cooldown = Number.isFinite(options.cooldown)
      ? Math.max(0, options.cooldown)
      : cooldowns[name] || 0;
    const previousPlay = lastPlayed.get(channel);
    if (previousPlay !== undefined && timestamp - previousPlay < cooldown) {
      return false;
    }
    if (!unlock() || !context || context.state === "closed") return false;

    lastPlayed.set(channel, timestamp);
    try {
      effects[name](options);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function syncButtons() {
    document.querySelectorAll("[data-game-sound]").forEach((button) => {
      const available = Boolean(AudioContextClass);
      const active = available && enabled;
      const label = button.querySelector("[data-game-sound-label]");
      button.disabled = !available;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute(
        "aria-label",
        available
          ? `Turn game sounds ${active ? "off" : "on"}`
          : "Game sounds are unavailable in this browser",
      );
      button.title = button.getAttribute("aria-label");
      if (label) {
        label.textContent = available
          ? `SFX ${active ? "ON" : "OFF"}`
          : "NO SFX";
      }
    });
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled && AudioContextClass);
    savePreference();
    if (masterGain && context && context.state !== "closed") {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.setTargetAtTime(
        enabled ? MASTER_VOLUME : 0,
        context.currentTime,
        0.008,
      );
    }
    syncButtons();
    if (enabled) {
      unlock();
      play("toggle-on", { cooldown: 0 });
    }
    window.dispatchEvent(
      new CustomEvent("kelvingamesoundchange", { detail: { enabled } }),
    );
    return enabled;
  }

  document.addEventListener("pointerdown", unlock, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-game-sound]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setEnabled(!enabled);
  });

  window.addEventListener("pagehide", () => {
    try {
      const result = context?.suspend?.();
      result?.catch?.(() => {});
    } catch (_error) {
      // The browser owns the final audio lifecycle.
    }
  });

  window.KelvinGameAudio = Object.freeze({
    play,
    unlock,
    setEnabled,
    isEnabled: () => enabled,
  });
  syncButtons();
})();
