(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-snake-best";
  const COLUMN_COUNT = 24;
  const ROW_COUNT = 20;
  const START_LENGTH = 4;
  const START_DELAY = 148;
  const MINIMUM_DELAY = 62;

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_DIRECTIONS = {
    ArrowUp: DIRECTIONS.up,
    w: DIRECTIONS.up,
    W: DIRECTIONS.up,
    ArrowDown: DIRECTIONS.down,
    s: DIRECTIONS.down,
    S: DIRECTIONS.down,
    ArrowLeft: DIRECTIONS.left,
    a: DIRECTIONS.left,
    A: DIRECTIONS.left,
    ArrowRight: DIRECTIONS.right,
    d: DIRECTIONS.right,
    D: DIRECTIONS.right,
  };

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const sameCell = (first, second) =>
    first.x === second.x && first.y === second.y;

  const isOpposite = (first, second) =>
    first.x + second.x === 0 && first.y + second.y === 0;

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
      // Storage is an enhancement; the current game still works without it.
    }
  };

  class SnakeGame {
    constructor(root) {
      this.root = root;
      this.stage = root.querySelector("[data-snake-stage]");
      this.canvas = root.querySelector("[data-snake-canvas]");
      if (!this.stage || !(this.canvas instanceof HTMLCanvasElement)) return;

      this.context = this.canvas.getContext("2d");
      if (!this.context) return;

      const findHook = (selector) =>
        this.stage.querySelector(selector) || this.root.querySelector(selector);

      this.overlay = findHook("[data-snake-overlay]");
      this.messageOutput = findHook("[data-snake-message]");
      this.stateOutput = findHook("[data-snake-state]");
      this.scoreOutput = findHook("[data-snake-score]");
      this.bestOutput = findHook("[data-snake-best]");
      this.actionButton = findHook("[data-snake-action]");
      this.actionLabel = this.actionButton?.querySelector(
        "[data-snake-action-label]",
      );
      this.announcement = findHook("[data-snake-announcement]");

      this.state = "ready";
      this.pauseReason = "";
      this.score = 0;
      this.bestScore = readBestScore();
      this.snake = [];
      this.food = { x: 17, y: 10 };
      this.direction = DIRECTIONS.right;
      this.queuedDirection = DIRECTIONS.right;
      this.frameId = 0;
      this.lastTime = 0;
      this.accumulator = 0;
      this.inViewport = true;
      this.suspended = document.hidden;
      this.pointer = null;
      this.lastAnnouncement = "";
      this.viewport = { width: 0, height: 0, pixelRatio: 1 };
      this.board = { x: 0, y: 0, width: 0, height: 0, cell: 0 };
      this.colors = {};

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onActionClick = this.onActionClick.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onPointerCancel = this.onPointerCancel.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);

      this.prepareAccessibility();
      this.readThemeColors();
      this.bindEvents();
      this.resizeCanvas();
      this.resetRound();
      this.syncInterface();
      this.announce(
        "Snake ready. Press Start, use the arrow keys or WASD, or swipe to move.",
      );
      this.draw();
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
          "Snake game. Use the arrow keys or WASD to steer.",
        );
      }

      this.canvas.setAttribute("aria-hidden", "true");
      this.stage.style.touchAction = "none";

      if (this.announcement) {
        this.announcement.setAttribute("aria-live", "polite");
        this.announcement.setAttribute("aria-atomic", "true");
      }
      this.scoreOutput?.setAttribute("aria-live", "off");
      this.bestOutput?.setAttribute("aria-live", "off");
    }

    bindEvents() {
      this.stage.addEventListener("keydown", this.onKeyDown);
      this.stage.addEventListener("pointerdown", this.onPointerDown);
      this.stage.addEventListener("pointerup", this.onPointerUp);
      this.stage.addEventListener("pointercancel", this.onPointerCancel);
      this.actionButton?.addEventListener("click", this.onActionClick);
      document.addEventListener("visibilitychange", this.onVisibilityChange);

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
            this.syncVisibility();
          },
          { threshold: 0.01 },
        );
        this.visibilityObserver.observe(this.stage);
      }

      this.themeObserver = new MutationObserver(() => {
        this.readThemeColors();
        this.draw();
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
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
        grid: variable("--grid-minor", "rgba(77, 163, 255, 0.07)"),
        success: variable("--green", "#6ee7b7"),
        danger: variable("--danger", "#ff6b6b"),
        mono: variable(
          "--mono",
          '"Shantell Sans", ui-sans-serif, sans-serif',
        ),
      };
    }

    resizeCanvas() {
      const bounds = this.canvas.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) return false;

      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const pixelWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(bounds.height * pixelRatio));

      if (
        this.canvas.width !== pixelWidth ||
        this.canvas.height !== pixelHeight
      ) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }

      this.viewport = {
        width: bounds.width,
        height: bounds.height,
        pixelRatio,
      };

      const horizontalMargin = Math.min(18, bounds.width * 0.035);
      const verticalMargin = Math.min(18, bounds.height * 0.035);
      const hudHeight = clamp(bounds.height * 0.09, 36, 52);
      const cell = Math.max(
        3,
        Math.min(
          (bounds.width - horizontalMargin * 2) / COLUMN_COUNT,
          (bounds.height - hudHeight - verticalMargin * 2) / ROW_COUNT,
        ),
      );
      const boardWidth = cell * COLUMN_COUNT;
      const boardHeight = cell * ROW_COUNT;

      this.board = {
        x: (bounds.width - boardWidth) / 2,
        y: hudHeight + (bounds.height - hudHeight - boardHeight) / 2,
        width: boardWidth,
        height: boardHeight,
        cell,
      };
      this.draw();
      return true;
    }

    onResize() {
      this.resizeCanvas();
    }

    onVisibilityChange() {
      this.syncVisibility();
    }

    syncVisibility() {
      const wasSuspended = this.suspended;
      this.suspended = document.hidden || !this.inViewport;
      if (wasSuspended === this.suspended) return;

      if (this.suspended && this.state === "running") {
        this.pauseRound("visibility");
      } else if (!this.suspended && this.pauseReason === "visibility") {
        this.announce("Snake is paused. Press Resume when you are ready.");
        this.draw();
      }
    }

    focusStage() {
      try {
        this.stage.focus({ preventScroll: true });
      } catch (_) {
        this.stage.focus();
      }
    }

    announce(message) {
      if (!this.announcement || message === this.lastAnnouncement) return;
      this.lastAnnouncement = message;
      this.announcement.textContent = message;
    }

    setActionLabel(label) {
      if (!this.actionButton) return;
      if (this.actionLabel) {
        this.actionLabel.textContent = label;
      } else {
        this.actionButton.textContent = label;
      }
      const accessibleLabels = {
        START: "Start Snake",
        PAUSE: "Pause Snake",
        RESUME: "Resume Snake",
        REPLAY: "Replay Snake",
      };
      this.actionButton.setAttribute(
        "aria-label",
        accessibleLabels[label] || label,
      );
    }

    updateScoreOutputs() {
      if (this.scoreOutput) {
        this.scoreOutput.textContent = String(this.score).padStart(2, "0");
      }
      if (this.bestOutput) {
        this.bestOutput.textContent = String(this.bestScore).padStart(2, "0");
      }
    }

    syncInterface() {
      this.root.dataset.snakeMode = this.state;
      this.stage.dataset.snakeMode = this.state;
      this.updateScoreOutputs();

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
        ready: "ARROWS / WASD / SWIPE",
        running: "COLLECT THE TARGETS",
        paused:
          this.pauseReason === "visibility"
            ? "PAUSED WHILE OFFSCREEN"
            : "PRESS RESUME TO CONTINUE",
        gameover: `SCORE ${this.score} / REPLAY`,
      };

      this.setActionLabel(labels[this.state]);
      if (this.stateOutput) this.stateOutput.textContent = stateLabels[this.state];
      if (this.messageOutput) this.messageOutput.textContent = messages[this.state];
      if (this.overlay) {
        const showOverlay = this.state !== "running";
        this.overlay.hidden = !showOverlay;
        this.overlay.setAttribute("aria-hidden", String(!showOverlay));
      }
    }

    buildStartingSnake(direction) {
      const head = {
        x: Math.floor(COLUMN_COUNT / 2),
        y: Math.floor(ROW_COUNT / 2),
      };
      return Array.from({ length: START_LENGTH }, (_, index) => ({
        x: head.x - direction.x * index,
        y: head.y - direction.y * index,
      }));
    }

    resetRound(direction = DIRECTIONS.right) {
      this.score = 0;
      this.direction = direction;
      this.queuedDirection = direction;
      this.snake = this.buildStartingSnake(direction);
      this.accumulator = 0;
      this.lastTime = 0;
      this.spawnFood();
      this.updateScoreOutputs();
    }

    startRound(direction = DIRECTIONS.right) {
      if (this.suspended) {
        this.announce("Snake cannot start until the game is visible.");
        return;
      }

      this.state = "running";
      this.pauseReason = "";
      this.resetRound(direction);
      this.syncInterface();
      this.announce("Snake started. Use the arrow keys, WASD, or swipe to steer.");
      this.queueFrame();
    }

    pauseRound(reason = "manual") {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseReason = reason;
      this.lastTime = 0;
      this.accumulator = 0;
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.syncInterface();
      this.announce(
        reason === "visibility"
          ? "Snake paused because the game is no longer visible."
          : "Snake paused. Press Resume to continue.",
      );
      this.draw();
    }

    resumeRound() {
      if (this.state !== "paused") return;
      if (this.suspended) {
        this.announce("Snake cannot resume until the game is visible.");
        return;
      }

      this.state = "running";
      this.pauseReason = "";
      this.lastTime = 0;
      this.accumulator = 0;
      this.syncInterface();
      this.announce("Snake resumed.");
      this.queueFrame();
    }

    endRound(won = false) {
      if (this.state !== "running") return;
      this.state = "gameover";
      this.pauseReason = "";
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.syncInterface();
      this.announce(
        won
          ? `Board cleared. Final score ${this.score}. Press Replay to play again.`
          : `Game over. Score ${this.score}. Best ${this.bestScore}. Press Replay to try again.`,
      );
      this.draw();
    }

    runPrimaryAction() {
      if (this.state === "running") {
        this.pauseRound();
      } else if (this.state === "paused") {
        this.resumeRound();
      } else {
        this.startRound();
      }
    }

    onActionClick(event) {
      event.preventDefault();
      this.focusStage();
      this.runPrimaryAction();
    }

    onKeyDown(event) {
      if (event.target.closest?.("button, a, input, select, textarea")) return;

      const nextDirection = KEY_DIRECTIONS[event.key];
      if (nextDirection) {
        event.preventDefault();
        if (event.repeat) return;
        this.requestDirection(nextDirection);
        return;
      }

      if (event.repeat) return;
      if (event.key === "p" || event.key === "P") {
        if (this.state !== "running" && this.state !== "paused") return;
        event.preventDefault();
        this.runPrimaryAction();
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        this.runPrimaryAction();
      }
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest?.("button, a, input, select, textarea")) return;

      this.focusStage();
      this.pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      try {
        this.stage.setPointerCapture(event.pointerId);
      } catch (_) {
        // Pointer capture is optional on older browsers.
      }
      if (event.pointerType !== "mouse") event.preventDefault();
    }

    onPointerUp(event) {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;

      const deltaX = event.clientX - this.pointer.x;
      const deltaY = event.clientY - this.pointer.y;
      const distance = Math.hypot(deltaX, deltaY);
      const threshold = Math.max(
        18,
        Math.min(this.viewport.width, this.viewport.height) * 0.045,
      );
      this.pointer = null;

      try {
        this.stage.releasePointerCapture(event.pointerId);
      } catch (_) {
        // The pointer may already have been released by the browser.
      }

      if (distance < threshold) return;
      event.preventDefault();
      const direction =
        Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX > 0
            ? DIRECTIONS.right
            : DIRECTIONS.left
          : deltaY > 0
            ? DIRECTIONS.down
            : DIRECTIONS.up;
      this.requestDirection(direction);
    }

    onPointerCancel(event) {
      if (this.pointer?.id === event.pointerId) this.pointer = null;
    }

    requestDirection(nextDirection) {
      if (this.state === "ready" || this.state === "gameover") {
        this.startRound(nextDirection);
        return;
      }
      if (this.state !== "running" || this.suspended) return;
      if (isOpposite(nextDirection, this.direction)) return;
      this.queuedDirection = nextDirection;
    }

    spawnFood() {
      const occupied = new Set(
        this.snake.map((segment) => `${segment.x}:${segment.y}`),
      );
      const available = [];
      for (let y = 0; y < ROW_COUNT; y += 1) {
        for (let x = 0; x < COLUMN_COUNT; x += 1) {
          if (!occupied.has(`${x}:${y}`)) available.push({ x, y });
        }
      }

      if (!available.length) {
        this.endRound(true);
        return false;
      }
      this.food = available[Math.floor(Math.random() * available.length)];
      return true;
    }

    getStepDelay() {
      return Math.max(MINIMUM_DELAY, START_DELAY - this.score * 3.5);
    }

    step() {
      this.direction = this.queuedDirection;
      const head = this.snake[0];
      const nextHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y,
      };

      const hitWall =
        nextHead.x < 0 ||
        nextHead.x >= COLUMN_COUNT ||
        nextHead.y < 0 ||
        nextHead.y >= ROW_COUNT;
      if (hitWall) {
        this.endRound();
        return;
      }

      const ateFood = sameCell(nextHead, this.food);
      const collisionBody = ateFood ? this.snake : this.snake.slice(0, -1);
      if (collisionBody.some((segment) => sameCell(segment, nextHead))) {
        this.endRound();
        return;
      }

      this.snake.unshift(nextHead);
      if (!ateFood) {
        this.snake.pop();
        return;
      }

      this.score += 1;
      const isNewBest = this.score > this.bestScore;
      if (isNewBest) {
        this.bestScore = this.score;
        saveBestScore(this.bestScore);
      }
      this.updateScoreOutputs();
      this.announce(
        isNewBest
          ? `Score ${this.score}. New best score.`
          : `Score ${this.score}.`,
      );
      this.spawnFood();
    }

    queueFrame() {
      if (this.frameId || this.suspended || this.state !== "running") return;
      this.frameId = requestAnimationFrame(this.onFrame);
    }

    onFrame(time) {
      this.frameId = 0;
      const elapsed = this.lastTime
        ? clamp(time - this.lastTime, 0, 80)
        : 0;
      this.lastTime = time;
      this.accumulator += elapsed;

      let iterations = 0;
      while (
        this.state === "running" &&
        this.accumulator >= this.getStepDelay() &&
        iterations < 3
      ) {
        this.accumulator -= this.getStepDelay();
        this.step();
        iterations += 1;
      }

      this.draw();
      this.queueFrame();
    }

    configureContext() {
      const { pixelRatio } = this.viewport;
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.context.lineJoin = "miter";
      this.context.lineCap = "square";
    }

    drawBackground() {
      const context = this.context;
      const { width, height } = this.viewport;
      context.fillStyle = this.colors.background;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = this.colors.grid;
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0.5; x < width; x += 24) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = 0.5; y < height; y += 24) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
    }

    drawHud() {
      const context = this.context;
      const { x, width } = this.board;
      const labelSize = clamp(this.viewport.width * 0.025, 9, 12);
      const scoreSize = clamp(this.viewport.width * 0.055, 18, 28);
      const top = Math.max(13, this.board.y * 0.24);

      context.fillStyle = this.colors.muted;
      context.textAlign = "left";
      context.font = `700 ${labelSize}px ${this.colors.mono}`;
      context.fillText("SCORE", x, top);
      context.fillStyle = this.colors.text;
      context.font = `700 ${scoreSize}px ${this.colors.mono}`;
      context.fillText(String(this.score).padStart(2, "0"), x, top + scoreSize);

      context.fillStyle = this.colors.muted;
      context.textAlign = "right";
      context.font = `700 ${labelSize}px ${this.colors.mono}`;
      context.fillText("BEST", x + width, top);
      context.fillStyle = this.colors.text;
      context.font = `700 ${scoreSize}px ${this.colors.mono}`;
      context.fillText(
        String(this.bestScore).padStart(2, "0"),
        x + width,
        top + scoreSize,
      );
    }

    drawBoard() {
      const context = this.context;
      const { x, y, width, height, cell } = this.board;
      context.fillStyle = this.colors.surface;
      context.fillRect(x, y, width, height);
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 1.5;
      context.strokeRect(x, y, width, height);

      context.strokeStyle = this.colors.grid;
      context.lineWidth = 1;
      context.beginPath();
      for (let column = 1; column < COLUMN_COUNT; column += 1) {
        const lineX = x + column * cell;
        context.moveTo(lineX, y);
        context.lineTo(lineX, y + height);
      }
      for (let row = 1; row < ROW_COUNT; row += 1) {
        const lineY = y + row * cell;
        context.moveTo(x, lineY);
        context.lineTo(x + width, lineY);
      }
      context.stroke();

      const corner = Math.max(5, cell * 0.55);
      context.strokeStyle = this.colors.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y + corner);
      context.lineTo(x, y);
      context.lineTo(x + corner, y);
      context.moveTo(x + width - corner, y);
      context.lineTo(x + width, y);
      context.lineTo(x + width, y + corner);
      context.moveTo(x + width, y + height - corner);
      context.lineTo(x + width, y + height);
      context.lineTo(x + width - corner, y + height);
      context.moveTo(x + corner, y + height);
      context.lineTo(x, y + height);
      context.lineTo(x, y + height - corner);
      context.stroke();
    }

    drawFood() {
      const context = this.context;
      const { x, y, cell } = this.board;
      const centerX = x + (this.food.x + 0.5) * cell;
      const centerY = y + (this.food.y + 0.5) * cell;
      const radius = cell * 0.3;

      context.save();
      context.translate(centerX, centerY);
      context.rotate(Math.PI / 4);
      context.fillStyle = this.colors.danger;
      context.globalAlpha = 0.82;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.globalAlpha = 1;
      context.strokeStyle = this.colors.text;
      context.lineWidth = Math.max(1, cell * 0.08);
      context.strokeRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();

      context.strokeStyle = this.colors.danger;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(centerX - cell * 0.46, centerY);
      context.lineTo(centerX + cell * 0.46, centerY);
      context.moveTo(centerX, centerY - cell * 0.46);
      context.lineTo(centerX, centerY + cell * 0.46);
      context.stroke();
    }

    drawSnake() {
      const context = this.context;
      const { x, y, cell } = this.board;
      const inset = Math.max(1.3, cell * 0.09);

      this.snake
        .slice()
        .reverse()
        .forEach((segment, reverseIndex) => {
          const index = this.snake.length - reverseIndex - 1;
          const segmentX = x + segment.x * cell + inset;
          const segmentY = y + segment.y * cell + inset;
          const size = cell - inset * 2;
          const tailRatio = 1 - index / Math.max(1, this.snake.length - 1);

          context.globalAlpha = 0.5 + tailRatio * 0.5;
          context.fillStyle = index === 0 ? this.colors.accent : this.colors.accentDeep;
          context.fillRect(segmentX, segmentY, size, size);
          context.strokeStyle = index === 0 ? this.colors.text : this.colors.lineStrong;
          context.lineWidth = Math.max(1, cell * 0.075);
          context.strokeRect(segmentX, segmentY, size, size);
        });
      context.globalAlpha = 1;

      const head = this.snake[0];
      if (!head) return;
      const centerX = x + (head.x + 0.5) * cell;
      const centerY = y + (head.y + 0.5) * cell;
      const sideX = -this.direction.y;
      const sideY = this.direction.x;
      const forward = cell * 0.2;
      const side = cell * 0.17;

      context.fillStyle = this.colors.text;
      for (const multiplier of [-1, 1]) {
        context.beginPath();
        context.arc(
          centerX + this.direction.x * forward + sideX * side * multiplier,
          centerY + this.direction.y * forward + sideY * side * multiplier,
          Math.max(1.2, cell * 0.075),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }

    drawFallbackMessage() {
      if (this.overlay || this.state === "running") return;
      const context = this.context;
      const { width, height } = this.viewport;
      const title =
        this.state === "ready"
          ? "SNAKE READY"
          : this.state === "paused"
            ? "PAUSED"
            : "GAME OVER";
      const instruction =
        this.state === "ready"
          ? "PRESS START / ARROWS / WASD / SWIPE"
          : this.state === "paused"
            ? "PRESS RESUME TO CONTINUE"
            : "PRESS REPLAY TO TRY AGAIN";
      const boxWidth = Math.min(330, width - 32);
      const boxHeight = 82;
      const boxX = (width - boxWidth) / 2;
      const boxY = (height - boxHeight) / 2;

      context.save();
      context.globalAlpha = 0.94;
      context.fillStyle = this.colors.surfaceRaised;
      context.fillRect(boxX, boxY, boxWidth, boxHeight);
      context.globalAlpha = 1;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 2;
      context.strokeRect(boxX, boxY, boxWidth, boxHeight);
      context.textAlign = "center";
      context.fillStyle = this.colors.text;
      context.font = `700 16px ${this.colors.mono}`;
      context.fillText(title, width / 2, boxY + 32);
      context.fillStyle = this.colors.muted;
      context.font = `700 9px ${this.colors.mono}`;
      context.fillText(instruction, width / 2, boxY + 58);
      context.restore();
    }

    draw() {
      if (
        !this.context ||
        !this.canvas.width ||
        !this.canvas.height ||
        !this.viewport.width ||
        !this.board.cell
      ) {
        return;
      }

      this.configureContext();
      this.drawBackground();
      this.drawHud();
      this.drawBoard();
      this.drawFood();
      this.drawSnake();
      this.drawFallbackMessage();
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-snake-game]").forEach((root) => {
      if (root.dataset.snakeReady) return;
      const canvas = root.querySelector("[data-snake-canvas]");
      const stage = root.querySelector("[data-snake-stage]");
      if (!(canvas instanceof HTMLCanvasElement) || !stage) return;
      root.dataset.snakeReady = "true";
      new SnakeGame(root);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
