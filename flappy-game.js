(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-flappy-best";
  const WORLD_HEIGHT = 600;
  const FLOOR_HEIGHT = 38;
  const BIRD_RADIUS = 15;
  const PIPE_WIDTH = 64;
  const PIPE_INTERVAL = 1.42;
  const GRAVITY = 1_460;
  const FLAP_VELOCITY = -455;

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const readBestScore = () => {
    try {
      const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  };

  const saveBestScore = (score) => {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch (_) {
      // The game remains playable when storage is unavailable or disabled.
    }
  };

  class FlappyGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d");
      if (!this.context) return;

      this.stage = canvas.closest("[data-flappy-stage]") || canvas;
      this.root =
        canvas.closest("[data-flappy-game]") ||
        this.stage.parentElement ||
        this.stage;
      const findHook = (selector) =>
        this.stage.querySelector?.(selector) || this.root.querySelector?.(selector);
      this.startButton = findHook("[data-flappy-action]");
      this.startLabel = this.startButton?.querySelector(
        "[data-flappy-action-label]",
      );
      this.overlay = findHook("[data-flappy-overlay]");
      this.messageOutput = findHook("[data-flappy-message]");
      this.stateOutput = findHook("[data-flappy-state]");
      this.scoreOutput = findHook("[data-flappy-score]");
      this.bestOutput = findHook("[data-flappy-best]");
      this.statusOutput = findHook("[data-flappy-announcement]");

      this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = this.motionQuery.matches;
      this.state = "ready";
      this.score = 0;
      this.bestScore = readBestScore();
      this.bird = { x: 100, y: WORLD_HEIGHT * 0.44, velocity: 0 };
      this.pipes = [];
      this.spawnClock = 0;
      this.groundOffset = 0;
      this.worldWidth = 480;
      this.frameId = 0;
      this.lastTime = 0;
      this.idleTime = 0;
      this.inViewport = true;
      this.suspended = document.hidden;
      this.lastStatus = "";
      this.colors = {};

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onStartClick = this.onStartClick.bind(this);
      this.onMotionChange = this.onMotionChange.bind(this);

      this.prepareAccessibility();
      this.readThemeColors();
      this.bindEvents();
      this.resizeCanvas();
      this.resetRound();
      this.setStatus(
        "Flappy demo ready. Press Start, Space, or the up arrow to fly.",
      );
      this.queueFrame();
      if (document.fonts?.ready) {
        document.fonts.ready
          .then(() => this.draw())
          .catch(() => {});
      }
    }

    prepareAccessibility() {
      if (!this.stage.hasAttribute("tabindex")) this.stage.tabIndex = 0;
      if (!this.stage.hasAttribute("role")) {
        this.stage.setAttribute("role", "application");
      }
      if (!this.stage.hasAttribute("aria-label")) {
        this.stage.setAttribute(
          "aria-label",
          "Flappy Bird demo. Press Space or the up arrow to flap.",
        );
      }

      if (this.stage !== this.canvas) this.canvas.setAttribute("aria-hidden", "true");

      if (this.statusOutput) {
        this.statusOutput.setAttribute("aria-live", "polite");
        this.statusOutput.setAttribute("aria-atomic", "true");
      }

      this.scoreOutput?.setAttribute("aria-live", "off");
      this.bestOutput?.setAttribute("aria-live", "off");
    }

    bindEvents() {
      this.stage.addEventListener("pointerdown", this.onPointerDown);
      this.stage.addEventListener("keydown", this.onKeyDown);
      this.startButton?.addEventListener("click", this.onStartClick);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.motionQuery.addEventListener?.("change", this.onMotionChange);

      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(this.canvas);
      } else {
        window.addEventListener("resize", this.onResize, { passive: true });
      }

      if ("IntersectionObserver" in window) {
        this.visibilityObserver = new IntersectionObserver(
          ([entry]) => {
            this.inViewport = Boolean(
              entry?.isIntersecting && entry.intersectionRatio > 0,
            );
            if (this.inViewport) this.resizeCanvas();
            this.syncSuspension();
          },
          { threshold: 0.01 },
        );
        this.visibilityObserver.observe(this.canvas);
      }

      this.themeObserver = new MutationObserver(() => {
        this.readThemeColors();
        this.draw();
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"],
      });
    }

    readThemeColors() {
      const styles = getComputedStyle(document.documentElement);
      const variable = (name, fallback) =>
        styles.getPropertyValue(name).trim() || fallback;

      this.colors = {
        background: variable("--preview-bg", "#071522"),
        surface: variable("--surface", "#091725"),
        surfaceRaised: variable("--surface-3", "#102337"),
        text: variable("--text", "#edf6ff"),
        muted: variable("--muted", "#9eb2c6"),
        accent: variable("--blue", "#4da3ff"),
        accentDeep: variable("--blue-deep", "#1677be"),
        line: variable("--line", "rgba(77, 163, 255, 0.25)"),
        lineStrong: variable(
          "--line-strong",
          "rgba(77, 163, 255, 0.56)",
        ),
        grid: variable("--grid-minor", "rgba(77, 163, 255, 0.055)"),
      };
    }

    resizeCanvas() {
      const bounds = this.canvas.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) return false;

      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));

      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }

      this.worldWidth = WORLD_HEIGHT * (bounds.width / bounds.height);
      this.bird.x = Math.max(74, this.worldWidth * 0.25);
      this.draw();
      return true;
    }

    onResize() {
      this.resizeCanvas();
      this.queueFrame();
    }

    onMotionChange(event) {
      this.reducedMotion = event.matches;
      this.lastTime = 0;
      if (this.reducedMotion && this.state !== "running") {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
        this.draw();
      } else {
        this.queueFrame();
      }
    }

    onVisibilityChange() {
      this.syncSuspension();
    }

    syncSuspension() {
      const wasSuspended = this.suspended;
      this.suspended = document.hidden || !this.inViewport;
      if (wasSuspended === this.suspended) return;

      this.lastTime = 0;
      if (this.suspended) {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
        if (this.state === "running") {
          this.setStatus("Game paused while it is not visible.");
        }
        this.draw();
      } else {
        if (this.state === "running") this.setStatus("Game resumed.");
        this.queueFrame();
      }
    }

    setStatus(message) {
      if (!this.statusOutput || message === this.lastStatus) return;
      this.lastStatus = message;
      this.statusOutput.textContent = message;
    }

    setButtonLabel(label) {
      if (!this.startButton) return;
      if (this.startLabel) {
        this.startLabel.textContent = label;
      } else {
        this.startButton.textContent = label;
      }
      const accessibleLabels = {
        START: "Start game",
        PAUSE: "Pause game",
        RESUME: "Resume game",
        REPLAY: "Replay game",
      };
      this.startButton.setAttribute("aria-label", accessibleLabels[label] || label);
    }

    syncInterface() {
      this.stage.dataset.flappyMode = this.state;
      if (this.scoreOutput) {
        this.scoreOutput.textContent = String(this.score).padStart(2, "0");
      }
      if (this.bestOutput) {
        this.bestOutput.textContent = String(this.bestScore).padStart(2, "0");
      }
      const labels = {
        ready: "START",
        running: "PAUSE",
        paused: "RESUME",
        gameover: "REPLAY",
      };
      const stateLabels = {
        ready: "STATUS / READY",
        running: "STATUS / RUNNING",
        paused: "STATUS / PAUSED",
        gameover: "STATUS / GAME OVER",
      };
      const messages = {
        ready: "CLICK / TAP / SPACE / ARROW UP",
        running: "CLEAR THE GATES",
        paused: "PRESS RESUME TO CONTINUE",
        gameover: `SCORE ${this.score} / TAP TO REPLAY`,
      };

      this.setButtonLabel(labels[this.state]);
      if (this.stateOutput) this.stateOutput.textContent = stateLabels[this.state];
      if (this.messageOutput) this.messageOutput.textContent = messages[this.state];
      if (this.overlay) {
        const showOverlay = this.state !== "running";
        this.overlay.hidden = !showOverlay;
        this.overlay.setAttribute("aria-hidden", String(!showOverlay));
      }
    }

    resetRound() {
      this.score = 0;
      this.pipes.length = 0;
      this.spawnClock = PIPE_INTERVAL * 0.38;
      this.groundOffset = 0;
      this.bird.x = Math.max(74, this.worldWidth * 0.25);
      this.bird.y = WORLD_HEIGHT * 0.44;
      this.bird.velocity = 0;
      this.syncInterface();
    }

    startRound() {
      if (this.suspended) return;
      window.KelvinGameAudio?.play?.("game-start");
      this.state = "running";
      this.resetRound();
      this.bird.velocity = FLAP_VELOCITY;
      this.lastTime = 0;
      this.setStatus("Game started. Tap, press Space, or press the up arrow to flap.");
      this.syncInterface();
      this.queueFrame();
    }

    pauseRound() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.lastTime = 0;
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.syncInterface();
      this.setStatus("Game paused. Press Resume to continue.");
      this.draw();
    }

    resumeRound() {
      if (this.state !== "paused" || this.suspended) return;
      this.state = "running";
      this.lastTime = 0;
      this.syncInterface();
      this.setStatus("Game resumed.");
      this.queueFrame();
    }

    endRound() {
      if (this.state !== "running") return;
      window.KelvinGameAudio?.play?.("collision");
      this.state = "gameover";
      this.bird.velocity = 0;

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        saveBestScore(this.bestScore);
      }

      this.syncInterface();
      this.setStatus(
        `Game over. Score ${this.score}. Best ${this.bestScore}. Press Replay to try again.`,
      );
      this.draw();
    }

    flap() {
      if (this.state !== "running" || this.suspended) return;
      window.KelvinGameAudio?.play?.("flap");
      this.bird.velocity = FLAP_VELOCITY;
    }

    focusStage() {
      try {
        this.stage.focus({ preventScroll: true });
      } catch (_) {
        this.stage.focus();
      }
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest?.("button, a, input, select, textarea")) return;
      event.preventDefault();
      this.focusStage();

      if (this.state === "running") {
        this.flap();
      } else if (this.state === "paused") {
        this.resumeRound();
      } else {
        this.startRound();
      }
    }

    onStartClick(event) {
      event.preventDefault();
      this.focusStage();
      if (this.state === "running") {
        this.pauseRound();
      } else if (this.state === "paused") {
        this.resumeRound();
      } else {
        this.startRound();
      }
    }

    onKeyDown(event) {
      if (event.repeat) return;

      if (event.key === "p" || event.key === "P") {
        if (this.state !== "running" && this.state !== "paused") return;
        event.preventDefault();
        if (this.state === "running") this.pauseRound();
        else this.resumeRound();
        return;
      }

      const flapKeys = [" ", "ArrowUp", "w", "W"];
      if (!flapKeys.includes(event.key)) return;

      event.preventDefault();
      if (this.state === "running") {
        this.flap();
      } else if (this.state === "paused") {
        this.resumeRound();
      } else {
        this.startRound();
      }
    }

    spawnPipe() {
      const playFloor = WORLD_HEIGHT - FLOOR_HEIGHT;
      const gap = Math.max(132, 170 - this.score * 1.6);
      const margin = 78;
      const range = Math.max(1, playFloor - gap - margin * 2);
      const gapTop = margin + Math.random() * range;

      this.pipes.push({
        x: this.worldWidth + PIPE_WIDTH,
        gapTop,
        gap,
        passed: false,
      });
    }

    update(delta) {
      const playFloor = WORLD_HEIGHT - FLOOR_HEIGHT;
      const speed = Math.min(208, 142 + this.score * 2.4);

      this.bird.velocity += GRAVITY * delta;
      this.bird.y += this.bird.velocity * delta;
      this.spawnClock += delta;
      this.groundOffset = (this.groundOffset + speed * delta) % 32;

      if (this.spawnClock >= PIPE_INTERVAL) {
        this.spawnClock %= PIPE_INTERVAL;
        this.spawnPipe();
      }

      for (const pipe of this.pipes) {
        pipe.x -= speed * delta;

        if (!pipe.passed && pipe.x + PIPE_WIDTH < this.bird.x) {
          pipe.passed = true;
          this.score += 1;
          window.KelvinGameAudio?.play?.("score");
          if (this.scoreOutput) {
            this.scoreOutput.textContent = String(this.score).padStart(2, "0");
          }
        }

        const overlapsHorizontally =
          this.bird.x + BIRD_RADIUS > pipe.x &&
          this.bird.x - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
        const outsideGap =
          this.bird.y - BIRD_RADIUS < pipe.gapTop ||
          this.bird.y + BIRD_RADIUS > pipe.gapTop + pipe.gap;

        if (overlapsHorizontally && outsideGap) {
          this.endRound();
          return;
        }
      }

      this.pipes = this.pipes.filter((pipe) => pipe.x + PIPE_WIDTH > -12);

      if (
        this.bird.y - BIRD_RADIUS <= 0 ||
        this.bird.y + BIRD_RADIUS >= playFloor
      ) {
        this.bird.y = clamp(
          this.bird.y,
          BIRD_RADIUS,
          playFloor - BIRD_RADIUS,
        );
        this.endRound();
      }
    }

    queueFrame() {
      if (this.frameId || this.suspended) return;
      this.frameId = requestAnimationFrame(this.onFrame);
    }

    onFrame(time) {
      this.frameId = 0;
      const elapsed = this.lastTime
        ? clamp((time - this.lastTime) / 1000, 0, 0.034)
        : 0;
      this.lastTime = time;
      this.idleTime = time / 1000;

      if (this.state === "running") this.update(elapsed);
      this.draw();

      const needsAnimation =
        this.state === "running" ||
        (this.state === "ready" && !this.reducedMotion);
      if (needsAnimation) this.queueFrame();
    }

    configureContext() {
      const scaleX = this.canvas.width / this.worldWidth;
      const scaleY = this.canvas.height / WORLD_HEIGHT;
      this.context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      this.context.lineJoin = "miter";
      this.context.lineCap = "square";
    }

    drawGrid() {
      const context = this.context;
      context.fillStyle = this.colors.background;
      context.fillRect(0, 0, this.worldWidth, WORLD_HEIGHT);

      context.beginPath();
      context.strokeStyle = this.colors.grid;
      context.lineWidth = 1;
      for (let x = 0; x <= this.worldWidth; x += 24) {
        context.moveTo(x, 0);
        context.lineTo(x, WORLD_HEIGHT);
      }
      for (let y = 0; y <= WORLD_HEIGHT; y += 24) {
        context.moveTo(0, y);
        context.lineTo(this.worldWidth, y);
      }
      context.stroke();
    }

    drawPipeSection(pipe, y, height, facesDown) {
      if (height <= 0) return;
      const context = this.context;
      const capHeight = 18;
      const capY = facesDown ? y + height - capHeight : y;

      context.fillStyle = this.colors.surfaceRaised;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 2;
      context.fillRect(pipe.x, y, PIPE_WIDTH, height);
      context.strokeRect(pipe.x, y, PIPE_WIDTH, height);

      context.fillStyle = this.colors.accentDeep;
      context.globalAlpha = 0.34;
      context.fillRect(pipe.x + 9, y, 8, height);
      context.globalAlpha = 1;

      context.fillStyle = this.colors.surface;
      context.fillRect(pipe.x - 6, capY, PIPE_WIDTH + 12, capHeight);
      context.strokeRect(pipe.x - 6, capY, PIPE_WIDTH + 12, capHeight);

      context.beginPath();
      context.strokeStyle = this.colors.line;
      for (let markerY = y + 32; markerY < y + height - 18; markerY += 42) {
        context.moveTo(pipe.x + 44, markerY);
        context.lineTo(pipe.x + PIPE_WIDTH, markerY);
      }
      context.stroke();
    }

    drawPipes() {
      const playFloor = WORLD_HEIGHT - FLOOR_HEIGHT;
      for (const pipe of this.pipes) {
        this.drawPipeSection(pipe, 0, pipe.gapTop, true);
        this.drawPipeSection(
          pipe,
          pipe.gapTop + pipe.gap,
          playFloor - pipe.gapTop - pipe.gap,
          false,
        );
      }
    }

    drawBird() {
      const context = this.context;
      const idleLift =
        this.state === "ready" && !this.reducedMotion
          ? Math.sin(this.idleTime * 3.2) * 5
          : 0;
      const rotation = this.reducedMotion
        ? 0
        : clamp(this.bird.velocity / 850, -0.34, 0.58);

      context.save();
      context.translate(this.bird.x, this.bird.y + idleLift);
      context.rotate(rotation);

      context.fillStyle = this.colors.accent;
      context.strokeStyle = this.colors.text;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(0, 0, 21, 15, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.fillStyle = this.colors.surface;
      context.beginPath();
      context.moveTo(-6, 2);
      context.lineTo(-23, 12);
      context.lineTo(-15, -6);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = this.colors.text;
      context.beginPath();
      context.arc(9, -5, 3.5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = this.colors.accentDeep;
      context.beginPath();
      context.moveTo(19, -2);
      context.lineTo(30, 2);
      context.lineTo(19, 7);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    drawFloor() {
      const context = this.context;
      const top = WORLD_HEIGHT - FLOOR_HEIGHT;
      context.fillStyle = this.colors.surface;
      context.fillRect(0, top, this.worldWidth, FLOOR_HEIGHT);
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, top);
      context.lineTo(this.worldWidth, top);
      context.stroke();

      context.beginPath();
      context.strokeStyle = this.colors.line;
      const offset = this.reducedMotion ? 0 : this.groundOffset;
      for (let x = -offset; x < this.worldWidth + 32; x += 32) {
        context.moveTo(x, top + 12);
        context.lineTo(x + 14, WORLD_HEIGHT);
      }
      context.stroke();
    }

    drawHud() {
      const context = this.context;
      context.fillStyle = this.colors.muted;
      context.font = '700 11px "Nunito", sans-serif';
      context.textAlign = "left";
      context.fillText("SCORE", 18, 27);
      context.fillStyle = this.colors.text;
      context.font = '700 27px "Nunito", sans-serif';
      context.fillText(String(this.score).padStart(2, "0"), 18, 55);

      context.fillStyle = this.colors.muted;
      context.font = '700 11px "Nunito", sans-serif';
      context.textAlign = "right";
      context.fillText(
        `BEST ${String(this.bestScore).padStart(2, "0")}`,
        this.worldWidth - 18,
        27,
      );
    }

    drawMessage(title, instruction) {
      const context = this.context;
      const width = Math.min(330, this.worldWidth - 36);
      const height = 88;
      const x = (this.worldWidth - width) / 2;
      const y = WORLD_HEIGHT * 0.28;

      context.save();
      context.globalAlpha = 0.94;
      context.fillStyle = this.colors.surface;
      context.fillRect(x, y, width, height);
      context.globalAlpha = 1;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);

      context.fillStyle = this.colors.text;
      context.textAlign = "center";
      context.font = '700 17px "Nunito", sans-serif';
      context.fillText(title, this.worldWidth / 2, y + 34);
      context.fillStyle = this.colors.muted;
      context.font = '700 10px "Nunito", sans-serif';
      context.fillText(instruction, this.worldWidth / 2, y + 61);
      context.restore();
    }

    draw() {
      if (!this.context || !this.canvas.width || !this.canvas.height) return;
      this.configureContext();
      this.drawGrid();
      this.drawPipes();
      this.drawFloor();
      this.drawBird();
      this.drawHud();

      if (this.suspended && this.state === "running") {
        this.drawMessage("PAUSED", "THE GAME RESUMES WHEN VISIBLE");
      } else if (!this.overlay && this.state === "ready") {
        this.drawMessage("READY", "CLICK / TAP / SPACE / ARROW UP");
      } else if (!this.overlay && this.state === "paused") {
        this.drawMessage("PAUSED", "PRESS RESUME TO CONTINUE");
      } else if (!this.overlay && this.state === "gameover") {
        this.drawMessage("GAME OVER", "PRESS REPLAY OR TAP TO RETRY");
      }
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-flappy-canvas]").forEach((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.flappyReady) {
        return;
      }
      canvas.dataset.flappyReady = "true";
      new FlappyGame(canvas);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
