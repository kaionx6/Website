(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-grid-command-best";
  const LEGACY_BEST_SCORE_KEY = "kelvin-garden-guard-best";
  const ROW_COUNT = 5;
  const COLUMN_COUNT = 9;
  const MAX_ENERGY = 2_000;
  const FIXED_STEP = 1 / 60;
  const MAX_FRAME_STEP = 0.05;
  const MAX_CATCH_UP_STEPS = 5;
  const LANE_PHASES = [
    { fromLevel: 1, rows: [2], label: "CENTRE LANE" },
    { fromLevel: 3, rows: [1, 2, 3], label: "MIDDLE THREE" },
    { fromLevel: 6, rows: [0, 1, 2, 3, 4], label: "ALL FIVE" },
  ];

  const UNIT_TYPES = {
    lumen: {
      label: "Supply Relay",
      cost: 50,
      cooldown: 5,
      health: 250,
      productionTime: 7.5,
      description: "Produces 25 supply every 7.5 seconds. Deploy it early, then collect each supply cell.",
      color: "#e6c84c",
    },
    pulse: {
      label: "Sentry Cannon",
      cost: 100,
      cooldown: 4.5,
      health: 310,
      fireTime: 1.15,
      damage: 26,
      projectileSpeed: 3.6,
      description: "Reliable automatic fire down one lane. Establish a firing line before the patrol arrives.",
      color: "#58b968",
    },
    bulwark: {
      label: "Field Barrier",
      cost: 75,
      cooldown: 8,
      health: 1_100,
      description: "A 1,100-integrity barricade that buys your weapons time. It deals no damage.",
      color: "#8da3b8",
    },
    frost: {
      label: "Cryo Turret",
      cost: 175,
      cooldown: 7,
      health: 285,
      fireTime: 1.65,
      damage: 20,
      projectileSpeed: 3.1,
      slowFactor: 0.52,
      slowTime: 2.7,
      description: "Deals light damage and slows targets to 52% speed for 2.7 seconds. Pair it with cannons.",
      color: "#6ec9dc",
    },
    mine: {
      label: "Proximity Mine",
      cost: 25,
      cooldown: 18,
      health: 180,
      armTime: 5.5,
      damage: 390,
      blastRadius: 1.2,
      description: "Arms after 5.5 seconds, then deals 390 damage in a compact blast. Cheap, but slow to recharge.",
      color: "#d58a4a",
    },
    burst: {
      label: "Twin Cannon",
      cost: 200,
      cooldown: 7,
      health: 310,
      fireTime: 1.15,
      damage: 26,
      projectileSpeed: 3.6,
      shots: 2,
      burstSpacing: 0.14,
      description: "Fires two rounds per volley into one lane. Expensive, dependable lane suppression.",
      color: "#4ea47f",
    },
    nova: {
      label: "Demolition Charge",
      cost: 150,
      cooldown: 25,
      health: 220,
      fuseTime: 0.65,
      damage: 1_000,
      blastRadius: 1.5,
      blastRows: 1,
      description: "Detonates after a short fuse for 1,000 damage across its lane and both adjacent lanes.",
      color: "#d95b63",
    },
    snap: {
      label: "Hunter Drone",
      cost: 150,
      cooldown: 9,
      health: 440,
      attackRange: 1.18,
      damage: 1_000,
      chewTime: 18,
      description: "Destroys one close target with a heavy strike, then needs 18 seconds before engaging again.",
      color: "#9d6fc5",
    },
    triad: {
      label: "Crossfire Battery",
      cost: 325,
      cooldown: 8,
      health: 300,
      fireTime: 1.35,
      damage: 26,
      projectileSpeed: 3.5,
      laneSpread: 1,
      description: "Fires into its own lane and both adjacent active lanes. Strongest on the centre line.",
      color: "#4f93b7",
    },
  };

  const UNIT_ORDER = [
    "pulse",
    "lumen",
    "mine",
    "bulwark",
    "frost",
    "burst",
    "nova",
    "snap",
    "triad",
  ];
  const JAMMABLE_UNITS = new Set(["pulse", "frost", "burst", "snap", "triad"]);

  const ENEMY_TYPES = {
    drifter: {
      label: "Patrol Drone",
      health: 175,
      speed: 0.19,
      damage: 52,
      score: 100,
      scale: 0.82,
      color: "#b47b5d",
    },
    runner: {
      label: "Recon Skimmer",
      health: 110,
      speed: 0.34,
      damage: 38,
      score: 135,
      scale: 0.7,
      color: "#c99a54",
    },
    shield: {
      label: "Armoured Rig",
      health: 360,
      speed: 0.135,
      damage: 62,
      score: 190,
      scale: 0.92,
      color: "#7d91a8",
    },
    breacher: {
      label: "Assault Ram",
      health: 250,
      speed: 0.21,
      damage: 44,
      impactDamage: 175,
      score: 180,
      scale: 0.9,
      color: "#c56b52",
    },
    jammer: {
      label: "Signal Jammer",
      health: 220,
      speed: 0.16,
      damage: 46,
      jamRange: 2.65,
      jamDuration: 1.75,
      jamPeriod: 6,
      score: 220,
      scale: 0.86,
      color: "#a779c5",
    },
    repair: {
      label: "Repair Drone",
      health: 155,
      speed: 0.185,
      damage: 34,
      repairRange: 1.6,
      repairRows: 1,
      repairAmount: 42,
      repairPeriod: 3.4,
      score: 240,
      scale: 0.7,
      color: "#55b7a5",
    },
    artillery: {
      label: "Mortar Walker",
      health: 330,
      speed: 0.105,
      damage: 56,
      attackRange: 3.2,
      shotDamage: 75,
      fireTime: 4,
      score: 320,
      scale: 1,
      color: "#b45e68",
    },
    hauler: {
      label: "Siege Carrier",
      health: 760,
      speed: 0.085,
      damage: 92,
      score: 330,
      scale: 1.08,
      color: "#9d6a65",
    },
  };

  const LEVELS = [
    {
      title: "FIRST CONTACT",
      startingEnergy: 200,
      unlock: "pulse",
      waves: [
        { count: 4, interval: 4.8, pool: ["drifter"] },
        { count: 6, interval: 3.8, pool: ["drifter"] },
        { count: 10, interval: 2.2, pool: ["drifter"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "SUPPLY LINE",
      startingEnergy: 225,
      unlock: "lumen",
      waves: [
        { count: 5, interval: 4.4, pool: ["drifter", "drifter", "runner"], featured: { 1: "runner" } },
        { count: 8, interval: 3.5, pool: ["drifter", "drifter", "drifter", "runner"] },
        { count: 13, interval: 2, pool: ["drifter", "drifter", "runner", "runner"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "THREE-LANE FRONT",
      startingEnergy: 350,
      unlock: "mine",
      waves: [
        { count: 6, interval: 4.1, pool: ["drifter", "drifter", "runner", "shield"], featured: { 2: "shield" } },
        { count: 9, interval: 3.3, pool: ["drifter", "drifter", "runner", "runner", "shield"] },
        { count: 15, interval: 1.8, pool: ["drifter", "drifter", "runner", "runner", "shield", "shield"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "BREAKER COLUMN",
      startingEnergy: 375,
      unlock: "bulwark",
      waves: [
        { count: 7, interval: 3.9, pool: ["drifter", "drifter", "runner", "shield", "breacher"], featured: { 2: "breacher" } },
        { count: 10, interval: 3.1, pool: ["drifter", "runner", "runner", "shield", "shield", "breacher"] },
        { count: 17, interval: 1.65, pool: ["drifter", "runner", "runner", "shield", "shield", "breacher", "breacher"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "SIGNAL BLACKOUT",
      startingEnergy: 400,
      unlock: "frost",
      waves: [
        { count: 8, interval: 3.7, pool: ["drifter", "runner", "shield", "breacher", "jammer"], featured: { 3: "jammer" } },
        { count: 11, interval: 2.9, pool: ["drifter", "runner", "runner", "shield", "shield", "breacher", "jammer"] },
        { count: 19, interval: 1.5, pool: ["drifter", "runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "jammer"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "FULL PERIMETER",
      startingEnergy: 575,
      unlock: "burst",
      waves: [
        { count: 10, interval: 3.5, pool: ["drifter", "drifter", "runner", "runner", "shield", "breacher", "jammer", "repair"], featured: { 4: "repair" } },
        { count: 13, interval: 2.7, pool: ["drifter", "runner", "runner", "shield", "shield", "breacher", "jammer", "jammer", "repair"] },
        { count: 22, interval: 1.35, pool: ["drifter", "runner", "runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "jammer", "repair", "repair"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "LONG-RANGE FIRE",
      startingEnergy: 600,
      unlock: "nova",
      waves: [
        { count: 11, interval: 3.3, pool: ["drifter", "runner", "runner", "shield", "breacher", "jammer", "repair", "artillery"], featured: { 3: "artillery" } },
        { count: 15, interval: 2.5, pool: ["runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "repair", "artillery"] },
        { count: 25, interval: 1.2, pool: ["runner", "runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "jammer", "repair", "repair", "artillery", "artillery"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "HEAVY ARMOUR",
      startingEnergy: 625,
      unlock: "snap",
      waves: [
        { count: 12, interval: 3.1, pool: ["runner", "shield", "shield", "breacher", "jammer", "repair", "artillery", "hauler"], featured: { 3: "hauler" } },
        { count: 17, interval: 2.3, pool: ["runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "repair", "artillery", "artillery", "hauler"] },
        { count: 28, interval: 1.1, pool: ["runner", "runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "jammer", "repair", "repair", "artillery", "artillery", "hauler", "hauler"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "FINAL SIEGE",
      startingEnergy: 700,
      unlock: "triad",
      waves: [
        { count: 14, interval: 2.9, pool: ["runner", "runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler"] },
        { count: 20, interval: 2.1, pool: ["runner", "runner", "shield", "shield", "breacher", "breacher", "jammer", "jammer", "repair", "repair", "artillery", "artillery", "hauler"] },
        { count: 34, interval: 0.95, pool: ["runner", "runner", "runner", "shield", "shield", "shield", "breacher", "breacher", "breacher", "jammer", "jammer", "repair", "repair", "artillery", "artillery", "artillery", "hauler", "hauler"], featured: { 0: "hauler", 4: "artillery", 8: "repair", 12: "jammer", 16: "breacher" }, large: true, batchSize: 2 },
      ],
    },
    {
      title: "HARDENED LINE",
      startingEnergy: 800,
      unlock: "rail",
      waves: [
        { count: 15, interval: 2.8, pool: ["runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis"], featured: { 2: "aegis" } },
        { count: 22, interval: 2, pool: ["runner", "shield", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis", "aegis"] },
        { count: 38, interval: 0.85, pool: ["runner", "shield", "breacher", "breacher", "jammer", "repair", "artillery", "artillery", "hauler", "aegis", "aegis"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "COMMAND UPLINK",
      startingEnergy: 900,
      unlock: "service",
      waves: [
        { count: 17, interval: 2.6, pool: ["runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis", "commander"], featured: { 3: "commander" } },
        { count: 24, interval: 1.8, pool: ["runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis", "commander", "commander"] },
        { count: 42, interval: 0.75, pool: ["runner", "shield", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "hauler", "aegis", "commander", "commander"], large: true, batchSize: 2 },
      ],
    },
    {
      title: "OMEGA DEFENCE",
      startingEnergy: 1_000,
      unlock: "missile",
      waves: [
        { count: 20, interval: 2.4, pool: ["runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis", "commander", "carrier"], featured: { 2: "carrier" } },
        { count: 28, interval: 1.6, pool: ["runner", "shield", "breacher", "jammer", "repair", "artillery", "hauler", "aegis", "commander", "carrier", "carrier"] },
        { count: 48, interval: 0.65, pool: ["runner", "shield", "shield", "breacher", "breacher", "jammer", "repair", "artillery", "artillery", "hauler", "hauler", "aegis", "commander", "carrier", "carrier"], featured: { 0: "carrier", 6: "commander", 12: "aegis", 18: "hauler" }, large: true, batchSize: 3 },
      ],
    },
  ];

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const readBestScore = () => {
    try {
      const saved = localStorage.getItem(BEST_SCORE_KEY);
      const legacy = localStorage.getItem(LEGACY_BEST_SCORE_KEY);
      const value = Number.parseInt(saved || legacy, 10);
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

  class GridCommandGame {
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
        "Grid Command ready. The centre lane is online. Select a unit, then choose a lane and column.",
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
          if (this.selectUnit(button.dataset.gardenUnit)) this.focusStage();
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

    unlockLevelFor(type) {
      const index = LEVELS.findIndex((level) => level.unlock === type);
      return index >= 0 ? index + 1 : Number.POSITIVE_INFINITY;
    }

    currentLevel() {
      return clamp(this.levelIndex + 1, 1, LEVELS.length);
    }

    currentLevelConfig() {
      return LEVELS[clamp(this.levelIndex, 0, LEVELS.length - 1)] || LEVELS[0];
    }

    currentWaveConfig() {
      return this.currentLevelConfig().waves[this.waveIndex] || null;
    }

    lanePhaseForLevel(level = this.currentLevel()) {
      return [...LANE_PHASES]
        .reverse()
        .find((phase) => level >= phase.fromLevel) || LANE_PHASES[0];
    }

    activeRows(level = this.currentLevel()) {
      return this.lanePhaseForLevel(level).rows;
    }

    isLaneActive(row, level = this.currentLevel()) {
      return this.activeRows(level).includes(row);
    }

    laneUnlockLevel(row) {
      const phase = LANE_PHASES.find((candidate) => candidate.rows.includes(row));
      return phase?.fromLevel ?? Number.POSITIVE_INFINITY;
    }

    nearestActiveRow(row) {
      return this.activeRows().reduce((nearest, candidate) =>
        Math.abs(candidate - row) < Math.abs(nearest - row)
          ? candidate
          : nearest,
      );
    }

    activeLaneDescription(level = this.currentLevel()) {
      const phase = this.lanePhaseForLevel(level);
      if (phase.rows.length === 1) return "One centre lane active.";
      if (phase.rows.length === 3) return "The middle three lanes are active.";
      return "All five lanes are active.";
    }

    isUnitUnlocked(type) {
      return this.unlockLevelFor(type) <= this.currentLevel();
    }

    resetBattlefield(startingEnergy) {
      this.energy = clamp(startingEnergy, 0, MAX_ENERGY);
      this.waveIndex = -1;
      this.waveSpawned = 0;
      this.waveDefeated = 0;
      this.spawnTimer = 0;
      this.waitingForWave = false;
      this.waveBreakTimer = 0;
      this.waveBannerTimer = 0;
      this.laneRevealTimer = 0;
      this.newlyActivatedRows = [];
      this.lastFeaturedEnemy = null;
      this.skyEnergyTimer = 2.5;
      this.selectedUnit = this.currentLevelConfig().unlock || UNIT_ORDER[0];
      this.removeMode = false;
      this.cursor = { row: 2, column: 2 };
      this.units = [];
      this.enemies = [];
      this.projectiles = [];
      this.energyNodes = [];
      this.effects = [];
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

    prepareLevel(index, completedLevelIndex = null) {
      const previousRows = this.activeRows();
      this.levelIndex = clamp(index, 0, LEVELS.length - 1);
      const level = this.currentLevelConfig();
      const nextRows = this.activeRows();
      this.pendingActivatedRows = nextRows.filter(
        (row) => !previousRows.includes(row),
      );
      this.resetBattlefield(level.startingEnergy);
      this.lastUnlockedUnit = level.unlock;
      this.state = "briefing";
      this.pauseReason = "";
      this.lastTime = 0;
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;

      const title = completedLevelIndex === null
        ? "CAMPAIGN BRIEFING"
        : `LEVEL ${String(completedLevelIndex + 1).padStart(2, "0")} SECURE`;
      const specification = UNIT_TYPES[level.unlock];
      const meta = `NEW TOWER / ${specification.label.toUpperCase()} / ${specification.cost} SP`;
      const detail = `${specification.description} ${level.waves.length} waves incoming.`;
      this.setOverlay(true, title, meta, detail, "briefing");
      this.announce(
        `${title}. ${specification.label} unlocked for level ${this.currentLevel()} of ${LEVELS.length}. ${specification.description} Press Deploy when ready.`,
      );
      this.syncInterface(true);
      this.draw();
    }

    resetCampaign() {
      this.score = 0;
      this.levelIndex = 0;
      this.pendingActivatedRows = [];
      this.prepareLevel(0);
    }

    startPreparedLevel() {
      if (this.state !== "briefing") return;
      this.state = "running";
      this.newlyActivatedRows = [...this.pendingActivatedRows];
      this.pendingActivatedRows = [];
      this.laneRevealTimer =
        this.reducedMotion || !this.newlyActivatedRows.length ? 0 : 1.25;
      this.setOverlay(false);
      window.KelvinGameAudio?.play?.("game-start");
      this.beginWave(0, 5.5);
      this.syncInterface(true);
      this.focusStage();
      this.queueFrame();
    }

    resumeRound() {
      if (this.state !== "paused") return;
      this.state = "running";
      this.pauseReason = "";
      this.lastTime = 0;
      this.setOverlay(false);
      window.KelvinGameAudio?.play?.("resume");
      this.announce("Operation resumed.");
      this.syncInterface(true);
      this.queueFrame();
      this.focusStage();
    }

    startRound() {
      if (this.state === "paused") {
        this.resumeRound();
        return;
      }
      if (this.state === "briefing") {
        this.startPreparedLevel();
        return;
      }
      if (this.state === "won" || this.state === "lost") {
        this.resetCampaign();
      }
    }

    pauseRound(reason = "manual") {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseReason = reason;
      this.lastTime = 0;
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      const waveTotal = this.currentLevelConfig().waves.length;
      this.setOverlay(
        true,
        "OPERATION PAUSED",
        `LEVEL ${String(this.currentLevel()).padStart(2, "0")} / WAVE ${String(this.waveIndex + 1).padStart(2, "0")} OF ${String(waveTotal).padStart(2, "0")}`,
        "Combat, cooldowns, supply production, and wave timers are frozen.",
        "paused",
      );
      this.syncInterface(true);
      if (reason === "manual") {
        window.KelvinGameAudio?.play?.("pause");
        this.announce("Operation paused.");
      }
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
        window.KelvinGameAudio?.play?.("victory");
        this.setOverlay(
          true,
          "CAMPAIGN COMPLETE",
          `ALL ${LEVELS.length} LEVELS SECURE`,
          `Final score ${this.score}. Press Replay to begin a new campaign.`,
          "won",
        );
        this.announce(
          `Sector secured. Final score ${this.score}. Press Replay to deploy again.`,
        );
      } else {
        window.KelvinGameAudio?.play?.("game-over");
        this.setOverlay(
          true,
          "SECTOR BREACHED",
          `LEVEL ${String(this.currentLevel()).padStart(2, "0")} / WAVE ${String(this.waveIndex + 1).padStart(2, "0")}`,
          `Score ${this.score}. Press Replay to restart the campaign.`,
          "lost",
        );
        this.announce(
          `The defence grid was breached. Score ${this.score}. Press Replay to try again.`,
        );
      }
      this.syncInterface(true);
      this.draw();
    }

    completeLevel() {
      const completedLevelIndex = this.levelIndex;
      this.score += this.energy * 2 + this.units.length * 50 + this.currentLevel() * 500;
      if (completedLevelIndex >= LEVELS.length - 1) {
        this.finishRound("won");
        return;
      }
      this.prepareLevel(completedLevelIndex + 1, completedLevelIndex);
    }

    beginWave(index, delay = 1.8) {
      const level = this.currentLevelConfig();
      const wave = level.waves[index];
      if (!wave) return;
      this.waveIndex = index;
      this.waveSpawned = 0;
      this.waveDefeated = 0;
      this.spawnTimer = delay;
      this.waitingForWave = false;
      this.waveBreakTimer = 0;
      this.waveBannerTimer = wave.large ? 4.5 : 3;
      if (!this.isLaneActive(this.cursor.row)) {
        this.cursor.row = this.nearestActiveRow(this.cursor.row);
      }
      this.lastFeaturedEnemy = Object.values(wave.featured || {})[0] || null;
      if (!this.isUnitUnlocked(this.selectedUnit)) {
        this.selectedUnit = UNIT_ORDER[0];
        this.removeMode = false;
      }
      if (index > 0) window.KelvinGameAudio?.play?.("round");
      const threatNotice = this.lastFeaturedEnemy
        ? ` New threat: ${ENEMY_TYPES[this.lastFeaturedEnemy].label}.`
        : "";
      const waveNotice = wave.large ? "Mass assault incoming." : "Wave incoming.";
      this.announce(
        `Level ${this.currentLevel()} of ${LEVELS.length}, wave ${index + 1} of ${level.waves.length}. ${waveNotice} ${this.activeLaneDescription()}${threatNotice}`,
      );
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
      this.announce("Remove tool selected. Choose a deployed unit.");
      this.syncInterface(true);
      this.draw();
      this.focusStage();
    }

    selectUnit(type) {
      const specification = UNIT_TYPES[type];
      if (!specification) return false;

      if (!this.isUnitUnlocked(type)) {
        this.announce(
          `${specification.label} unlocks at the start of round ${this.unlockRoundFor(type)}.`,
        );
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
          `${specification.label} needs ${specification.cost} supply. You have ${this.energy}.`,
        );
        return false;
      }

      this.selectedUnit = type;
      this.removeMode = false;
      this.announce(
        `${specification.label} selected. Choose a lane and column.`,
      );
      this.syncInterface(true);
      this.draw();
      return true;
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
        this.announce("Grid Command is paused. Press Resume when ready.");
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
        this.announce("Choose a cell inside the defence grid.");
        return;
      }

      if (!this.isLaneActive(cell.row)) {
        this.announce(
          `Lane ${cell.row + 1} is offline until round ${this.laneUnlockRound(cell.row)}.`,
        );
        this.draw();
        return;
      }
      this.cursor = cell;
      this.useSelectedTool(cell.row, cell.column);
    }

    onKeyDown(event) {
      if (event.target.closest?.("button, a, input, select, textarea")) return;

      if (/^[1-9]$/.test(event.key)) {
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
        const activeRows = this.activeRows();
        const currentRowIndex = Math.max(
          0,
          activeRows.indexOf(this.nearestActiveRow(this.cursor.row)),
        );
        const nextRowIndex = clamp(
          currentRowIndex + movement.row,
          0,
          activeRows.length - 1,
        );
        this.cursor = {
          row: movement.row ? activeRows[nextRowIndex] : activeRows[currentRowIndex],
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
      if (!this.isLaneActive(this.cursor.row)) {
        this.announce(
          `Lane ${this.cursor.row + 1} is offline until round ${this.laneUnlockRound(this.cursor.row)}.`,
        );
        return;
      }
      const occupant = this.unitAt(this.cursor.row, this.cursor.column);
      this.announce(
        `Lane ${this.cursor.row + 1}, column ${this.cursor.column + 1}, ${
          occupant ? UNIT_TYPES[occupant.type].label : "empty"
        }.`,
      );
    }

    useSelectedTool(row, column) {
      if (this.state !== "running") return;
      if (!this.isLaneActive(row)) {
        this.announce(
          `Lane ${row + 1} is offline until round ${this.laneUnlockRound(row)}.`,
        );
        return;
      }

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
        this.announce("Select a unit card before choosing a cell.");
        return;
      }
      this.placeUnit(this.selectedUnit, row, column);
    }

    placeUnit(type, row, column) {
      const specification = UNIT_TYPES[type];
      if (!specification) return false;
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        row < 0 ||
        row >= ROW_COUNT ||
        column < 0 ||
        column >= COLUMN_COUNT
      ) {
        this.announce("Choose a valid lane and column inside the defence grid.");
        return false;
      }
      if (!this.isLaneActive(row)) {
        this.announce(
          `Lane ${row + 1} is offline until round ${this.laneUnlockRound(row)}.`,
        );
        return false;
      }
      if (!this.isUnitUnlocked(type)) {
        this.announce(
          `${specification.label} unlocks at the start of round ${this.unlockRoundFor(type)}.`,
        );
        return false;
      }
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
          `${specification.label} needs ${specification.cost} supply. You have ${this.energy}.`,
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
        fuseTimer: specification.fuseTime || 0,
        chewTimer: 0,
        burstRemaining: 0,
        burstTimer: 0,
        burstRows: [],
        jamTimer: 0,
      });
      window.KelvinGameAudio?.play?.("deploy");
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
      window.KelvinGameAudio?.play?.("collect");
      this.announce(`${node.value} supply collected. Total ${this.energy}.`);
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
      const resolvedType = ENEMY_TYPES[type] ? type : "drifter";
      const specification = ENEMY_TYPES[resolvedType];
      const laneLoads = this.activeRows().map((row) => ({
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
        type: resolvedType,
        row,
        x: COLUMN_COUNT + 0.62 + Math.random() * 0.25,
        health: specification.health,
        maxHealth: specification.health,
        slowTimer: 0,
        ramReady: resolvedType === "breacher",
        abilityTimer:
          resolvedType === "jammer"
            ? 2.8
            : resolvedType === "repair"
              ? 2.2
              : 0,
        attackTimer: resolvedType === "artillery" ? 2.4 : 0,
        abilityFlashTimer: 0,
        rewarded: false,
      });
    }

    updateWave(delta) {
      if (this.waveIndex < 0 || this.waveIndex >= ROUNDS.length) return;
      const wave = ROUNDS[this.waveIndex];

      if (this.waveSpawned < wave.count) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          const type =
            wave.featured?.[this.waveSpawned] ||
            wave.pool[Math.floor(Math.random() * wave.pool.length)];
          this.spawnEnemy(type);
          this.waveSpawned += 1;
          const jitter = 0.88 + Math.random() * 0.3;
          this.spawnTimer = wave.interval * jitter;
        }
        return;
      }

      if (this.enemies.length > 0) return;
      if (this.waveIndex === ROUNDS.length - 1) {
        this.score += this.energy * 3 + this.units.length * 75;
        this.finishRound("won");
        return;
      }

      if (!this.waitingForWave) {
        this.waitingForWave = true;
        this.waveBreakTimer = 8;
        this.energy = Math.min(999, this.energy + 50);
        window.KelvinGameAudio?.play?.("round-clear");
        this.announce(
          `Round ${this.waveIndex + 1} cleared. Fifty reserve supply added.`,
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

    projectileRowsFor(unit, specification) {
      const spread = specification.laneSpread || 0;
      const rows = [];
      for (let row = unit.row - spread; row <= unit.row + spread; row += 1) {
        if (row >= 0 && row < ROW_COUNT && this.isLaneActive(row)) rows.push(row);
      }
      return rows;
    }

    fireUnitVolley(unit, specification, rows) {
      if (rows.length > 0) {
        window.KelvinGameAudio?.play?.("shoot", {
          channel: "grid-shoot",
          cooldown: 90,
          volume: 0.08,
        });
      }
      rows.forEach((row) => {
        this.projectiles.push({
          id: ++this.entityId,
          type: unit.type,
          row,
          x: unit.column + 0.82,
          damage: specification.damage,
          speed: specification.projectileSpeed,
          slowFactor: specification.slowFactor || 1,
          slowTime: specification.slowTime || 0,
          spent: false,
        });
      });
    }

    detonateArea(unit, specification, effectType) {
      const centerX = unit.column + 0.5;
      const rowRadius = specification.blastRows || 0;
      this.enemies.forEach((enemy) => {
        if (
          enemy.health > 0 &&
          this.isLaneActive(enemy.row) &&
          Math.abs(enemy.row - unit.row) <= rowRadius &&
          Math.abs(enemy.x - centerX) <= specification.blastRadius
        ) {
          enemy.health -= specification.damage;
        }
      });
      unit.health = 0;
      this.effects.push({
        type: effectType,
        x: centerX,
        y: unit.row + 0.5,
        radiusX: specification.blastRadius,
        radiusY: rowRadius + 0.48,
        age: 0,
        duration: effectType === "nova" ? 0.58 : 0.42,
        color: specification.color,
      });
      window.KelvinGameAudio?.play?.(
        effectType === "nova" ? "heavy-blast" : "blast",
        { channel: "grid-blast", cooldown: 100 },
      );
    }

    updateUnits(delta) {
      this.units.forEach((unit) => {
        if (unit.health <= 0) return;
        const specification = UNIT_TYPES[unit.type];
        if (unit.jamTimer > 0) {
          unit.jamTimer = Math.max(0, unit.jamTimer - delta);
          if (JAMMABLE_UNITS.has(unit.type)) return;
        }

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

        if (unit.type === "nova") {
          unit.fuseTimer -= delta;
          if (unit.fuseTimer <= 0) {
            this.detonateArea(unit, specification, "nova");
            this.announce(
              `Demolition Charge cleared the area around lane ${unit.row + 1}, column ${unit.column + 1}.`,
            );
          }
          return;
        }

        if (unit.type === "snap") {
          if (unit.chewTimer > 0) {
            unit.chewTimer = Math.max(0, unit.chewTimer - delta);
            return;
          }

          const centerX = unit.column + 0.5;
          const target = this.enemies
            .filter(
              (enemy) =>
                enemy.health > 0 &&
                enemy.row === unit.row &&
                enemy.x >= centerX - 0.12 &&
                enemy.x <= centerX + specification.attackRange,
            )
            .sort((first, second) => first.x - second.x)[0];
          if (target) {
            target.health -= specification.damage;
            unit.chewTimer = specification.chewTime;
            this.effects.push({
              type: "snap",
              x: target.x,
              y: target.row + 0.5,
              radiusX: 0.5,
              radiusY: 0.42,
              age: 0,
              duration: 0.32,
              color: specification.color,
            });
          }
          return;
        }

        if (!specification.fireTime) return;
        const projectileRows = this.projectileRowsFor(unit, specification);

        if (unit.burstRemaining > 0) {
          unit.burstTimer -= delta;
          if (unit.burstTimer <= 0) {
            this.fireUnitVolley(unit, specification, unit.burstRows);
            unit.burstRemaining -= 1;
            unit.burstTimer += specification.burstSpacing || 0.12;
          }
        }

        const hasTarget = this.enemies.some(
          (enemy) =>
            enemy.health > 0 &&
            projectileRows.includes(enemy.row) &&
            enemy.x > unit.column + 0.15,
        );
        if (!hasTarget) {
          unit.timer = Math.min(unit.timer, specification.fireTime * 0.25);
          return;
        }

        unit.timer -= delta;
        if (unit.timer <= 0) {
          this.fireUnitVolley(unit, specification, projectileRows);
          unit.burstRemaining = Math.max(0, (specification.shots || 1) - 1);
          unit.burstTimer = specification.burstSpacing || 0.12;
          unit.burstRows = projectileRows;
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
      this.detonateArea(unit, specification, "mine");
    }

    updateEnemyAbility(enemy, specification, delta) {
      enemy.abilityFlashTimer = Math.max(0, enemy.abilityFlashTimer - delta);

      if (enemy.type === "jammer") {
        enemy.abilityTimer = Math.max(0, enemy.abilityTimer - delta);
        if (enemy.abilityTimer > 0) return;
        const target = this.units
          .filter(
            (unit) =>
              unit.health > 0 &&
              JAMMABLE_UNITS.has(unit.type) &&
              unit.row === enemy.row &&
              unit.column + 0.5 <= enemy.x &&
              enemy.x - (unit.column + 0.5) <= specification.jamRange,
          )
          .sort((first, second) => {
            const firstDistance = enemy.x - (first.column + 0.5);
            const secondDistance = enemy.x - (second.column + 0.5);
            return firstDistance - secondDistance || first.id - second.id;
          })[0];
        if (!target) return;
        target.jamTimer = Math.max(target.jamTimer, specification.jamDuration);
        enemy.abilityTimer = specification.jamPeriod;
        enemy.abilityFlashTimer = 0.42;
        this.effects.push({
          type: "jam",
          x: enemy.x,
          y: enemy.row + 0.5,
          targetX: target.column + 0.5,
          targetY: target.row + 0.5,
          radiusX: 0.42,
          radiusY: 0.42,
          age: 0,
          duration: 0.42,
          color: specification.color,
        });
        return;
      }

      if (enemy.type === "repair") {
        enemy.abilityTimer = Math.max(0, enemy.abilityTimer - delta);
        if (enemy.abilityTimer > 0) return;
        const target = this.enemies
          .filter(
            (candidate) =>
              candidate.id !== enemy.id &&
              candidate.health > 0 &&
              candidate.health < candidate.maxHealth &&
              this.isLaneActive(candidate.row) &&
              Math.abs(candidate.row - enemy.row) <= specification.repairRows &&
              Math.abs(candidate.x - enemy.x) <= specification.repairRange,
          )
          .sort((first, second) => {
            const healthDifference =
              first.health / first.maxHealth - second.health / second.maxHealth;
            return (
              healthDifference ||
              Math.abs(first.x - enemy.x) - Math.abs(second.x - enemy.x) ||
              first.id - second.id
            );
          })[0];
        if (!target) return;
        target.health = Math.min(
          target.maxHealth,
          target.health + specification.repairAmount,
        );
        enemy.abilityTimer = specification.repairPeriod;
        enemy.abilityFlashTimer = 0.48;
        this.effects.push({
          type: "repair",
          x: enemy.x,
          y: enemy.row + 0.5,
          targetX: target.x,
          targetY: target.row + 0.5,
          radiusX: 0.48,
          radiusY: 0.48,
          age: 0,
          duration: 0.48,
          color: specification.color,
        });
      }
    }

    artilleryTarget(enemy, specification) {
      return this.units
        .filter((unit) => {
          if (unit.health <= 0 || unit.row !== enemy.row) return false;
          const distance = enemy.x - (unit.column + 0.5);
          return distance >= 0.66 && distance <= specification.attackRange;
        })
        .sort((first, second) => second.column - first.column || first.id - second.id)[0];
    }

    updateEnemies(delta) {
      for (const enemy of this.enemies) {
        if (enemy.health <= 0 || this.state !== "running") continue;
        const specification = ENEMY_TYPES[enemy.type];
        if (enemy.slowTimer > 0) enemy.slowTimer -= delta;
        const slowFactor = enemy.slowTimer > 0 ? enemy.slowFactor || 0.52 : 1;
        this.updateEnemyAbility(enemy, specification, delta);

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
          } else if (enemy.type === "breacher" && enemy.ramReady) {
            blockingUnit.health -= specification.impactDamage;
            enemy.ramReady = false;
            enemy.abilityFlashTimer = 0.35;
            this.effects.push({
              type: "ram",
              x: blockingUnit.column + 0.5,
              y: blockingUnit.row + 0.5,
              radiusX: 0.58,
              radiusY: 0.44,
              age: 0,
              duration: 0.35,
              color: specification.color,
            });
            window.KelvinGameAudio?.play?.("player-hit", {
              channel: "grid-enemy-impact",
              cooldown: 120,
              volume: 0.1,
            });
          } else {
            blockingUnit.health -= specification.damage * delta;
          }
        } else if (enemy.type === "artillery") {
          const target = this.artilleryTarget(enemy, specification);
          if (target) {
            enemy.attackTimer = Math.max(0, enemy.attackTimer - delta);
            if (enemy.attackTimer <= 0) {
              target.health -= specification.shotDamage;
              enemy.attackTimer = specification.fireTime;
              enemy.abilityFlashTimer = 0.45;
              this.effects.push({
                type: "mortar",
                x: enemy.x,
                y: enemy.row + 0.5,
                targetX: target.column + 0.5,
                targetY: target.row + 0.5,
                radiusX: 0.52,
                radiusY: 0.52,
                age: 0,
                duration: 0.45,
                color: specification.color,
              });
              window.KelvinGameAudio?.play?.("player-hit", {
                channel: "grid-enemy-shot",
                cooldown: 120,
                volume: 0.08,
              });
            }
          } else {
            enemy.x -= specification.speed * slowFactor * delta;
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
        if (!sweeper.active || !this.isLaneActive(sweeper.row)) return;
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
        const activeRows = this.activeRows();
        const targetRow = activeRows[Math.floor(Math.random() * activeRows.length)];
        this.spawnEnergyNode(
          0.5 + Math.random() * (COLUMN_COUNT - 1),
          targetRow + 0.5,
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

    updateEffects(delta) {
      this.effects.forEach((effect) => {
        effect.age += delta;
      });
      this.effects = this.effects.filter((effect) => effect.age < effect.duration);
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
      this.updateEffects(delta);
      this.removeDeadUnits();
      this.removeDeadEnemies();
      this.waveBannerTimer = Math.max(0, this.waveBannerTimer - delta);
      this.laneRevealTimer = Math.max(0, this.laneRevealTimer - delta);
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
      const breakSeconds = this.waitingForWave
        ? Math.max(1, Math.ceil(this.waveBreakTimer))
        : 0;
      const signature = [
        this.state,
        this.energy,
        this.waveIndex,
        this.score,
        this.selectedUnit,
        this.removeMode,
        this.waitingForWave,
        breakSeconds,
        cooldownSignature,
      ].join("|");
      if (!force && signature === this.interfaceSignature) return;
      this.interfaceSignature = signature;

      const stateLabels = {
        ready: "STATUS / READY",
        running: this.waitingForWave
          ? `STATUS / REDEPLOY ${String(breakSeconds).padStart(2, "0")}`
          : "STATUS / ACTIVE",
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
          ROUNDS.length,
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
            ? "Pause Grid Command"
            : label === "RESUME"
              ? "Resume Grid Command"
              : label === "REPLAY"
                ? "Replay Grid Command"
                : "Start Grid Command",
        );
      }

      this.unitButtons.forEach((button) => {
        const type = button.dataset.gardenUnit;
        const specification = UNIT_TYPES[type];
        if (!specification) return;
        const cooldown = this.cooldowns[type];
        const unlockRound = this.unlockRoundFor(type);
        const locked = !this.isUnitUnlocked(type);
        const newlyUnlocked = !locked && unlockRound === this.currentRound();
        const unavailable =
          locked || cooldown > 0.05 || this.energy < specification.cost;
        button.setAttribute(
          "aria-pressed",
          String(!locked && !this.removeMode && this.selectedUnit === type),
        );
        button.setAttribute("aria-disabled", String(unavailable));
        button.toggleAttribute("data-garden-locked", locked);
        button.toggleAttribute("data-garden-new", newlyUnlocked);
        button.setAttribute("data-unlock-round", String(unlockRound).padStart(2, "0"));
        button.style.setProperty(
          "--garden-cooldown",
          locked ? "0" : String(clamp(cooldown / specification.cooldown, 0, 1)),
        );
        const detail = locked
          ? `locked until round ${unlockRound}`
          : cooldown > 0.05
            ? `${Math.ceil(cooldown)} seconds recharge remaining`
            : `${specification.cost} supply`;
        const costOutput = button.querySelector("small");
        if (costOutput) {
          costOutput.textContent = locked
            ? `LOCK / R${String(unlockRound).padStart(2, "0")}`
            : `${specification.cost} SP`;
        }
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
      const roundText = `${String(Math.max(0, this.waveIndex + 1)).padStart(
        2,
        "0",
      )}/${String(ROUNDS.length).padStart(2, "0")}`;
      const laneText = `${this.activeRows().length}/${ROW_COUNT}`;
      context.fillText(
        width < 620
          ? `SP ${String(this.energy).padStart(3, "0")} / R ${roundText} / L ${laneText}`
          : `SUPPLY ${String(this.energy).padStart(3, "0")}  /  ROUND ${roundText}  /  LANES ${laneText}`,
        Math.max(8, this.board.x),
        y,
      );
      context.textAlign = "right";
      context.fillText(
        width < 620
          ? `S ${String(this.score).padStart(6, "0")}`
          : `SCORE ${String(this.score).padStart(6, "0")}  /  BEST ${String(
              this.bestScore,
            ).padStart(6, "0")}`,
        Math.min(width - 8, this.board.x + this.board.width),
        y,
      );
    }

    drawBoard() {
      const context = this.context;
      const { x, y, cell } = this.board;
      const activeRows = this.activeRows();

      for (let row = 0; row < ROW_COUNT; row += 1) {
        if (!activeRows.includes(row)) continue;
        const isRevealing = this.newlyActivatedRows.includes(row) && this.laneRevealTimer > 0;
        const revealProgress = isRevealing
          ? 1 - this.laneRevealTimer / 1.25
          : 1;
        for (let column = 0; column < COLUMN_COUNT; column += 1) {
          context.globalAlpha =
            ((row + column) % 2 === 0 ? 0.11 : 0.055) *
            clamp(0.2 + revealProgress * 0.8, 0.2, 1);
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
      activeRows.forEach((row) => {
        const isRevealing = this.newlyActivatedRows.includes(row) && this.laneRevealTimer > 0;
        const revealProgress = isRevealing
          ? 1 - this.laneRevealTimer / 1.25
          : 1;
        context.save();
        context.globalAlpha = clamp(0.28 + revealProgress * 0.72, 0.28, 1);
        context.strokeStyle = isRevealing
          ? this.colors.accent
          : this.colors.line;
        context.lineWidth = isRevealing ? 2 : 1;
        context.beginPath();
        for (let column = 0; column <= COLUMN_COUNT; column += 1) {
          const lineX = x + column * cell + 0.5;
          context.moveTo(lineX, y + row * cell);
          context.lineTo(lineX, y + (row + 1) * cell);
        }
        context.moveTo(x, y + row * cell + 0.5);
        context.lineTo(x + COLUMN_COUNT * cell, y + row * cell + 0.5);
        context.moveTo(x, y + (row + 1) * cell + 0.5);
        context.lineTo(x + COLUMN_COUNT * cell, y + (row + 1) * cell + 0.5);
        context.stroke();
        context.strokeStyle = this.colors.lineStrong;
        context.lineWidth = 1.5;
        context.strokeRect(
          x + 0.5,
          y + row * cell + 0.5,
          COLUMN_COUNT * cell,
          cell,
        );
        context.restore();
      });

      context.font = `700 ${clamp(cell * 0.13, 7, 11)}px ${this.colors.mono}`;
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let row = 0; row < ROW_COUNT; row += 1) {
        if (!activeRows.includes(row)) {
          context.fillStyle = this.colors.faint;
          context.globalAlpha = 0.42;
          context.fillText(
            this.viewport.width < 620
              ? `R${String(this.laneUnlockRound(row)).padStart(2, "0")}`
              : `OFF / R${String(this.laneUnlockRound(row)).padStart(2, "0")}`,
            x - cell * 0.12,
            y + (row + 0.5) * cell,
          );
          context.globalAlpha = 1;
          continue;
        }
        context.fillStyle = this.colors.faint;
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

      // Low-profile mechanical plinth shared by every field unit.
      context.beginPath();
      context.moveTo(-radius * 0.86, radius * 0.76);
      context.lineTo(-radius * 0.62, radius * 0.42);
      context.lineTo(-radius * 0.3, radius * 0.28);
      context.lineTo(radius * 0.3, radius * 0.28);
      context.lineTo(radius * 0.62, radius * 0.42);
      context.lineTo(radius * 0.86, radius * 0.76);
      context.lineTo(radius * 0.72, radius * 1.08);
      context.lineTo(-radius * 0.72, radius * 1.08);
      context.closePath();
      context.fill();
      context.stroke();
      context.strokeRect(
        -radius * 0.46,
        radius * 0.72,
        radius * 0.92,
        radius * 0.18,
      );
      context.fillStyle = specification.color;
      [-0.57, 0.57].forEach((offset) => {
        context.beginPath();
        context.arc(radius * offset, radius * 0.87, radius * 0.07, 0, Math.PI * 2);
        context.fill();
      });
      context.fillStyle = this.colors.surface;

      if (unit.type === "lumen") {
        context.fillRect(
          -radius * 0.68,
          -radius * 0.42,
          radius * 1.36,
          radius * 0.88,
        );
        context.strokeRect(
          -radius * 0.68,
          -radius * 0.42,
          radius * 1.36,
          radius * 0.88,
        );
        context.beginPath();
        context.moveTo(0, -radius * 0.42);
        context.lineTo(0, -radius * 1.08);
        context.moveTo(-radius * 0.38, -radius * 0.72);
        context.quadraticCurveTo(0, -radius * 1.02, radius * 0.38, -radius * 0.72);
        context.moveTo(-radius * 0.64, -radius * 0.92);
        context.quadraticCurveTo(0, -radius * 1.42, radius * 0.64, -radius * 0.92);
        context.stroke();
        context.strokeRect(
          -radius * 0.48,
          -radius * 0.2,
          radius * 0.44,
          radius * 0.38,
        );
        context.fillStyle = specification.color;
        context.fillRect(radius * 0.18, -radius * 0.17, radius * 0.27, radius * 0.12);
        context.fillRect(radius * 0.18, radius * 0.07, radius * 0.27, radius * 0.12);
      } else if (
        unit.type === "pulse" ||
        unit.type === "frost" ||
        unit.type === "burst"
      ) {
        context.beginPath();
        context.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        const barrelOffsets = unit.type === "burst" ? [-0.3, 0.3] : [0];
        barrelOffsets.forEach((offset) => {
          context.strokeRect(
            radius * 0.48,
            radius * offset - radius * 0.19,
            radius * 0.82,
            radius * 0.38,
          );
        });
        if (unit.type === "frost") {
          context.beginPath();
          context.moveTo(-radius * 0.75, 0);
          context.lineTo(radius * 0.75, 0);
          context.moveTo(0, -radius * 0.75);
          context.lineTo(0, radius * 0.75);
          context.stroke();
        }
        if (unit.type === "burst") {
          context.beginPath();
          context.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
          context.stroke();
        }
      } else if (unit.type === "triad") {
        [-0.58, 0, 0.58].forEach((offset) => {
          context.beginPath();
          context.arc(0, radius * offset, radius * 0.37, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          context.strokeRect(
            radius * 0.28,
            radius * offset - radius * 0.13,
            radius * 0.68,
            radius * 0.26,
          );
        });
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
      } else if (unit.type === "nova") {
        context.save();
        context.rotate(Math.PI / 4);
        context.fillRect(-radius * 0.5, -radius * 0.5, radius, radius);
        context.strokeRect(-radius * 0.5, -radius * 0.5, radius, radius);
        context.restore();
        context.beginPath();
        context.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(radius * 0.38, -radius * 0.4);
        context.lineTo(radius * 0.78, -radius * 0.88);
        context.stroke();
      } else if (unit.type === "snap") {
        const chewing = unit.chewTimer > 0;
        context.beginPath();
        context.moveTo(-radius * 0.72, -radius * 0.5);
        context.lineTo(radius * 0.18, -radius * 0.64);
        context.lineTo(radius * 0.58, -radius * 0.3);
        context.lineTo(radius * 0.58, radius * 0.3);
        context.lineTo(radius * 0.18, radius * 0.64);
        context.lineTo(-radius * 0.72, radius * 0.5);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(radius * 0.2, -radius * 0.36);
        context.lineTo(
          chewing ? radius * 0.46 : radius * 0.92,
          chewing ? -radius * 0.16 : -radius * 0.72,
        );
        context.lineTo(
          chewing ? radius * 0.68 : radius * 1.12,
          chewing ? -radius * 0.04 : -radius * 0.5,
        );
        context.moveTo(radius * 0.2, radius * 0.36);
        context.lineTo(
          chewing ? radius * 0.46 : radius * 0.92,
          chewing ? radius * 0.16 : radius * 0.72,
        );
        context.lineTo(
          chewing ? radius * 0.68 : radius * 1.12,
          chewing ? radius * 0.04 : radius * 0.5,
        );
        context.stroke();
        context.fillStyle = specification.color;
        context.beginPath();
        context.arc(-radius * 0.12, 0, radius * 0.19, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = this.colors.surface;
        context.beginPath();
        context.moveTo(-radius * 0.22, 0);
        context.lineTo(-radius * 0.02, 0);
        context.moveTo(-radius * 0.12, -radius * 0.1);
        context.lineTo(-radius * 0.12, radius * 0.1);
        context.stroke();
      } else {
        // Proximity mine: armoured disc, four ground anchors and a status lamp.
        context.save();
        context.translate(0, radius * 0.12);
        for (let index = 0; index < 4; index += 1) {
          context.save();
          context.rotate((Math.PI * index) / 2);
          context.strokeRect(
            radius * 0.66,
            -radius * 0.14,
            radius * 0.34,
            radius * 0.28,
          );
          context.restore();
        }
        context.beginPath();
        context.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
        context.stroke();
        context.moveTo(-radius * 0.27, 0);
        context.lineTo(radius * 0.27, 0);
        context.moveTo(0, -radius * 0.27);
        context.lineTo(0, radius * 0.27);
        context.stroke();
        context.fillStyle = specification.color;
        context.beginPath();
        context.arc(0, 0, unit.armed ? radius * 0.11 : radius * 0.07, 0, Math.PI * 2);
        context.fill();
        if (!unit.armed) {
          context.strokeStyle = specification.color;
          context.setLineDash([radius * 0.12, radius * 0.1]);
          context.beginPath();
          context.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        }
        context.restore();
      }
      context.restore();

      if (unit.jamTimer > 0) {
        context.save();
        context.strokeStyle = ENEMY_TYPES.jammer.color;
        context.lineWidth = Math.max(1.5, cell * 0.025);
        context.setLineDash([cell * 0.1, cell * 0.07]);
        context.strokeRect(
          centerX - cell * 0.34,
          centerY - cell * 0.34,
          cell * 0.68,
          cell * 0.68,
        );
        context.setLineDash([]);
        context.beginPath();
        context.arc(centerX, centerY, cell * 0.42, Math.PI * 1.15, Math.PI * 1.85);
        context.stroke();
        context.restore();
      }

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
      if (enemy.type === "breacher") {
        context.beginPath();
        context.moveTo(-size * 0.78, -size * 0.72);
        context.lineTo(-size * 1.55, 0);
        context.lineTo(-size * 0.78, size * 0.72);
        if (enemy.ramReady) {
          context.moveTo(-size * 1.18, -size * 0.48);
          context.lineTo(-size * 1.75, 0);
          context.lineTo(-size * 1.18, size * 0.48);
        } else {
          context.moveTo(-size * 1.04, -size * 0.35);
          context.lineTo(-size * 1.3, -size * 0.08);
          context.moveTo(-size * 1.04, size * 0.35);
          context.lineTo(-size * 1.3, size * 0.08);
        }
        context.stroke();
      }
      if (enemy.type === "jammer") {
        context.beginPath();
        context.moveTo(0, -size * 0.9);
        context.lineTo(0, -size * 1.65);
        context.stroke();
        for (let ring = 1; ring <= 2; ring += 1) {
          context.beginPath();
          context.arc(0, -size * 1.4, size * (0.25 + ring * 0.22), Math.PI * 1.15, Math.PI * 1.85);
          context.stroke();
        }
      }
      if (enemy.type === "repair") {
        context.beginPath();
        context.arc(0, -size * 1.05, size * 0.48, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(-size * 0.25, -size * 1.05);
        context.lineTo(size * 0.25, -size * 1.05);
        context.moveTo(0, -size * 1.3);
        context.lineTo(0, -size * 0.8);
        context.stroke();
      }
      if (enemy.type === "artillery") {
        context.lineWidth = Math.max(2, cell * 0.038);
        context.beginPath();
        context.moveTo(-size * 0.2, -size * 0.7);
        context.lineTo(-size * 1.72, -size * 1.2);
        context.stroke();
        context.strokeRect(-size * 0.58, -size * 0.92, size * 0.78, size * 0.42);
        if (enemy.attackTimer <= 0.45) {
          context.fillStyle = specification.color;
          context.beginPath();
          context.moveTo(-size * 1.72, -size * 1.2);
          context.lineTo(-size * 2.02, -size * 1.42);
          context.lineTo(-size * 1.92, -size * 1.04);
          context.closePath();
          context.fill();
        }
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
        const specification = UNIT_TYPES[projectile.type] || UNIT_TYPES.pulse;
        context.fillStyle = specification.color;
        context.beginPath();
        if (projectile.type === "frost") {
          context.moveTo(x, y - radius);
          context.lineTo(x + radius, y);
          context.lineTo(x, y + radius);
          context.lineTo(x - radius, y);
          context.closePath();
        } else if (projectile.type === "triad") {
          context.moveTo(x + radius, y);
          context.lineTo(x - radius * 0.75, y + radius * 0.75);
          context.lineTo(x - radius * 0.75, y - radius * 0.75);
          context.closePath();
        } else {
          context.arc(x, y, radius, 0, Math.PI * 2);
        }
        context.fill();
      });
    }

    drawEffects() {
      const context = this.context;
      const cell = this.board.cell;
      this.effects.forEach((effect) => {
        const progress = clamp(effect.age / effect.duration, 0, 1);
        const pulse = 0.45 + progress * 0.55;
        const x = this.board.x + effect.x * cell;
        const y = this.board.y + effect.y * cell;
        const radiusX = effect.radiusX * cell * pulse;
        const radiusY = effect.radiusY * cell * pulse;

        context.save();
        context.translate(x, y);
        context.strokeStyle = effect.color;
        context.fillStyle = effect.color;
        context.lineWidth = Math.max(1.5, cell * 0.035);

        if (effect.type === "jam" || effect.type === "repair") {
          const targetX = (effect.targetX - effect.x) * cell;
          const targetY = (effect.targetY - effect.y) * cell;
          context.globalAlpha = 1 - progress;
          if (effect.type === "jam") {
            context.setLineDash([cell * 0.09, cell * 0.06]);
          }
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(targetX, targetY);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.arc(targetX, targetY, radiusX, 0, Math.PI * 2);
          context.stroke();
          if (effect.type === "repair") {
            context.beginPath();
            context.moveTo(targetX - radiusX * 0.45, targetY);
            context.lineTo(targetX + radiusX * 0.45, targetY);
            context.moveTo(targetX, targetY - radiusY * 0.45);
            context.lineTo(targetX, targetY + radiusY * 0.45);
            context.stroke();
          }
        } else if (effect.type === "mortar") {
          const targetX = (effect.targetX - effect.x) * cell;
          const targetY = (effect.targetY - effect.y) * cell;
          context.globalAlpha = 1 - progress;
          context.beginPath();
          context.moveTo(0, 0);
          context.quadraticCurveTo(
            targetX * 0.5,
            -cell * (0.8 + progress * 0.35),
            targetX,
            targetY,
          );
          context.stroke();
          context.beginPath();
          context.arc(targetX, targetY, radiusX, 0, Math.PI * 2);
          context.stroke();
        } else if (effect.type === "ram") {
          context.globalAlpha = 1 - progress;
          for (let index = 0; index < 3; index += 1) {
            const offset = radiusX * (0.15 + index * 0.38);
            context.beginPath();
            context.moveTo(offset, -radiusY);
            context.lineTo(-offset, 0);
            context.lineTo(offset, radiusY);
            context.stroke();
          }
        } else if (effect.type === "snap") {
          context.globalAlpha = 1 - progress;
          context.beginPath();
          context.moveTo(-radiusX, -radiusY);
          context.lineTo(0, 0);
          context.lineTo(-radiusX, radiusY);
          context.moveTo(radiusX, -radiusY);
          context.lineTo(0, 0);
          context.lineTo(radiusX, radiusY);
          context.stroke();
        } else {
          context.globalAlpha = (1 - progress) * 0.16;
          context.fillRect(-radiusX, -radiusY, radiusX * 2, radiusY * 2);
          context.globalAlpha = 1 - progress;
          context.strokeRect(-radiusX, -radiusY, radiusX * 2, radiusY * 2);
          context.beginPath();
          context.moveTo(-radiusX, -radiusY);
          context.lineTo(radiusX, radiusY);
          context.moveTo(radiusX, -radiusY);
          context.lineTo(-radiusX, radiusY);
          context.stroke();
        }
        context.restore();
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
        if (!this.isLaneActive(sweeper.row)) return;
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
      if (!this.isLaneActive(this.cursor.row)) return;
      const context = this.context;
      const cell = this.board.cell;
      const x = this.board.x + this.cursor.column * cell;
      const y = this.board.y + this.cursor.row * cell;
      const valid = this.removeMode
        ? Boolean(
            this.isLaneActive(this.cursor.row) &&
              this.unitAt(this.cursor.row, this.cursor.column),
          )
        : Boolean(
            this.selectedUnit &&
              this.isLaneActive(this.cursor.row) &&
              this.isUnitUnlocked(this.selectedUnit) &&
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
      const height = clamp(this.board.cell * 1.32, 70, 108);
      const x = this.board.x + this.board.width / 2 - width / 2;
      const y = this.board.y + this.board.height / 2 - height / 2;
      context.fillStyle = this.colors.surface;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 1;
      context.fillRect(x, y, width, height);
      context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      context.fillStyle = this.colors.text;
      context.font = `700 ${clamp(height * 0.15, 9, 14)}px ${this.colors.mono}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        `ROUND ${String(this.waveIndex + 1).padStart(2, "0")} / ${String(
          ROUNDS.length,
        ).padStart(2, "0")}`,
        x + width / 2,
        y + height * 0.19,
      );
      if (this.lastUnlockedUnit) {
        context.fillStyle = UNIT_TYPES[this.lastUnlockedUnit].color;
        context.font = `700 ${clamp(height * 0.12, 8, 12)}px ${this.colors.mono}`;
        context.fillText(
          `UNIT ONLINE / ${UNIT_TYPES[this.lastUnlockedUnit].label.toUpperCase()}`,
          x + width / 2,
          y + height * 0.43,
        );
      }
      if (this.lastFeaturedEnemy) {
        context.fillStyle = ENEMY_TYPES[this.lastFeaturedEnemy].color;
        context.font = `700 ${clamp(height * 0.12, 8, 12)}px ${this.colors.mono}`;
        context.fillText(
          `NEW THREAT / ${ENEMY_TYPES[this.lastFeaturedEnemy].label.toUpperCase()}`,
          x + width / 2,
          y + height * 0.66,
        );
      }
      context.fillStyle = this.colors.muted;
      context.font = `700 ${clamp(height * 0.1, 7, 10)}px ${this.colors.mono}`;
      context.fillText(
        `LANES ONLINE / ${this.lanePhaseForRound().label}`,
        x + width / 2,
        y + height * 0.87,
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
      this.drawEffects();
      this.drawEnergyNodes();
      this.drawCursor();
      this.drawWaveBanner();
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-garden-game]").forEach((root) => {
      if (root.dataset.gardenReady === "true") return;
      root.dataset.gardenReady = "true";
      new GridCommandGame(root);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
