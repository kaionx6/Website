(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-tetris-best";
  const COLUMN_COUNT = 10;
  const ROW_COUNT = 20;
  const LINES_PER_LEVEL = 10;
  const LOCK_DELAY = 500;
  const MAX_LOCK_RESETS = 15;
  const PIECE_TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

  const ROTATIONS = {
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    J: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
    L: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
    S: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
    T: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    Z: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  };

  const WALL_KICKS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [-2, 0],
    [2, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
    [0, -2],
  ];

  const LINE_SCORES = [0, 100, 300, 500, 800];

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const emptyRow = () => Array(COLUMN_COUNT).fill(null);

  const readBestScore = () => {
    try {
      const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
      return Number.isFinite(value) && value > 0
        ? Math.min(value, 99_999_999)
        : 0;
    } catch (_) {
      return 0;
    }
  };

  const saveBestScore = (score) => {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch (_) {
      // Storage is optional; gameplay remains available when it is blocked.
    }
  };

  const shuffle = (items) => {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  };

  class TetrisGame {
    constructor(root) {
      this.root = root;
      this.stage =
        root.querySelector("[data-tetris-stage]") ||
        root.querySelector(".game-stage");
      this.canvas = root.querySelector("[data-tetris-canvas]");
      if (!this.stage || !(this.canvas instanceof HTMLCanvasElement)) return;

      this.context = this.canvas.getContext("2d");
      if (!this.context) return;

      const findHook = (selector) =>
        this.stage.querySelector(selector) || this.root.querySelector(selector);

      this.overlay = findHook("[data-tetris-overlay]");
      this.messageOutput = findHook("[data-tetris-message]");
      this.stateOutput = findHook("[data-tetris-state]");
      this.scoreOutput = findHook("[data-tetris-score]");
      this.bestOutput = findHook("[data-tetris-best]");
      this.levelOutput = findHook("[data-tetris-level]");
      this.linesOutput = findHook("[data-tetris-lines]");
      this.heldPieceOutput = findHook("[data-tetris-held-piece]");
      this.nextPieceOutput = findHook("[data-tetris-next-piece]");
      this.actionButton = findHook("[data-tetris-action]");
      this.actionLabel = this.actionButton?.querySelector(
        "[data-tetris-action-label]",
      );
      this.holdButtons = Array.from(
        this.root.querySelectorAll("[data-tetris-hold]"),
      );
      this.restartButton = findHook("[data-tetris-restart]");
      this.announcement = findHook("[data-tetris-announcement]");
      this.holdCanvas = findHook("[data-tetris-hold-canvas]");
      this.nextCanvas = findHook("[data-tetris-next-canvas]");

      this.state = "ready";
      this.pauseReason = "";
      this.boardCells = [];
      this.activePiece = null;
      this.heldType = null;
      this.canHold = true;
      this.bag = [];
      this.queue = [];
      this.score = 0;
      this.bestScore = readBestScore();
      this.lines = 0;
      this.level = 1;
      this.frameId = 0;
      this.lastTime = 0;
      this.dropAccumulator = 0;
      this.lockAccumulator = 0;
      this.lockResets = 0;
      this.pointer = null;
      this.inViewport = true;
      this.suspended = document.hidden;
      this.lastAnnouncement = "";
      this.viewport = { width: 0, height: 0, pixelRatio: 1 };
      this.layout = {
        board: { x: 0, y: 0, width: 0, height: 0, cell: 0 },
        hold: null,
        next: null,
      };
      this.colors = {};

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onActionClick = this.onActionClick.bind(this);
      this.onHoldClick = this.onHoldClick.bind(this);
      this.onRestartClick = this.onRestartClick.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
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
        "Tetris ready. Press Start, then move with the arrow keys or swipe. Tap to rotate and use Hold once per piece.",
      );
      this.draw();
      if (document.fonts?.ready) {
        document.fonts.ready
          .then(() => {
            this.draw();
            this.drawPreviews();
          })
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
          "Tetris game. Use the arrow keys or A and D to move, tap or use Up to rotate, Down to soft drop, Space to hard drop, C to hold, and P to pause.",
        );
      }
      this.stage.setAttribute(
        "aria-keyshortcuts",
        "ArrowLeft ArrowRight ArrowDown ArrowUp A D S W Z X Space C Shift P",
      );
      this.canvas.setAttribute("aria-hidden", "true");
      this.stage.style.touchAction = "none";

      if (this.announcement) {
        this.announcement.setAttribute("aria-live", "polite");
        this.announcement.setAttribute("aria-atomic", "true");
      }
      this.scoreOutput?.setAttribute("aria-live", "off");
      this.bestOutput?.setAttribute("aria-live", "off");
      this.levelOutput?.setAttribute("aria-live", "off");
      this.linesOutput?.setAttribute("aria-live", "off");
      this.heldPieceOutput?.setAttribute("aria-live", "off");
      this.nextPieceOutput?.setAttribute("aria-live", "off");
    }

    bindEvents() {
      this.stage.addEventListener("keydown", this.onKeyDown);
      this.stage.addEventListener("pointerdown", this.onPointerDown);
      this.stage.addEventListener("pointermove", this.onPointerMove);
      this.stage.addEventListener("pointerup", this.onPointerUp);
      this.stage.addEventListener("pointercancel", this.onPointerCancel);
      this.actionButton?.addEventListener("click", this.onActionClick);
      this.holdButtons.forEach((button) => {
        button.addEventListener("click", this.onHoldClick);
      });
      this.restartButton?.addEventListener("click", this.onRestartClick);
      document.addEventListener("visibilitychange", this.onVisibilityChange);

      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(this.canvas);
        if (this.holdCanvas instanceof HTMLCanvasElement) {
          this.resizeObserver.observe(this.holdCanvas);
        }
        if (this.nextCanvas instanceof HTMLCanvasElement) {
          this.resizeObserver.observe(this.nextCanvas);
        }
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
            this.syncVisibility();
          },
          { threshold: 0.01 },
        );
        this.visibilityObserver.observe(this.stage);
      }

      this.themeObserver = new MutationObserver(() => {
        this.readThemeColors();
        this.draw();
        this.drawPreviews();
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
        mono: variable(
          "--mono",
          '"Shantell Sans", ui-sans-serif, sans-serif',
        ),
        pieces: {
          I: variable("--tetris-i", "#25b9cf"),
          J: variable("--tetris-j", "#5277d9"),
          L: variable("--tetris-l", "#e89037"),
          O: variable("--tetris-o", "#d9bf36"),
          S: variable("--tetris-s", "#58b968"),
          T: variable("--tetris-t", "#9d68cf"),
          Z: variable("--tetris-z", "#d95b63"),
        },
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

      const margin = clamp(Math.min(bounds.width, bounds.height) * 0.025, 8, 16);
      const hudHeight = clamp(bounds.height * 0.08, 38, 54);
      const availableWidth = bounds.width - margin * 2;
      const availableHeight = bounds.height - hudHeight - margin * 1.5;
      const heightCell = availableHeight / ROW_COUNT;
      const externalCompactPreviews = Boolean(
        this.holdCanvas instanceof HTMLCanvasElement &&
          this.nextCanvas instanceof HTMLCanvasElement &&
          window.matchMedia?.("(max-width: 520px)").matches,
      );
      const showSidePanels =
        !externalCompactPreviews && availableWidth >= heightCell * 16.4;
      const boardCell = Math.max(
        4,
        Math.min(
          heightCell,
          availableWidth / (showSidePanels ? 17.25 : COLUMN_COUNT),
        ),
      );
      const boardWidth = boardCell * COLUMN_COUNT;
      const boardHeight = boardCell * ROW_COUNT;
      const boardX = (bounds.width - boardWidth) / 2;
      const boardY = hudHeight + (availableHeight - boardHeight) / 2;
      const panelGap = clamp(boardCell * 0.45, 7, 13);

      this.layout.board = {
        x: boardX,
        y: boardY,
        width: boardWidth,
        height: boardHeight,
        cell: boardCell,
      };
      this.layout.hold = null;
      this.layout.next = null;

      if (showSidePanels) {
        const leftWidth = Math.max(0, boardX - margin - panelGap);
        const rightX = boardX + boardWidth + panelGap;
        const rightWidth = Math.max(0, bounds.width - margin - rightX);
        const panelHeight = clamp(boardCell * 4.5, 72, 128);
        const panelY = boardY + boardCell * 1.1;
        if (leftWidth >= boardCell * 2.7) {
          this.layout.hold = {
            x: margin,
            y: panelY,
            width: leftWidth,
            height: panelHeight,
          };
        }
        if (rightWidth >= boardCell * 2.7) {
          this.layout.next = {
            x: rightX,
            y: panelY,
            width: rightWidth,
            height: panelHeight,
          };
        }
      }

      this.draw();
      return true;
    }

    onResize() {
      this.resizeCanvas();
      this.drawPreviews();
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
        this.announce("Tetris is paused. Press Resume when you are ready.");
        this.draw();
      }
    }

    setActionLabel(label) {
      if (!this.actionButton) return;
      if (this.actionLabel) {
        this.actionLabel.textContent = label;
      } else {
        this.actionButton.textContent = label;
      }
      const labels = {
        START: "Start Tetris",
        PAUSE: "Pause Tetris",
        RESUME: "Resume Tetris",
        REPLAY: "Replay Tetris",
      };
      this.actionButton.setAttribute("aria-label", labels[label] || label);
    }

    updateOutputs() {
      if (this.scoreOutput) {
        this.scoreOutput.textContent = String(this.score).padStart(6, "0");
      }
      if (this.bestOutput) {
        this.bestOutput.textContent = String(this.bestScore).padStart(6, "0");
      }
      if (this.levelOutput) {
        this.levelOutput.textContent = String(this.level).padStart(2, "0");
      }
      if (this.linesOutput) {
        this.linesOutput.textContent = String(this.lines).padStart(3, "0");
      }
      if (this.heldPieceOutput) {
        this.heldPieceOutput.textContent = this.heldType || "empty";
      }
      if (this.nextPieceOutput) {
        this.nextPieceOutput.textContent = this.queue[0] || "unknown";
      }
    }

    syncInterface() {
      this.root.dataset.tetrisMode = this.state;
      this.stage.dataset.tetrisMode = this.state;
      this.updateOutputs();

      const actionLabels = {
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
        ready: "TAP TO ROTATE / SWIPE TO MOVE",
        running: "BUILD COMPLETE LINES",
        paused:
          this.pauseReason === "visibility"
            ? "PAUSED WHILE OFFSCREEN"
            : "PRESS RESUME TO CONTINUE",
        gameover: `SCORE ${this.score} / REPLAY`,
      };

      this.setActionLabel(actionLabels[this.state]);
      if (this.stateOutput) this.stateOutput.textContent = stateLabels[this.state];
      if (this.messageOutput) this.messageOutput.textContent = messages[this.state];
      if (this.overlay) {
        const showOverlay = this.state !== "running";
        this.overlay.hidden = !showOverlay;
        this.overlay.setAttribute("aria-hidden", String(!showOverlay));
      }

      if (this.holdButtons.length) {
        const available = this.state === "running" && this.canHold;
        const unavailableLabel =
          this.state === "running"
            ? "Hold already used for the current Tetris piece"
            : "Hold is available while Tetris is running";
        this.holdButtons.forEach((button) => {
          if ("disabled" in button) button.disabled = !available;
          button.setAttribute("aria-disabled", String(!available));
          button.setAttribute(
            "aria-label",
            available ? "Hold current Tetris piece" : unavailableLabel,
          );
          const label = button.querySelector("[data-tetris-hold-label]");
          if (label) label.textContent = available ? "HOLD" : "HOLD USED";
        });
      }
      this.drawPreviews();
      this.dispatchState();
    }

    dispatchState() {
      try {
        this.root.dispatchEvent(
          new CustomEvent("tetris:statechange", {
            detail: {
              state: this.state,
              score: this.score,
              bestScore: this.bestScore,
              level: this.level,
              lines: this.lines,
              heldPiece: this.heldType,
              nextPiece: this.queue[0] || null,
              canHold: this.canHold,
            },
          }),
        );
      } catch (_) {
        // CustomEvent is an integration enhancement, not a gameplay dependency.
      }
    }

    resetRound() {
      this.boardCells = Array.from({ length: ROW_COUNT }, emptyRow);
      this.activePiece = null;
      this.heldType = null;
      this.canHold = true;
      this.bag = [];
      this.queue = [];
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.dropAccumulator = 0;
      this.lockAccumulator = 0;
      this.lockResets = 0;
      this.lastTime = 0;
      this.fillQueue();
      this.spawnPiece(null, true);
      this.updateOutputs();
      this.drawPreviews();
    }

    startRound() {
      if (this.suspended) {
        this.announce("Tetris cannot start until the game is visible.");
        return;
      }
      this.state = "running";
      this.pauseReason = "";
      this.resetRound();
      this.syncInterface();
      this.announce(
        "Tetris started. Swipe left or right to move, swipe down to drop, tap to rotate, or use the keyboard.",
      );
      this.queueFrame();
    }

    pauseRound(reason = "manual") {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseReason = reason;
      this.lastTime = 0;
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.syncInterface();
      this.announce(
        reason === "visibility"
          ? "Tetris paused because the game is no longer visible."
          : "Tetris paused. Press Resume to continue.",
      );
      this.draw();
    }

    resumeRound() {
      if (this.state !== "paused") return;
      if (this.suspended) {
        this.announce("Tetris cannot resume until the game is visible.");
        return;
      }
      this.state = "running";
      this.pauseReason = "";
      this.lastTime = 0;
      this.syncInterface();
      this.announce("Tetris resumed.");
      this.queueFrame();
    }

    endRound() {
      if (this.state === "gameover") return;
      this.state = "gameover";
      this.pauseReason = "";
      this.activePiece = null;
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      saveBestScore(this.bestScore);
      this.syncInterface();
      this.announce(
        `Game over. Score ${this.score}. Best ${this.bestScore}. Press Replay to try again.`,
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

    ensureRunning() {
      if (this.state === "ready" || this.state === "gameover") {
        this.startRound();
      }
      return this.state === "running" && !this.suspended;
    }

    onActionClick(event) {
      event.preventDefault();
      this.focusStage();
      this.runPrimaryAction();
    }

    onHoldClick(event) {
      event.preventDefault();
      this.focusStage();
      if (!this.ensureRunning()) return;
      this.holdPiece();
    }

    onRestartClick(event) {
      event.preventDefault();
      this.focusStage();
      this.startRound();
    }

    onKeyDown(event) {
      if (event.target.closest?.("button, a, input, select, textarea")) return;

      const key = event.key;
      if (key === "p" || key === "P" || key === "Escape") {
        if (event.repeat || (this.state !== "running" && this.state !== "paused")) {
          return;
        }
        event.preventDefault();
        this.runPrimaryAction();
        return;
      }

      if (key === "Enter") {
        if (event.repeat) return;
        event.preventDefault();
        this.runPrimaryAction();
        return;
      }

      const gameplayKey =
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "ArrowDown" ||
        key === "ArrowUp" ||
        key === " " ||
        key === "Shift" ||
        /^[aAdDsSwWxXzZcC]$/.test(key);
      if (!gameplayKey) return;

      event.preventDefault();
      if (!this.ensureRunning()) return;

      if (key === "ArrowLeft" || key === "a" || key === "A") {
        this.moveHorizontal(-1);
      } else if (key === "ArrowRight" || key === "d" || key === "D") {
        this.moveHorizontal(1);
      } else if (key === "ArrowDown" || key === "s" || key === "S") {
        this.softDrop();
      } else if (key === "ArrowUp" || key === "w" || key === "W" || key === "x" || key === "X") {
        if (!event.repeat) this.rotatePiece(1);
      } else if (key === "z" || key === "Z") {
        if (!event.repeat) this.rotatePiece(-1);
      } else if (key === " ") {
        if (!event.repeat) this.hardDrop();
      } else if (key === "c" || key === "C" || key === "Shift") {
        if (!event.repeat) this.holdPiece();
      }
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest?.("button, a, input, select, textarea")) return;
      if (this.pointer) return;

      this.focusStage();
      this.pointer = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        stepX: event.clientX,
        stepY: event.clientY,
        startTime: performance.now(),
        axis: null,
        moved: false,
      };
      try {
        this.stage.setPointerCapture(event.pointerId);
      } catch (_) {
        // Pointer capture is optional on older browsers.
      }
      if (event.pointerType !== "mouse") event.preventDefault();
    }

    onPointerMove(event) {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;

      const totalX = event.clientX - pointer.startX;
      const totalY = event.clientY - pointer.startY;
      if (!pointer.axis && Math.hypot(totalX, totalY) > 9) {
        pointer.axis = Math.abs(totalX) > Math.abs(totalY) ? "horizontal" : "vertical";
      }
      if (!pointer.axis) return;

      if (event.pointerType !== "mouse") event.preventDefault();
      const threshold = clamp(this.layout.board.cell * 0.82, 18, 34);
      if (pointer.axis === "horizontal") {
        let delta = event.clientX - pointer.stepX;
        let iterations = 0;
        while (Math.abs(delta) >= threshold && iterations < 8) {
          const direction = delta > 0 ? 1 : -1;
          if (this.ensureRunning()) this.moveHorizontal(direction);
          pointer.stepX += direction * threshold;
          pointer.moved = true;
          iterations += 1;
          delta = event.clientX - pointer.stepX;
        }
      } else if (totalY > 0) {
        let delta = event.clientY - pointer.stepY;
        let iterations = 0;
        while (delta >= threshold && iterations < 10) {
          if (this.ensureRunning()) this.softDrop();
          pointer.stepY += threshold;
          pointer.moved = true;
          iterations += 1;
          delta = event.clientY - pointer.stepY;
        }
      }
    }

    onPointerUp(event) {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      this.pointer = null;

      try {
        this.stage.releasePointerCapture(event.pointerId);
      } catch (_) {
        // The browser may already have released the pointer.
      }

      const deltaX = event.clientX - pointer.startX;
      const deltaY = event.clientY - pointer.startY;
      const distance = Math.hypot(deltaX, deltaY);
      const elapsed = Math.max(1, performance.now() - pointer.startTime);
      const tapThreshold = clamp(this.layout.board.cell * 0.52, 12, 20);

      if (distance <= tapThreshold && elapsed < 520) {
        event.preventDefault();
        if (this.ensureRunning()) this.rotatePiece(1);
        return;
      }

      if (pointer.axis === "vertical" && deltaY > 0) {
        const hardDistance = Math.max(72, this.layout.board.cell * 4.2);
        const velocity = deltaY / elapsed;
        if (
          this.ensureRunning() &&
          (deltaY >= hardDistance ||
            (deltaY >= this.layout.board.cell * 2.3 && velocity > 0.72))
        ) {
          this.hardDrop();
        }
      } else if (pointer.axis === "horizontal" && !pointer.moved) {
        if (this.ensureRunning()) this.moveHorizontal(deltaX > 0 ? 1 : -1);
      }
    }

    onPointerCancel(event) {
      if (this.pointer?.id === event.pointerId) this.pointer = null;
    }

    fillQueue() {
      while (this.queue.length < 5) {
        if (!this.bag.length) this.bag = shuffle(PIECE_TYPES);
        this.queue.push(this.bag.shift());
      }
    }

    makePiece(type) {
      return {
        type,
        rotation: 0,
        x: Math.floor(COLUMN_COUNT / 2) - 2,
        y: -1,
      };
    }

    spawnPiece(type = null, allowHold = true) {
      this.fillQueue();
      const nextType = type || this.queue.shift();
      this.fillQueue();
      const piece = this.makePiece(nextType);
      this.activePiece = piece;
      this.canHold = allowHold;
      this.dropAccumulator = 0;
      this.lockAccumulator = 0;
      this.lockResets = 0;

      if (this.collides(piece)) {
        this.endRound();
        return false;
      }
      this.drawPreviews();
      return true;
    }

    getCells(piece = this.activePiece) {
      if (!piece) return [];
      return ROTATIONS[piece.type][piece.rotation].map(([x, y]) => ({
        x: piece.x + x,
        y: piece.y + y,
      }));
    }

    collides(piece) {
      return this.getCells(piece).some(({ x, y }) => {
        if (x < 0 || x >= COLUMN_COUNT || y >= ROW_COUNT) return true;
        return y >= 0 && Boolean(this.boardCells[y]?.[x]);
      });
    }

    isGrounded() {
      if (!this.activePiece) return false;
      return this.collides({ ...this.activePiece, y: this.activePiece.y + 1 });
    }

    resetLockDelay(wasGrounded) {
      if (!wasGrounded) return;
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockAccumulator = 0;
        this.lockResets += 1;
      }
    }

    moveHorizontal(direction) {
      if (this.state !== "running" || !this.activePiece) return false;
      const wasGrounded = this.isGrounded();
      const candidate = {
        ...this.activePiece,
        x: this.activePiece.x + direction,
      };
      if (this.collides(candidate)) return false;
      this.activePiece = candidate;
      this.resetLockDelay(wasGrounded);
      this.draw();
      return true;
    }

    rotatePiece(direction) {
      if (this.state !== "running" || !this.activePiece) return false;
      const wasGrounded = this.isGrounded();
      const nextRotation =
        (this.activePiece.rotation + direction + 4) % 4;

      for (const [kickX, kickY] of WALL_KICKS) {
        const candidate = {
          ...this.activePiece,
          rotation: nextRotation,
          x: this.activePiece.x + kickX,
          y: this.activePiece.y + kickY,
        };
        if (this.collides(candidate)) continue;
        this.activePiece = candidate;
        this.resetLockDelay(wasGrounded);
        this.draw();
        return true;
      }
      return false;
    }

    stepDown(manual = false) {
      if (this.state !== "running" || !this.activePiece) return false;
      const candidate = {
        ...this.activePiece,
        y: this.activePiece.y + 1,
      };
      if (this.collides(candidate)) return false;
      this.activePiece = candidate;
      this.lockAccumulator = 0;
      if (manual) this.addScore(1);
      return true;
    }

    softDrop() {
      const moved = this.stepDown(true);
      this.draw();
      return moved;
    }

    getDropDistance() {
      if (!this.activePiece) return 0;
      let distance = 0;
      while (
        !this.collides({
          ...this.activePiece,
          y: this.activePiece.y + distance + 1,
        })
      ) {
        distance += 1;
      }
      return distance;
    }

    hardDrop() {
      if (this.state !== "running" || !this.activePiece) return;
      const distance = this.getDropDistance();
      this.activePiece.y += distance;
      this.addScore(distance * 2);
      this.lockPiece();
    }

    holdPiece() {
      if (
        this.state !== "running" ||
        !this.activePiece ||
        !this.canHold
      ) {
        return false;
      }

      const outgoingType = this.activePiece.type;
      const incomingType = this.heldType;
      this.heldType = outgoingType;
      this.canHold = false;

      const spawned = incomingType
        ? this.spawnPiece(incomingType, false)
        : this.spawnPiece(null, false);
      if (!spawned) return false;
      this.syncInterface();
      this.announce(
        incomingType
          ? `Held ${outgoingType} piece and switched to ${incomingType}.`
          : `Held ${outgoingType} piece.`,
      );
      this.draw();
      return true;
    }

    lockPiece() {
      if (!this.activePiece || this.state !== "running") return;
      const cells = this.getCells();
      if (cells.some(({ y }) => y < 0)) {
        this.endRound();
        return;
      }

      for (const { x, y } of cells) {
        this.boardCells[y][x] = this.activePiece.type;
      }

      const cleared = this.clearLines();
      if (cleared) {
        this.lines += cleared;
        this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
        this.addScore(LINE_SCORES[cleared] * this.level);
        const names = ["", "Single", "Double", "Triple", "Tetris"];
        this.announce(
          `${names[cleared]}. ${this.lines} lines, level ${this.level}, score ${this.score}.`,
        );
      }

      const spawned = this.spawnPiece(null, true);
      if (!spawned) return;
      this.syncInterface();
      this.draw();
    }

    clearLines() {
      const remaining = this.boardCells.filter(
        (row) => !row.every(Boolean),
      );
      const count = ROW_COUNT - remaining.length;
      while (remaining.length < ROW_COUNT) remaining.unshift(emptyRow());
      this.boardCells = remaining;
      return count;
    }

    addScore(points) {
      if (!points) return;
      this.score = Math.min(99_999_999, this.score + points);
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        saveBestScore(this.bestScore);
      }
      this.updateOutputs();
    }

    getDropDelay() {
      return Math.max(65, 900 * Math.pow(0.82, this.level - 1));
    }

    queueFrame() {
      if (this.frameId || this.suspended || this.state !== "running") return;
      this.frameId = requestAnimationFrame(this.onFrame);
    }

    onFrame(time) {
      this.frameId = 0;
      const elapsed = this.lastTime
        ? clamp(time - this.lastTime, 0, 100)
        : 0;
      this.lastTime = time;
      this.dropAccumulator += elapsed;

      let iterations = 0;
      const delay = this.getDropDelay();
      while (
        this.state === "running" &&
        this.dropAccumulator >= delay &&
        iterations < 6
      ) {
        this.dropAccumulator -= delay;
        this.stepDown(false);
        iterations += 1;
      }

      if (this.state === "running" && this.isGrounded()) {
        this.lockAccumulator += elapsed;
        if (this.lockAccumulator >= LOCK_DELAY) this.lockPiece();
      } else {
        this.lockAccumulator = 0;
      }

      this.draw();
      this.queueFrame();
    }

    configureContext(context = this.context, viewport = this.viewport) {
      context.setTransform(
        viewport.pixelRatio,
        0,
        0,
        viewport.pixelRatio,
        0,
        0,
      );
      context.lineJoin = "miter";
      context.lineCap = "square";
    }

    drawBackground() {
      const context = this.context;
      const { width, height } = this.viewport;
      context.fillStyle = this.colors.background;
      context.fillRect(0, 0, width, height);
    }

    drawHud() {
      const context = this.context;
      const { width } = this.viewport;
      const top = clamp(this.layout.board.y * 0.24, 12, 18);
      const labelSize = clamp(width * 0.02, 8, 10);
      const valueSize = clamp(width * 0.038, 14, 21);
      const margin = clamp(width * 0.035, 12, 20);

      const columns = [
        { x: margin, align: "left", label: "SCORE", value: String(this.score).padStart(6, "0") },
        { x: width / 2, align: "center", label: "LEVEL", value: String(this.level).padStart(2, "0") },
        { x: width - margin, align: "right", label: "LINES", value: String(this.lines).padStart(3, "0") },
      ];

      for (const item of columns) {
        context.textAlign = item.align;
        context.fillStyle = this.colors.muted;
        context.font = `700 ${labelSize}px ${this.colors.mono}`;
        context.fillText(item.label, item.x, top);
        context.fillStyle = this.colors.text;
        context.font = `700 ${valueSize}px ${this.colors.mono}`;
        context.fillText(item.value, item.x, top + valueSize + 2);
      }
    }

    drawBoard() {
      const context = this.context;
      const { x, y, width, height, cell } = this.layout.board;
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

      const corner = clamp(cell * 0.55, 5, 13);
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

    drawCell(context, x, y, size, type, options = {}) {
      const inset = Math.max(1, size * 0.075);
      const blockX = x + inset;
      const blockY = y + inset;
      const blockSize = Math.max(1, size - inset * 2);
      const inheritedAlpha = context.globalAlpha;
      const blockAlpha = inheritedAlpha * (options.alpha ?? 1);

      context.save();
      context.globalAlpha = blockAlpha;
      if (options.ghost) {
        context.strokeStyle = this.colors.pieces[type] || this.colors.accent;
        context.lineWidth = Math.max(1, size * 0.075);
        context.strokeRect(blockX, blockY, blockSize, blockSize);
      } else {
        context.fillStyle = this.colors.pieces[type] || this.colors.accent;
        context.fillRect(blockX, blockY, blockSize, blockSize);
        context.globalAlpha = blockAlpha * 0.38;
        context.fillStyle = "#ffffff";
        context.fillRect(
          blockX + inset,
          blockY + inset,
          Math.max(1, blockSize - inset * 2),
          Math.max(1, size * 0.12),
        );
        context.globalAlpha = blockAlpha;
        context.strokeStyle = this.colors.text;
        context.lineWidth = Math.max(0.75, size * 0.045);
        context.strokeRect(blockX, blockY, blockSize, blockSize);
      }
      context.restore();
    }

    drawPlacedPieces() {
      const { x, y, cell } = this.layout.board;
      for (let row = 0; row < ROW_COUNT; row += 1) {
        for (let column = 0; column < COLUMN_COUNT; column += 1) {
          const type = this.boardCells[row]?.[column];
          if (!type) continue;
          this.drawCell(
            this.context,
            x + column * cell,
            y + row * cell,
            cell,
            type,
          );
        }
      }
    }

    drawActivePiece() {
      if (!this.activePiece) return;
      const { x, y, cell } = this.layout.board;
      const dropDistance = this.getDropDistance();

      for (const block of this.getCells({
        ...this.activePiece,
        y: this.activePiece.y + dropDistance,
      })) {
        if (block.y < 0) continue;
        this.drawCell(
          this.context,
          x + block.x * cell,
          y + block.y * cell,
          cell,
          this.activePiece.type,
          { ghost: true, alpha: 0.46 },
        );
      }

      for (const block of this.getCells()) {
        if (block.y < 0) continue;
        this.drawCell(
          this.context,
          x + block.x * cell,
          y + block.y * cell,
          cell,
          this.activePiece.type,
        );
      }
    }

    getShapeBounds(type) {
      const cells = ROTATIONS[type][0];
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }

    drawMiniPiece(context, type, rect) {
      if (!type || rect.width <= 0 || rect.height <= 0) return;
      const bounds = this.getShapeBounds(type);
      const columns = bounds.maxX - bounds.minX + 1;
      const rows = bounds.maxY - bounds.minY + 1;
      const cell = Math.max(
        3,
        Math.min(rect.width / (columns + 0.8), rect.height / (rows + 0.8)),
      );
      const shapeWidth = columns * cell;
      const shapeHeight = rows * cell;
      const startX = rect.x + (rect.width - shapeWidth) / 2 - bounds.minX * cell;
      const startY = rect.y + (rect.height - shapeHeight) / 2 - bounds.minY * cell;

      for (const [blockX, blockY] of ROTATIONS[type][0]) {
        this.drawCell(
          context,
          startX + blockX * cell,
          startY + blockY * cell,
          cell,
          type,
        );
      }
    }

    drawSidePanel(panel, label, type, unavailable = false) {
      if (!panel) return;
      const context = this.context;
      const labelHeight = clamp(panel.height * 0.24, 20, 28);
      context.fillStyle = this.colors.surfaceRaised;
      context.fillRect(panel.x, panel.y, panel.width, panel.height);
      context.strokeStyle = this.colors.line;
      context.lineWidth = 1;
      context.strokeRect(panel.x, panel.y, panel.width, panel.height);
      context.fillStyle = this.colors.muted;
      context.textAlign = "center";
      context.font = `700 ${clamp(panel.width * 0.12, 7, 10)}px ${this.colors.mono}`;
      context.fillText(label, panel.x + panel.width / 2, panel.y + labelHeight * 0.68);

      context.save();
      context.globalAlpha = unavailable ? 0.38 : 1;
      this.drawMiniPiece(context, type, {
        x: panel.x + 4,
        y: panel.y + labelHeight,
        width: panel.width - 8,
        height: panel.height - labelHeight - 4,
      });
      context.restore();
    }

    drawSidePanels() {
      this.drawSidePanel(
        this.layout.hold,
        this.canHold ? "HOLD" : "HOLD USED",
        this.heldType,
        !this.canHold,
      );
      this.drawSidePanel(this.layout.next, "NEXT", this.queue[0]);
    }

    drawPreviewCanvas(canvas, type, unavailable = false) {
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const bounds = canvas.getBoundingClientRect();
      const width = bounds.width || Number(canvas.getAttribute("width")) || 120;
      const height = bounds.height || Number(canvas.getAttribute("height")) || 90;
      if (width < 2 || height < 2) return;

      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      this.configureContext(context, { width, height, pixelRatio });
      context.clearRect(0, 0, width, height);
      context.fillStyle = this.colors.surfaceRaised;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = this.colors.line;
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, width - 1, height - 1);
      context.save();
      context.globalAlpha = unavailable ? 0.38 : 1;
      this.drawMiniPiece(context, type, {
        x: 5,
        y: 5,
        width: width - 10,
        height: height - 10,
      });
      context.restore();
    }

    drawPreviews() {
      this.drawPreviewCanvas(this.holdCanvas, this.heldType, !this.canHold);
      this.drawPreviewCanvas(this.nextCanvas, this.queue[0]);
    }

    drawFallbackMessage() {
      if (this.overlay || this.state === "running") return;
      const context = this.context;
      const { width, height } = this.viewport;
      const title =
        this.state === "ready"
          ? "TETRIS READY"
          : this.state === "paused"
            ? "PAUSED"
            : "GAME OVER";
      const instruction =
        this.state === "ready"
          ? "START / TAP ROTATE / SWIPE MOVE"
          : this.state === "paused"
            ? "PRESS RESUME TO CONTINUE"
            : "PRESS REPLAY TO TRY AGAIN";
      const boxWidth = Math.min(330, width - 32);
      const boxHeight = 82;
      const boxX = (width - boxWidth) / 2;
      const boxY = (height - boxHeight) / 2;

      context.save();
      context.globalAlpha = 0.95;
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
        !this.layout.board.cell
      ) {
        return;
      }

      this.configureContext();
      this.drawBackground();
      this.drawHud();
      this.drawBoard();
      this.drawPlacedPieces();
      this.drawActivePiece();
      this.drawSidePanels();
      this.drawFallbackMessage();
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-tetris-game]").forEach((root) => {
      if (root.dataset.tetrisReady) return;
      const canvas = root.querySelector("[data-tetris-canvas]");
      const stage =
        root.querySelector("[data-tetris-stage]") ||
        root.querySelector(".game-stage");
      if (!(canvas instanceof HTMLCanvasElement) || !stage) return;
      root.dataset.tetrisReady = "true";
      const game = new TetrisGame(root);
      Object.defineProperty(root, "tetrisGame", {
        value: game,
        configurable: true,
      });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
