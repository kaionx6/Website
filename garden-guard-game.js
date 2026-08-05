(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-garden-guard-best";
  const ROW_COUNT = 5;
  const COLUMN_COUNT = 9;
  const STARTING_ENERGY = 175;
  const FIXED_STEP = 1 / 60;
  const MAX_FRAME_STEP = 0.05;
  const MAX_CATCH_UP_STEPS = 5;

  const UNIT_TYPES = {
    lumen: {
      label: "Lumen",
      cost: 50,
      cooldown: 5,
      health: 250,
      productionTime: 7.5,
      color: "#e6c84c",
    },
    pulse: {
      label: "Pulse Pod",
      cost: 100,
      cooldown: 4.5,
      health: 310,
      fireTime: 1.15,
      damage: 26,
      projectileSpeed: 3.6,
      color: "#58b968",
    },
    bulwark: {
      label: "Bulwark",
      cost: 75,
      cooldown: 8,
      health: 1_100,
      color: "#8da3b8",
    },
    frost: {
      label: "Frost Reed",
      cost: 150,
      cooldown: 7,
      health: 285,
      fireTime: 1.65,
      damage: 20,
      projectileSpeed: 3.1,
      slowFactor: 0.52,
      slowTime: 2.7,
      color: "#6ec9dc",
    },
    mine: {
      label: "Echo Mine",
      cost: 125,
      cooldown: 11,
      health: 180,
      armTime: 1.8,
      damage: 390,
      blastRadius: 1.2,
      color: "#d58a4a",
    },
  };

  const UNIT_ORDER = ["lumen", "pulse", "bulwark", "frost", "mine"];

  const ENEMY_TYPES = {
    drifter: {
      label: "Drifter",
      health: 175,
      speed: 0.19,
      damage: 52,
      score: 100,
      scale: 0.82,
      color: "#b47b5d",
    },
    runner: {
      label: "Runner",
      health: 110,
      speed: 0.34,
      damage: 38,
      score: 135,
      scale: 0.7,
      color: "#c99a54",
    },
    shield: {
      label: "Shield Rig",
      health: 360,
      speed: 0.135,
      damage: 62,
      score: 190,
      scale: 0.92,
      color: "#7d91a8",
    },
    hauler: {
      label: "Heavy Hauler",
      health: 760,
      speed: 0.085,
      damage: 92,
      score: 330,
      scale: 1.08,
      color: "#9d6a65",
    },
  };

  const WAVES = [
    { count: 7, interval: 2.5, pool: ["drifter", "drifter", "drifter"] },
    { count: 9, interval: 2.15, pool: ["drifter", "drifter", "runner"] },
    {
      count: 11,
      interval: 1.95,
      pool: ["drifter", "runner", "shield"],
    },
    {
      count: 13,
      interval: 1.7,
      pool: ["drifter", "runner", "shield", "shield", "hauler"],
    },
    {
      count: 16,
      interval: 1.45,
      pool: ["runner", "shield", "shield", "hauler"],
    },
  ];

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const readBestScore = () => {
    try {
      const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_error) {
      return 0;
    }
  };

  const saveBestScore = (score) => {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch (_error) {
      // Persistent scores are optional; gameplay does not depend on storage.
    }
  };

  class GardenGuardGame {
    constructor(root) {
      this.root = root;
      this.stage = root.querySelector("[data-garden-stage]");
      this.canvas = root.querySelector("[data-garden-canvas]");
      this.toolbar = root.querySelector("[data-garden-toolbar]");
      if (!this.stage || !(this.canvas instanceof HTMLCanvasElement)) return;

      this.context = this.canvas.getContext("2d");
      if (!this.context) return;

      this.unitButtons = [
        ...root.querySelectorAll("[data-garden-unit]"),
      ];
      this.removeButton = root.querySelector("[data-garden-remove]");
      this.overlay = root.querySelector("[data-garden-overlay]");
      this.messageOutput = root.querySelector("[data-garden-message]");
      this.stateOutput = root.querySelector("[data-garden-state]");
      this.energyOutput = root.querySelector("[data-garden-energy]");
      this.waveOutput = root.querySelector("[data-garden-wave]");
      this.scoreOutput = root.querySelector("[data-garden-score]");
      this.actionButton = root.querySelector("[data-garden-action]");
      this.announcement = root.querySelector("[data-garden-announcement]");

      this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = this.motionQuery.matches;
      this.bestScore = readBestScore();
      this.viewport = { width: 0, height: 0, pixelRatio: 1 };
      this.board = { x: 0, y: 0, width: 0, height: 0, cell: 0 };
      this.colors = {};
      this.frameId = 0;
      this.lastTime = 0;
      this.accumulator = 0;
      this.inViewport = true;
      this.suspended = document.hidden;
      this.lastAnnouncement = "";
      this.interfaceSignature = "";
      this.entityId = 0;

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onStagePointerDown = this.onStagePointerDown.bind(this);
      this.onActionClick = this.onActionClick.bind(this);
      this.onRemoveClick = this.onRemoveClick.bind(this);
      this.onMotionChange = this.onMotionChange.bind(this);

      this.prepareAccessibility();
      this.readThemeColors();
      this.bindEvents();
      this.resetRound();
      this.resizeCanvas();
      this.syncInterface(true);
      this.draw();
      this.announce(
        "Garden Guard ready. Select a defender, then choose a lane and column.",
      );

      if (document.fonts?.ready) {
        document.fonts.ready
          .then(() => this.draw())
          .catch(() => {});
      }
    }

    prepareAccessibility() {
      if (!this.stage.hasAttribute("tabindex")) this.stage.tabIndex = 0;
      this.canvas.setAttribute("aria-hidden", "true");
      if (this.announcement) {
        this.announcement.setAttribute("aria-live", "polite");
        this.announcement.setAttribute("aria-atomic", "true");
      }
      this.energyOutput?.setAttribute("aria-live", "off");
      this.waveOutput?.setAttribute("aria-live", "off");
      this.scoreOutput?.setAttribute("aria-live", "off");
    }

    bindEvents() {
      this.stage.addEventListener("pointerdown", this.onStagePointerDown);
      this.stage.addEventListener("keydown", this.onKeyDown);
      this.actionButton?.addEventListener("click", this.onActionClick);
      this.removeButton?.addEventListener("click", this.onRemoveClick);
      this.unitButtons.forEach((button) => {
        button.addEventListener("click", () => {
          this.selectUnit(button.dataset.gardenUnit);
          this.focusStage();
        });
      });
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.motionQuery.addEventListener?.("change", this.onMotionChange);

      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(this.canvas);
        if (this.toolbar) this.resizeObserver.observe(this.toolbar);
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
        textSoft: variable("--text-soft", "#c9d9e8"),
        muted: variable("--muted", "#9eb2c6"),
        faint: variable("--faint", "#8098af"),
        accent: variable("--blue", "#4da3ff"),
        accentDeep: variable("--blue-deep", "#1677be"),
        line: variable("--line", "rgba(77, 163, 255, 0.25)"),
        lineStrong: variable(
          "--line-strong",
          "rgba(77, 163, 255, 0.56)",
        ),
        grid: variable("--grid-minor", "rgba(77, 163, 255, 0.055)"),
        danger: "#d95b63",
        success: "#58b968",
        energy: "#e6c84c",
        mono: variable("--mono", "Nunito, ui-sans-serif, sans-serif"),
      };
    }

    resetRound() {
      this.state = "ready";
      this.pauseReason = "";
      this.energy = STARTING_ENERGY;
      this.score = 0;
      this.waveIndex = -1;
      this.waveSpawned = 0;
      this.spawnTimer = 0;
      this.waitingForWave = false;
      this.waveBreakTimer = 0;
      this.waveBannerTimer = 0;
      this.skyEnergyTimer = 2.5;
      this.selectedUnit = "pulse";
      this.removeMode = false;
      this.cursor = { row: 2, column: 2 };
      this.units = [];
      this.enemies = [];
      this.projectiles = [];
      this.energyNodes = [];
      this.sweepers = Array.from({ length: ROW_COUNT }, (_, row) => ({
        row,
        used: false,
        active: false,
        x: -0.48,
      }));
      this.cooldowns = Object.fromEntries(
        UNIT_ORDER.map((type) => [type, 0]),
      );
      this.lastTime = 0;
      this.accumulator = 0;
      this.interfaceSignature = "";
    }

    startRound() {
      if (this.state === "paused") {
        this.state = "running";
        this.pauseReason = "";
        this.lastTime = 0;
        this.setOverlay(false);
        this.announce("Defence resumed.");
        this.syncInterface(true);
        this.queueFrame();
        this.focusStage();
        return;
      }

      const selectedUnit = this.selectedUnit;
      const removeMode = this.removeMode;
      this.resetRound();
      this.selectedUnit = selectedUnit;
      this.removeMode = removeMode;
      this.state = "running";
      this.beginWave(0, 3);
      this.setOverlay(false);
      this.announce("Wave one started. Protect all five lanes.");
      this.syncInterface(true);
      this.focusStage();
      this.queueFrame();
    }

    pauseRound(reason = "manual") {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseReason = reason;
      this.lastTime = 0;
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.setOverlay(true, "DEFENCE PAUSED");
      this.syncInterface(true);
      if (reason === "manual") this.announce("Defence paused.");
      this.draw();
    }

    finishRound(outcome) {
      if (this.state === "won" || this.state === "lost") return;
      this.state = outcome;
      this.lastTime = 0;
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        saveBestScore(this.bestScore);
      }

      if (outcome === "won") {
        this.setOverlay(true, "ALL LANES SECURE");
        this.announce(
          `Garden secured. Final score ${this.score}. Press Replay to defend again.`,
        );
      } else {
        this.setOverlay(true, "DEFENCE BREACHED");
        this.announce(
          `The defence grid was breached. Score ${this.score}. Press Replay to try again.`,
        );
      }
      this.syncInterface(true);
      this.draw();
    }

    beginWave(index, delay = 1.8) {
      this.waveIndex = index;
      this.waveSpawned = 0;
      this.spawnTimer = delay;
      this.waitingForWave = false;
      this.waveBreakTimer = 0;
      this.waveBannerTimer = 2.2;
      this.announce(`Wave ${index + 1} of ${WAVES.length} incoming.`);
      this.syncInterface(true);
    }

    onActionClick(event) {
      event.preventDefault();
      if (this.state === "running") {
        this.pauseRound("manual");
      } else {
        this.startRound();
      }
    }

    onRemoveClick(event) {
      event?.preventDefault();
      this.removeMode = true;
      this.selectedUnit = null;
      this.announce("Remove tool selected. Choose a deployed defender.");
      this.syncInterface(true);
      this.draw();
      this.focusStage();
    }

    selectUnit(type) {
      const specification = UNIT_TYPES[type];
      if (!specification) return;

      if (this.cooldowns[type] > 0.05) {
        this.announce(
          `${specification.label} is recharging for ${Math.ceil(this.cooldowns[type])} seconds.`,
        );
        return;
      }
      if (this.energy < specification.cost) {
        this.announce(
          `${specification.label} needs ${specification.cost} energy. You have ${this.energy}.`,
        );
        return;
      }

      this.selectedUnit = type;
      this.removeMode = false;
      this.announce(
        `${specification.label} selected. Choose a lane and column.`,
      );
      this.syncInterface(true);
      this.draw();
    }

    focusStage() {
      try {
        this.stage.focus({ preventScroll: true });
      } catch (_error) {
        this.stage.focus();
      }
    }

    onMotionChange(event) {
      this.reducedMotion = event.matches;
      this.draw();
    }

    onVisibilityChange() {
      this.syncVisibility();
    }

    syncVisibility() {
      const nextSuspended = document.hidden || !this.inViewport;
      if (nextSuspended === this.suspended) return;
      this.suspended = nextSuspended;

      if (this.suspended && this.state === "running") {
        this.pauseRound("visibility");
      } else if (!this.suspended && this.state === "running") {
        this.lastTime = 0;
        this.queueFrame();
      } else if (!this.suspended && this.pauseReason === "visibility") {
        this.announce("Garden Guard is paused. Press Resume when ready.");
      }
    }

    announce(message) {
      if (!this.announcement || !message || message === this.lastAnnouncement) {
        return;
      }
      this.lastAnnouncement = message;
      this.announcement.textContent = message;
    }

    setOverlay(visible, message = "") {
      if (this.overlay) this.overlay.hidden = !visible;
      if (message && this.messageOutput) this.messageOutput.textContent = message;
    }

    resizeCanvas() {
      const bounds = this.canvas.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) return false;

      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2.25);
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

      const stageBounds = this.stage.getBoundingClientRect();
      const toolbarBounds = this.toolbar?.getBoundingClientRect();
      const toolbarBottom = toolbarBounds?.height
        ? toolbarBounds.bottom - stageBounds.top + 8
        : 78;
      const padding = clamp(Math.min(bounds.width, bounds.height) * 0.02, 7, 17);
      const statusHeight = clamp(bounds.height * 0.055, 28, 46);
      const boardTop = Math.max(toolbarBottom + statusHeight, padding + 68);
      const availableHeight = Math.max(80, bounds.height - boardTop - padding);
      const cell = Math.max(
        8,
        Math.min(
          (bounds.width - padding * 2) / (COLUMN_COUNT + 0.78),
          availableHeight / ROW_COUNT,
        ),
      );
      const fieldWidth = cell * (COLUMN_COUNT + 0.78);
      const fieldX = (bounds.width - fieldWidth) / 2;
      const boardWidth = cell * COLUMN_COUNT;
      const boardHeight = cell * ROW_COUNT;

      this.board = {
        x: fieldX + cell * 0.78,
        y: boardTop + (availableHeight - boardHeight) / 2,
        width: boardWidth,
        height: boardHeight,
        cell,
        toolbarBottom,
      };

      this.draw();
      return true;
    }

    onResize() {
      this.resizeCanvas();
      if (this.state === "running") this.queueFrame();
    }

    clientPoint(event) {
      const bounds = this.canvas.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) return null;
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * this.viewport.width,
        y: ((event.clientY - bounds.top) / bounds.height) * this.viewport.height,
      };
    }

    pointToCell(point) {
      const { x, y, width, height, cell } = this.board;
      if (
        point.x < x ||
        point.x >= x + width ||
        point.y < y ||
        point.y >= y + height
      ) {
        return null;
      }
      return {
        column: clamp(Math.floor((point.x - x) / cell), 0, COLUMN_COUNT - 1),
        row: clamp(Math.floor((point.y - y) / cell), 0, ROW_COUNT - 1),
      };
    }

    onStagePointerDown(event) {
      if (event.target.closest?.("[data-garden-toolbar]")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const point = this.clientPoint(event);
      if (!point) return;

      event.preventDefault();
      this.focusStage();

      if (this.state === "ready" || this.state === "won" || this.state === "lost") {
        const previousState = this.state;
        this.startRound();
        if (previousState !== "ready") return;
      }
      if (this.state === "paused") {
        this.startRound();
        return;
      }

      if (this.collectEnergyAtPoint(point)) return;
      const cell = this.pointToCell(point);
      if (!cell) {
        this.announce("Choose a cell inside the five-lane defence grid.");
        return;
      }

      this.cursor = cell;
      this.useSelectedTool(cell.row, cell.column);
    }

    onKeyDown(event) {
      if (event.target.closest?.("button, a, input, select, textarea")) return;

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        this.selectUnit(UNIT_ORDER[Number(event.key) - 1]);
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        if (this.state === "running") this.pauseRound("manual");
        else if (this.state === "paused") this.startRound();
        return;
      }

      if (event.key === "r" || event.key === "R" || event.key === "Delete") {
        event.preventDefault();
        this.onRemoveClick();
        return;
      }

      if (event.key === "Escape") {
        this.removeMode = false;
        this.selectedUnit = null;
        this.announce("Selection cleared.");
        this.syncInterface(true);
        this.draw();
        return;
      }

      const movement = {
        ArrowLeft: { row: 0, column: -1 },
        ArrowRight: { row: 0, column: 1 },
        ArrowUp: { row: -1, column: 0 },
        ArrowDown: { row: 1, column: 0 },
      }[event.key];

      if (movement) {
        event.preventDefault();
        this.cursor = {
          row: clamp(this.cursor.row + movement.row, 0, ROW_COUNT - 1),
          column: clamp(
            this.cursor.column + movement.column,
            0,
            COLUMN_COUNT - 1,
          ),
        };
        this.describeCursor();
        this.draw();
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (this.state !== "running") {
          this.startRound();
        } else {
          this.useSelectedTool(this.cursor.row, this.cursor.column);
        }
      }
    }

    describeCursor() {
      const occupant = this.unitAt(this.cursor.row, this.cursor.column);
      this.announce(
        `Lane ${this.cursor.row + 1}, column ${this.cursor.column + 1}, ${
          occupant ? UNIT_TYPES[occupant.type].label : "empty"
        }.`,
      );
    }

    useSelectedTool(row, column) {
      if (this.state !== "running") return;

      if (this.removeMode) {
        const unit = this.unitAt(row, column);
        if (!unit) {
          this.announce(`Lane ${row + 1}, column ${column + 1} is already empty.`);
          return;
        }
        unit.health = 0;
        this.removeDeadUnits();
        this.announce(
          `${UNIT_TYPES[unit.type].label} removed from lane ${row + 1}, column ${column + 1}.`,
        );
        this.draw();
        return;
      }

      if (!this.selectedUnit) {
        this.announce("Select a defender card before choosing a cell.");
        return;
      }
      this.placeUnit(this.selectedUnit, row, column);
    }

    placeUnit(type, row, column) {
      const specification = UNIT_TYPES[type];
      if (!specification) return false;
      if (this.unitAt(row, column)) {
        this.announce(`Lane ${row + 1}, column ${column + 1} is occupied.`);
        return false;
      }
      if (this.cooldowns[type] > 0.05) {
        this.announce(
          `${specification.label} is recharging for ${Math.ceil(this.cooldowns[type])} seconds.`,
        );
        return false;
      }
      if (this.energy < specification.cost) {
        this.announce(
          `${specification.label} needs ${specification.cost} energy. You have ${this.energy}.`,
        );
        return false;
      }

      this.energy -= specification.cost;
      this.cooldowns[type] = specification.cooldown;
      this.units.push({
        id: ++this.entityId,
        type,
        row,
        column,
        health: specification.health,
        maxHealth: specification.health,
        timer:
          type === "lumen"
            ? specification.productionTime * 0.68
            : specification.fireTime || 0,
        armed: type !== "mine",
        armTimer: specification.armTime || 0,
      });
      this.announce(
        `${specification.label} deployed in lane ${row + 1}, column ${column + 1}.`,
      );
      this.syncInterface(true);
      this.draw();
      return true;
    }

    unitAt(row, column) {
      return this.units.find(
        (unit) =>
          unit.health > 0 && unit.row === row && unit.column === column,
      );
    }

    collectEnergyAtPoint(point) {
      const node = this.energyNodes.find((candidate) => {
        const pixel = this.energyNodePixel(candidate);
        const distance = Math.hypot(point.x - pixel.x, point.y - pixel.y);
        return distance <= Math.max(18, this.board.cell * 0.38);
      });
      if (!node) return false;

      node.collected = true;
      this.energy = Math.min(999, this.energy + node.value);
      this.score += node.value * 2;
      this.announce(`${node.value} energy collected. Total ${this.energy}.`);
      this.energyNodes = this.energyNodes.filter((candidate) => !candidate.collected);
      this.syncInterface(true);
      this.draw();
      return true;
    }

    spawnEnergyNode(x, targetY, value = 25, falling = false) {
      if (this.energyNodes.length >= 12) return;
      this.energyNodes.push({
        id: ++this.entityId,
        x: clamp(x, 0.15, COLUMN_COUNT - 0.15),
        y: falling ? -0.45 : targetY - 0.35,
        targetY: clamp(targetY, 0.1, ROW_COUNT - 0.1),
        value,
        age: 0,
        lifetime: 10,
        falling,
        collected: false,
      });
    }

    spawnEnemy(type) {
      const specification = ENEMY_TYPES[type] || ENEMY_TYPES.drifter;
      const laneLoads = Array.from({ length: ROW_COUNT }, (_, row) => ({
        row,
        count: this.enemies.filter((enemy) => enemy.row === row).length,
      }));
      const minimumLoad = Math.min(...laneLoads.map((lane) => lane.count));
      const candidates = laneLoads.filter(
        (lane) => lane.count <= minimumLoad + (Math.random() > 0.72 ? 1 : 0),
      );
      const row = candidates[Math.floor(Math.random() * candidates.length)].row;

      this.enemies.push({
        id: ++this.entityId,
        type,
        row,
        x: COLUMN_COUNT + 0.62 + Math.random() * 0.25,
        health: specification.health,
        maxHealth: specification.health,
        slowTimer: 0,
        rewarded: false,
      });
    }

    updateWave(delta) {
      if (this.waveIndex < 0 || this.waveIndex >= WAVES.length) return;
      const wave = WAVES[this.waveIndex];

      if (this.waveSpawned < wave.count) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          const type = wave.pool[Math.floor(Math.random() * wave.pool.length)];
          this.spawnEnemy(type);
          this.waveSpawned += 1;
          const jitter = 0.78 + Math.random() * 0.44;
          this.spawnTimer = wave.interval * jitter;
        }
        return;
      }

      if (this.enemies.length > 0) return;
      if (this.waveIndex === WAVES.length - 1) {
        this.score += this.energy * 3 + this.units.length * 75;
        this.finishRound("won");
        return;
      }

      if (!this.waitingForWave) {
        this.waitingForWave = true;
        this.waveBreakTimer = 4;
        this.energy = Math.min(999, this.energy + 50);
        this.announce(
          `Wave ${this.waveIndex + 1} cleared. Fifty reserve energy added.`,
        );
        this.syncInterface(true);
      } else {
        this.waveBreakTimer -= delta;
        if (this.waveBreakTimer <= 0) this.beginWave(this.waveIndex + 1);
      }
    }

    updateCooldowns(delta) {
      UNIT_ORDER.forEach((type) => {
        this.cooldowns[type] = Math.max(0, this.cooldowns[type] - delta);
      });
    }

    updateUnits(delta) {
      this.units.forEach((unit) => {
        if (unit.health <= 0) return;
        const specification = UNIT_TYPES[unit.type];

        if (unit.type === "lumen") {
          unit.timer -= delta;
          if (unit.timer <= 0) {
            this.spawnEnergyNode(
              unit.column + 0.5,
              unit.row + 0.5,
              25,
              false,
            );
            unit.timer += specification.productionTime;
          }
          return;
        }

        if (unit.type === "mine") {
          if (!unit.armed) {
            unit.armTimer -= delta;
            if (unit.armTimer <= 0) unit.armed = true;
          }
          return;
        }

        if (!specification.fireTime) return;
        const hasTarget = this.enemies.some(
          (enemy) =>
            enemy.health > 0 &&
            enemy.row === unit.row &&
            enemy.x > unit.column + 0.15,
        );
        if (!hasTarget) {
          unit.timer = Math.min(unit.timer, specification.fireTime * 0.25);
          return;
        }

        unit.timer -= delta;
        if (unit.timer <= 0) {
          this.projectiles.push({
            id: ++this.entityId,
            type: unit.type,
            row: unit.row,
            x: unit.column + 0.82,
            damage: specification.damage,
            speed: specification.projectileSpeed,
            slowFactor: specification.slowFactor || 1,
            slowTime: specification.slowTime || 0,
            spent: false,
          });
          unit.timer += specification.fireTime;
        }
      });
    }

    updateProjectiles(delta) {
      this.projectiles.forEach((projectile) => {
        if (projectile.spent) return;
        const previousX = projectile.x;
        projectile.x += projectile.speed * delta;
        const hits = this.enemies
          .filter(
            (enemy) =>
              enemy.health > 0 &&
              enemy.row === projectile.row &&
              enemy.x >= previousX - 0.2 &&
              enemy.x <= projectile.x + 0.22,
          )
          .sort((first, second) => first.x - second.x);
        const enemy = hits[0];
        if (!enemy) return;

        enemy.health -= projectile.damage;
        if (projectile.slowTime > 0) {
          enemy.slowTimer = Math.max(enemy.slowTimer, projectile.slowTime);
          enemy.slowFactor = projectile.slowFactor;
        }
        projectile.spent = true;
      });

      this.projectiles = this.projectiles.filter(
        (projectile) => !projectile.spent && projectile.x < COLUMN_COUNT + 1.3,
      );
    }

    detonateMine(unit) {
      const specification = UNIT_TYPES.mine;
      this.enemies.forEach((enemy) => {
        if (
          enemy.health > 0 &&
          enemy.row === unit.row &&
          Math.abs(enemy.x - (unit.column + 0.5)) <= specification.blastRadius
        ) {
          enemy.health -= specification.damage;
        }
      });
      unit.health = 0;
      this.score += 40;
    }

    updateEnemies(delta) {
      for (const enemy of this.enemies) {
        if (enemy.health <= 0 || this.state !== "running") continue;
        const specification = ENEMY_TYPES[enemy.type];
        if (enemy.slowTimer > 0) enemy.slowTimer -= delta;
        const slowFactor = enemy.slowTimer > 0 ? enemy.slowFactor || 0.52 : 1;

        const blockingUnit = this.units
          .filter(
            (unit) =>
              unit.health > 0 &&
              unit.row === enemy.row &&
              Math.abs(enemy.x - (unit.column + 0.5)) < 0.66,
          )
          .sort((first, second) => second.column - first.column)[0];

        if (blockingUnit) {
          if (blockingUnit.type === "mine" && blockingUnit.armed) {
            this.detonateMine(blockingUnit);
          } else {
            blockingUnit.health -= specification.damage * delta;
          }
        } else {
          enemy.x -= specification.speed * slowFactor * delta;
        }

        if (enemy.x >= -0.05) continue;
        const sweeper = this.sweepers[enemy.row];
        if (!sweeper.used) {
          sweeper.used = true;
          sweeper.active = true;
          sweeper.x = -0.48;
          enemy.x = 0.02;
          this.announce(`Emergency sweep activated in lane ${enemy.row + 1}.`);
        } else if (!sweeper.active) {
          return true;
        }
      }
      return false;
    }

    updateSweepers(delta) {
      this.sweepers.forEach((sweeper) => {
        if (!sweeper.active) return;
        sweeper.x += 5.4 * delta;
        this.enemies.forEach((enemy) => {
          if (
            enemy.health > 0 &&
            enemy.row === sweeper.row &&
            Math.abs(enemy.x - sweeper.x) < 0.72
          ) {
            enemy.health = 0;
          }
        });
        if (sweeper.x > COLUMN_COUNT + 1.2) sweeper.active = false;
      });
    }

    updateEnergyNodes(delta) {
      this.skyEnergyTimer -= delta;
      if (this.skyEnergyTimer <= 0) {
        this.spawnEnergyNode(
          0.5 + Math.random() * (COLUMN_COUNT - 1),
          0.55 + Math.random() * (ROW_COUNT - 1.1),
          25,
          true,
        );
        this.skyEnergyTimer = 5.4 + Math.random() * 2.2;
      }

      this.energyNodes.forEach((node) => {
        node.age += delta;
        if (node.falling && node.y < node.targetY) {
          node.y = Math.min(node.targetY, node.y + delta * 1.35);
        }
      });
      this.energyNodes = this.energyNodes.filter(
        (node) => !node.collected && node.age < node.lifetime,
      );
    }

    removeDeadUnits() {
      this.units = this.units.filter((unit) => unit.health > 0);
    }

    removeDeadEnemies(allowEnergyDrop = true) {
      this.enemies.forEach((enemy) => {
        if (enemy.health > 0 || enemy.rewarded) return;
        enemy.rewarded = true;
        const specification = ENEMY_TYPES[enemy.type];
        this.score += specification.score;
        if (allowEnergyDrop && Math.random() < 0.14) {
          this.spawnEnergyNode(
            clamp(enemy.x, 0.25, COLUMN_COUNT - 0.25),
            enemy.row + 0.5,
            25,
            false,
          );
        }
      });
      this.enemies = this.enemies.filter((enemy) => enemy.health > 0);
    }

    update(delta) {
      if (this.state !== "running") return;
      this.updateCooldowns(delta);
      this.updateWave(delta);
      if (this.state !== "running") return;
      this.updateUnits(delta);
      this.updateProjectiles(delta);
      const breached = this.updateEnemies(delta);
      if (breached) {
        this.removeDeadUnits();
        this.removeDeadEnemies(false);
        this.finishRound("lost");
        return;
      }
      this.updateSweepers(delta);
      this.updateEnergyNodes(delta);
      this.removeDeadUnits();
      this.removeDeadEnemies();
      this.waveBannerTimer = Math.max(0, this.waveBannerTimer - delta);
      this.syncInterface();
    }

    queueFrame() {
      if (
        this.frameId ||
        this.state !== "running" ||
        this.suspended
      ) {
        return;
      }
      this.frameId = requestAnimationFrame(this.onFrame);
    }

    onFrame(time) {
      this.frameId = 0;
      if (this.state !== "running" || this.suspended) return;

      if (!this.lastTime) this.lastTime = time;
      const delta = Math.min(MAX_FRAME_STEP, (time - this.lastTime) / 1_000);
      this.lastTime = time;
      this.accumulator += delta;

      let steps = 0;
      while (
        this.accumulator >= FIXED_STEP &&
        steps < MAX_CATCH_UP_STEPS &&
        this.state === "running"
      ) {
        this.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (steps === MAX_CATCH_UP_STEPS) this.accumulator = 0;

      this.draw();
      this.queueFrame();
    }

    syncInterface(force = false) {
      const cooldownSignature = UNIT_ORDER.map((type) =>
        Math.ceil(this.cooldowns[type] * 5),
      ).join(",");
      const signature = [
        this.state,
        this.energy,
        this.waveIndex,
        this.score,
        this.selectedUnit,
        this.removeMode,
        this.waitingForWave,
        cooldownSignature,
      ].join("|");
      if (!force && signature === this.interfaceSignature) return;
      this.interfaceSignature = signature;

      const stateLabels = {
        ready: "STATUS / READY",
        running: this.waitingForWave ? "STATUS / RE-GRID" : "STATUS / ACTIVE",
        paused: "STATUS / PAUSED",
        won: "STATUS / SECURE",
        lost: "STATUS / BREACHED",
      };
      const actionLabels = {
        ready: "START",
        running: "PAUSE",
        paused: "RESUME",
        won: "REPLAY",
        lost: "REPLAY",
      };

      if (this.stateOutput) this.stateOutput.textContent = stateLabels[this.state];
      if (this.energyOutput) this.energyOutput.textContent = String(this.energy);
      if (this.waveOutput) {
        const wave = this.waveIndex < 0 ? 0 : this.waveIndex + 1;
        this.waveOutput.textContent = `${String(wave).padStart(2, "0")}/${String(
          WAVES.length,
        ).padStart(2, "0")}`;
      }
      if (this.scoreOutput) {
        this.scoreOutput.textContent = String(this.score).padStart(6, "0");
      }
      if (this.actionButton) {
        const label = actionLabels[this.state];
        this.actionButton.textContent = label;
        this.actionButton.setAttribute(
          "aria-label",
          label === "PAUSE"
            ? "Pause Garden Guard"
            : label === "RESUME"
              ? "Resume Garden Guard"
              : label === "REPLAY"
                ? "Replay Garden Guard"
                : "Start Garden Guard",
        );
      }

      this.unitButtons.forEach((button) => {
        const type = button.dataset.gardenUnit;
        const specification = UNIT_TYPES[type];
        if (!specification) return;
        const cooldown = this.cooldowns[type];
        const unavailable = cooldown > 0.05 || this.energy < specification.cost;
        button.setAttribute(
          "aria-pressed",
          String(!this.removeMode && this.selectedUnit === type),
        );
        button.setAttribute("aria-disabled", String(unavailable));
        button.style.setProperty(
          "--garden-cooldown",
          String(clamp(cooldown / specification.cooldown, 0, 1)),
        );
        const detail =
          cooldown > 0.05
            ? `${Math.ceil(cooldown)} seconds recharge remaining`
            : `${specification.cost} energy`;
        button.setAttribute("aria-label", `Select ${specification.label}, ${detail}`);
      });
      this.removeButton?.setAttribute("aria-pressed", String(this.removeMode));
    }

    energyNodePixel(node) {
      return {
        x: this.board.x + node.x * this.board.cell,
        y: this.board.y + node.y * this.board.cell,
      };
    }

    setupContext() {
      const { pixelRatio } = this.viewport;
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.context.clearRect(0, 0, this.viewport.width, this.viewport.height);
      this.context.lineCap = "square";
      this.context.lineJoin = "miter";
    }

    drawBackground() {
      const context = this.context;
      const { width, height } = this.viewport;
      context.fillStyle = this.colors.background;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = this.colors.grid;
      context.lineWidth = 1;
      const grid = Math.max(18, Math.round(Math.min(width, height) / 24));
      context.beginPath();
      for (let x = 0.5; x < width; x += grid) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = 0.5; y < height; y += grid) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
    }

    drawStatus() {
      const context = this.context;
      const { width } = this.viewport;
      const y = Math.max(
        this.board.toolbarBottom + 16,
        this.board.y - Math.max(9, this.board.cell * 0.18),
      );
      context.fillStyle = this.colors.muted;
      context.font = `700 ${clamp(this.board.cell * 0.15, 8, 12)}px ${this.colors.mono}`;
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.fillText(
        `ENERGY ${String(this.energy).padStart(3, "0")}  /  WAVE ${Math.max(
          0,
          this.waveIndex + 1,
        )}.${WAVES.length}`,
        Math.max(8, this.board.x),
        y,
      );
      context.textAlign = "right";
      context.fillText(
        `SCORE ${String(this.score).padStart(6, "0")}  /  BEST ${String(
          this.bestScore,
        ).padStart(6, "0")}`,
        Math.min(width - 8, this.board.x + this.board.width),
        y,
      );
    }

    drawBoard() {
      const context = this.context;
      const { x, y, cell } = this.board;

      for (let row = 0; row < ROW_COUNT; row += 1) {
        for (let column = 0; column < COLUMN_COUNT; column += 1) {
          context.globalAlpha = (row + column) % 2 === 0 ? 0.11 : 0.055;
          context.fillStyle = this.colors.accent;
          context.fillRect(
            x + column * cell,
            y + row * cell,
            cell,
            cell,
          );
        }
      }
      context.globalAlpha = 1;
      context.strokeStyle = this.colors.line;
      context.lineWidth = 1;
      context.beginPath();
      for (let column = 0; column <= COLUMN_COUNT; column += 1) {
        const lineX = x + column * cell + 0.5;
        context.moveTo(lineX, y);
        context.lineTo(lineX, y + ROW_COUNT * cell);
      }
      for (let row = 0; row <= ROW_COUNT; row += 1) {
        const lineY = y + row * cell + 0.5;
        context.moveTo(x, lineY);
        context.lineTo(x + COLUMN_COUNT * cell, lineY);
      }
      context.stroke();

      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 1.5;
      context.strokeRect(x + 0.5, y + 0.5, COLUMN_COUNT * cell, ROW_COUNT * cell);

      context.fillStyle = this.colors.faint;
      context.font = `700 ${clamp(cell * 0.13, 7, 11)}px ${this.colors.mono}`;
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let row = 0; row < ROW_COUNT; row += 1) {
        context.fillText(
          `L${row + 1}`,
          x - cell * 0.56,
          y + (row + 0.5) * cell,
        );
      }
    }

    drawHealthBar(entity, centerX, topY, width) {
      const context = this.context;
      const ratio = clamp(entity.health / entity.maxHealth, 0, 1);
      const barHeight = Math.max(2, this.board.cell * 0.045);
      context.fillStyle = this.colors.surfaceRaised;
      context.fillRect(centerX - width / 2, topY, width, barHeight);
      context.fillStyle = ratio < 0.3 ? this.colors.danger : this.colors.accent;
      context.fillRect(centerX - width / 2, topY, width * ratio, barHeight);
    }

    drawUnit(unit) {
      const context = this.context;
      const specification = UNIT_TYPES[unit.type];
      const cell = this.board.cell;
      const centerX = this.board.x + (unit.column + 0.5) * cell;
      const centerY = this.board.y + (unit.row + 0.55) * cell;
      const radius = cell * 0.22;

      context.save();
      context.translate(centerX, centerY);
      context.strokeStyle = specification.color;
      context.fillStyle = this.colors.surface;
      context.lineWidth = Math.max(1.5, cell * 0.026);

      context.beginPath();
      context.moveTo(0, radius * 0.2);
      context.lineTo(0, radius * 1.18);
      context.moveTo(-radius * 0.8, radius * 0.68);
      context.quadraticCurveTo(-radius * 0.25, radius * 0.35, 0, radius * 0.8);
      context.moveTo(radius * 0.8, radius * 0.68);
      context.quadraticCurveTo(radius * 0.25, radius * 0.35, 0, radius * 0.8);
      context.stroke();

      if (unit.type === "lumen") {
        for (let index = 0; index < 8; index += 1) {
          context.save();
          context.rotate((Math.PI * 2 * index) / 8);
          context.strokeRect(-radius * 0.16, -radius * 1.05, radius * 0.32, radius * 0.46);
          context.restore();
        }
        context.beginPath();
        context.arc(0, 0, radius * 0.58, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = specification.color;
        context.beginPath();
        context.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
        context.fill();
      } else if (unit.type === "pulse" || unit.type === "frost") {
        context.beginPath();
        context.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.strokeRect(radius * 0.48, -radius * 0.25, radius * 0.82, radius * 0.5);
        if (unit.type === "frost") {
          context.beginPath();
          context.moveTo(-radius * 0.75, 0);
          context.lineTo(radius * 0.75, 0);
          context.moveTo(0, -radius * 0.75);
          context.lineTo(0, radius * 0.75);
          context.stroke();
        }
      } else if (unit.type === "bulwark") {
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
          const pointX = Math.cos(angle) * radius * 0.95;
          const pointY = Math.sin(angle) * radius * 1.15;
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(-radius * 0.45, -radius * 0.2);
        context.lineTo(radius * 0.45, radius * 0.2);
        context.moveTo(-radius * 0.45, radius * 0.3);
        context.lineTo(radius * 0.45, -radius * 0.1);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(0, radius * 0.22, radius * 0.72, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        for (let index = 0; index < 6; index += 1) {
          const angle = (Math.PI * 2 * index) / 6;
          context.beginPath();
          context.moveTo(
            Math.cos(angle) * radius * 0.72,
            radius * 0.22 + Math.sin(angle) * radius * 0.72,
          );
          context.lineTo(
            Math.cos(angle) * radius * 1.05,
            radius * 0.22 + Math.sin(angle) * radius * 1.05,
          );
          context.stroke();
        }
        if (!unit.armed) {
          context.fillStyle = specification.color;
          context.fillRect(-radius * 0.38, radius * 0.08, radius * 0.76, radius * 0.22);
        }
      }
      context.restore();

      this.drawHealthBar(
        unit,
        centerX,
        this.board.y + unit.row * cell + cell * 0.1,
        cell * 0.52,
      );
    }

    drawEnemy(enemy) {
      const context = this.context;
      const specification = ENEMY_TYPES[enemy.type];
      const cell = this.board.cell;
      const centerX = this.board.x + enemy.x * cell;
      const centerY = this.board.y + (enemy.row + 0.57) * cell;
      const size = cell * 0.24 * specification.scale;

      context.save();
      context.translate(centerX, centerY);
      context.strokeStyle = specification.color;
      context.fillStyle = this.colors.surfaceRaised;
      context.lineWidth = Math.max(1.5, cell * 0.025);
      context.strokeRect(-size * 0.75, -size * 0.9, size * 1.5, size * 1.55);
      context.fillRect(-size * 0.75, -size * 0.9, size * 1.5, size * 1.55);
      context.beginPath();
      context.moveTo(-size * 0.45, size * 0.65);
      context.lineTo(-size * 0.7, size * 1.18);
      context.moveTo(size * 0.45, size * 0.65);
      context.lineTo(size * 0.7, size * 1.18);
      context.moveTo(-size * 0.2, -size * 0.9);
      context.lineTo(-size * 0.35, -size * 1.28);
      context.moveTo(size * 0.2, -size * 0.9);
      context.lineTo(size * 0.35, -size * 1.28);
      context.stroke();
      context.fillStyle = specification.color;
      context.fillRect(-size * 0.42, -size * 0.45, size * 0.22, size * 0.18);
      context.fillRect(size * 0.2, -size * 0.45, size * 0.22, size * 0.18);

      if (enemy.type === "shield" || enemy.type === "hauler") {
        context.strokeRect(-size * 1.08, -size * 0.62, size * 0.38, size * 1.08);
      }
      if (enemy.slowTimer > 0) {
        context.strokeStyle = UNIT_TYPES.frost.color;
        context.setLineDash([size * 0.3, size * 0.2]);
        context.strokeRect(-size, -size * 1.18, size * 2, size * 2.32);
      }
      context.restore();

      this.drawHealthBar(
        enemy,
        centerX,
        this.board.y + enemy.row * cell + cell * 0.08,
        cell * 0.5,
      );
    }

    drawProjectiles() {
      const context = this.context;
      const cell = this.board.cell;
      this.projectiles.forEach((projectile) => {
        const x = this.board.x + projectile.x * cell;
        const y = this.board.y + (projectile.row + 0.5) * cell;
        const radius = clamp(cell * 0.09, 3, 9);
        context.fillStyle =
          projectile.type === "frost"
            ? UNIT_TYPES.frost.color
            : UNIT_TYPES.pulse.color;
        context.beginPath();
        if (projectile.type === "frost") {
          context.moveTo(x, y - radius);
          context.lineTo(x + radius, y);
          context.lineTo(x, y + radius);
          context.lineTo(x - radius, y);
          context.closePath();
        } else {
          context.arc(x, y, radius, 0, Math.PI * 2);
        }
        context.fill();
      });
    }

    drawEnergyNodes() {
      const context = this.context;
      const cell = this.board.cell;
      this.energyNodes.forEach((node) => {
        const point = this.energyNodePixel(node);
        const pulse = this.reducedMotion ? 1 : 1 + Math.sin(node.age * 4) * 0.08;
        const radius = clamp(cell * 0.2 * pulse, 9, 22);
        context.save();
        context.translate(point.x, point.y);
        context.strokeStyle = this.colors.energy;
        context.fillStyle = this.colors.surface;
        context.lineWidth = 2;
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(-radius * 0.46, 0);
        context.lineTo(radius * 0.46, 0);
        context.moveTo(0, -radius * 0.46);
        context.lineTo(0, radius * 0.46);
        context.stroke();
        context.restore();
      });
    }

    drawSweepers() {
      const context = this.context;
      const cell = this.board.cell;
      this.sweepers.forEach((sweeper) => {
        if (sweeper.used && !sweeper.active) return;
        const logicalX = sweeper.active ? sweeper.x : -0.42;
        const x = this.board.x + logicalX * cell;
        const y = this.board.y + (sweeper.row + 0.5) * cell;
        const width = cell * 0.44;
        const height = cell * 0.3;
        context.save();
        context.translate(x, y);
        context.strokeStyle = sweeper.active
          ? this.colors.danger
          : this.colors.accent;
        context.fillStyle = this.colors.surfaceRaised;
        context.lineWidth = Math.max(1.5, cell * 0.025);
        context.fillRect(-width / 2, -height / 2, width, height);
        context.strokeRect(-width / 2, -height / 2, width, height);
        context.beginPath();
        context.moveTo(width * 0.5, -height * 0.45);
        context.lineTo(width * 0.82, 0);
        context.lineTo(width * 0.5, height * 0.45);
        context.stroke();
        context.restore();
      });
    }

    drawCursor() {
      if (!this.stage.matches(":focus-within") && !this.selectedUnit && !this.removeMode) {
        return;
      }
      const context = this.context;
      const cell = this.board.cell;
      const x = this.board.x + this.cursor.column * cell;
      const y = this.board.y + this.cursor.row * cell;
      const valid = this.removeMode
        ? Boolean(this.unitAt(this.cursor.row, this.cursor.column))
        : Boolean(
            this.selectedUnit &&
              !this.unitAt(this.cursor.row, this.cursor.column) &&
              this.energy >= UNIT_TYPES[this.selectedUnit].cost &&
              this.cooldowns[this.selectedUnit] <= 0.05,
          );
      context.save();
      context.strokeStyle = valid ? this.colors.accent : this.colors.danger;
      context.lineWidth = 2;
      context.setLineDash([Math.max(4, cell * 0.12), Math.max(3, cell * 0.08)]);
      context.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      context.restore();
    }

    drawWaveBanner() {
      if (this.waveBannerTimer <= 0 || this.waveIndex < 0) return;
      const context = this.context;
      const width = clamp(this.board.cell * 3.8, 150, 310);
      const height = clamp(this.board.cell * 0.72, 34, 60);
      const x = this.board.x + this.board.width / 2 - width / 2;
      const y = this.board.y + this.board.height / 2 - height / 2;
      context.fillStyle = this.colors.surface;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 1;
      context.fillRect(x, y, width, height);
      context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      context.fillStyle = this.colors.text;
      context.font = `700 ${clamp(height * 0.28, 10, 16)}px ${this.colors.mono}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        `WAVE ${String(this.waveIndex + 1).padStart(2, "0")} / ${String(
          WAVES.length,
        ).padStart(2, "0")}`,
        x + width / 2,
        y + height / 2,
      );
    }

    draw() {
      if (this.viewport.width < 2 || this.viewport.height < 2) return;
      this.setupContext();
      this.drawBackground();
      this.drawStatus();
      this.drawBoard();
      this.drawSweepers();
      this.units.forEach((unit) => this.drawUnit(unit));
      this.drawProjectiles();
      this.enemies.forEach((enemy) => this.drawEnemy(enemy));
      this.drawEnergyNodes();
      this.drawCursor();
      this.drawWaveBanner();
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-garden-game]").forEach((root) => {
      if (root.dataset.gardenReady === "true") return;
      root.dataset.gardenReady = "true";
      new GardenGuardGame(root);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
