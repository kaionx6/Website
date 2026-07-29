(() => {
  "use strict";

  const BEST_SCORE_KEY = "kelvin-space-invaders-best";
  const WORLD_HEIGHT = 600;
  const PLAYER_Y = 548;
  const PLAYER_WIDTH = 48;
  const PLAYER_HEIGHT = 22;
  const PLAYER_SPEED = 330;
  const PLAYER_SHOT_SPEED = 520;
  const ENEMY_SHOT_SPEED = 238;
  const PLAYER_SHOT_LIMIT = 4;

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const intersects = (a, b) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;

  const readBestScore = () => {
    try {
      const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
      return Number.isFinite(value) && value > 0
        ? Math.min(value, 9_999_999)
        : 0;
    } catch (_) {
      return 0;
    }
  };

  const saveBestScore = (score) => {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch (_) {
      // Storage can be blocked without preventing the game from running.
    }
  };

  class SpaceInvadersGame {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector("[data-invaders-canvas]");
      if (!(this.canvas instanceof HTMLCanvasElement)) return;

      this.context = this.canvas.getContext("2d");
      if (!this.context) return;

      this.stage =
        root.querySelector("[data-invaders-stage]") ||
        this.canvas.parentElement ||
        root;
      this.overlay = root.querySelector("[data-invaders-overlay]");
      this.messageOutput = root.querySelector("[data-invaders-message]");
      this.stateOutput = root.querySelector("[data-invaders-state]");
      this.scoreOutput = root.querySelector("[data-invaders-score]");
      this.bestOutput = root.querySelector("[data-invaders-best]");
      this.actionButton = root.querySelector("[data-invaders-action]");
      this.actionLabel = this.actionButton?.querySelector(
        "[data-invaders-action-label]",
      );
      this.statusOutput = root.querySelector(
        "[data-invaders-announcement]",
      );

      this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = this.motionQuery.matches;
      this.state = "ready";
      this.score = 0;
      this.bestScore = readBestScore();
      this.wave = 1;
      this.lives = 3;
      this.worldWidth = 720;
      this.player = { x: 336, y: PLAYER_Y, width: PLAYER_WIDTH, height: PLAYER_HEIGHT };
      this.enemies = [];
      this.playerShots = [];
      this.enemyShots = [];
      this.formationDirection = 1;
      this.enemyFireClock = 0;
      this.playerFireClock = 0;
      this.waveDelay = 0;
      this.hitCooldown = 0;
      this.idleTime = 0;
      this.keys = { left: false, right: false };
      this.pointerId = null;
      this.pointerTarget = null;
      this.frameId = 0;
      this.lastTime = 0;
      this.inViewport = true;
      this.suspended = document.hidden;
      this.lastStatus = "";
      this.colors = {};

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onKeyUp = this.onKeyUp.bind(this);
      this.onActionClick = this.onActionClick.bind(this);
      this.onMotionChange = this.onMotionChange.bind(this);
      this.clearInput = this.clearInput.bind(this);

      this.prepareAccessibility();
      this.readThemeColors();
      this.bindEvents();
      this.resizeCanvas();
      this.resetRound();
      this.setStatus(
        "Space Invaders ready. Use A and D or the arrow keys to move. Press Space, W, or the up arrow to fire.",
      );
      this.queueFrame();
    }

    prepareAccessibility() {
      if (!this.stage.hasAttribute("tabindex")) this.stage.tabIndex = 0;
      if (!this.stage.hasAttribute("role")) {
        this.stage.setAttribute("role", "application");
      }
      if (!this.stage.hasAttribute("aria-label")) {
        this.stage.setAttribute(
          "aria-label",
          "Space Invaders demo. Move with A and D or the left and right arrows. Fire with Space, W, or the up arrow. Pause with P.",
        );
      }
      this.stage.setAttribute(
        "aria-keyshortcuts",
        "ArrowLeft ArrowRight A D Space W ArrowUp P",
      );
      this.canvas.setAttribute("aria-hidden", "true");
      this.canvas.style.touchAction = "none";

      if (this.statusOutput) {
        this.statusOutput.setAttribute("aria-live", "polite");
        this.statusOutput.setAttribute("aria-atomic", "true");
      }
      this.scoreOutput?.setAttribute("aria-live", "off");
      this.bestOutput?.setAttribute("aria-live", "off");
    }

    bindEvents() {
      this.stage.addEventListener("pointerdown", this.onPointerDown);
      this.stage.addEventListener("pointermove", this.onPointerMove);
      this.stage.addEventListener("pointerup", this.onPointerUp);
      this.stage.addEventListener("pointercancel", this.onPointerUp);
      this.stage.addEventListener("keydown", this.onKeyDown);
      this.stage.addEventListener("keyup", this.onKeyUp);
      this.stage.addEventListener("blur", this.clearInput, true);
      this.actionButton?.addEventListener("click", this.onActionClick);
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
      const styles = getComputedStyle(this.root);
      const variable = (name, fallback) =>
        styles.getPropertyValue(name).trim() || fallback;

      this.colors = {
        background: variable("--preview-bg", "#071522"),
        surface: variable("--surface", "#091725"),
        raised: variable("--surface-3", "#102337"),
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
        danger: variable("--danger", "#ff756f"),
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

      const previousWidth = this.worldWidth;
      this.worldWidth = Math.max(340, WORLD_HEIGHT * (bounds.width / bounds.height));
      const widthRatio = previousWidth > 0 ? this.worldWidth / previousWidth : 1;
      if (Math.abs(widthRatio - 1) > 0.0001) {
        this.player.x = clamp(
          (this.player.x + this.player.width / 2) * widthRatio -
            this.player.width / 2,
          8,
          this.worldWidth - this.player.width - 8,
        );
        this.pointerTarget = null;
        for (const enemy of this.enemies) {
          enemy.x =
            (enemy.x + enemy.width / 2) * widthRatio - enemy.width / 2;
        }
        for (const shot of this.playerShots) shot.x *= widthRatio;
        for (const shot of this.enemyShots) shot.x *= widthRatio;
      }
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

      this.root.toggleAttribute("data-invaders-suspended", this.suspended);
      this.lastTime = 0;
      this.clearInput();
      if (this.suspended) {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
        if (this.state === "running") {
          this.setStatus("Space Invaders paused while the game is not visible.");
        }
        this.draw();
      } else {
        if (this.state === "running") {
          this.setStatus("Space Invaders resumed.");
        }
        this.queueFrame();
      }
    }

    focusStage() {
      try {
        this.stage.focus({ preventScroll: true });
      } catch (_) {
        this.stage.focus();
      }
    }

    clearInput() {
      this.keys.left = false;
      this.keys.right = false;
      this.pointerId = null;
    }

    setStatus(message) {
      if (!this.statusOutput || message === this.lastStatus) return;
      this.lastStatus = message;
      this.statusOutput.textContent = message;
    }

    setButtonLabel(label) {
      if (!this.actionButton) return;
      if (this.actionLabel) this.actionLabel.textContent = label;
      else this.actionButton.textContent = label;

      const accessibleLabels = {
        START: "Start Space Invaders",
        PAUSE: "Pause Space Invaders",
        RESUME: "Resume Space Invaders",
        REPLAY: "Replay Space Invaders",
      };
      this.actionButton.setAttribute(
        "aria-label",
        accessibleLabels[label] || label,
      );
    }

    updateScoreOutputs() {
      if (this.scoreOutput) {
        this.scoreOutput.textContent = String(this.score).padStart(5, "0");
      }
      if (this.bestOutput) {
        this.bestOutput.textContent = String(this.bestScore).padStart(5, "0");
      }
    }

    syncInterface() {
      this.root.dataset.invadersMode = this.state;
      this.stage.dataset.invadersMode = this.state;
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
        ready: "MOVE A/D OR ←/→  /  FIRE SPACE, W OR ↑",
        running: "CLEAR THE FORMATION",
        paused: "PRESS RESUME TO CONTINUE",
        gameover: `SCORE ${String(this.score).padStart(5, "0")} / REPLAY`,
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

    createFormation() {
      this.enemies.length = 0;
      const spacingX = 48;
      const spacingY = 39;
      const columns = clamp(
        Math.floor((this.worldWidth - 76) / spacingX),
        6,
        10,
      );
      const rows = 5;
      const formationWidth = (columns - 1) * spacingX + 30;
      const startX = (this.worldWidth - formationWidth) / 2;
      const startY = 78;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          this.enemies.push({
            x: startX + column * spacingX,
            y: startY + row * spacingY,
            width: 30,
            height: 22,
            row,
            column,
            value: (rows - row) * 10,
            alive: true,
          });
        }
      }

      this.formationDirection = 1;
      this.enemyFireClock = 0;
      this.waveDelay = 0;
    }

    resetRound() {
      this.score = 0;
      this.wave = 1;
      this.lives = 3;
      this.player.x = (this.worldWidth - PLAYER_WIDTH) / 2;
      this.player.y = PLAYER_Y;
      this.playerShots.length = 0;
      this.enemyShots.length = 0;
      this.pointerTarget = null;
      this.playerFireClock = 0;
      this.hitCooldown = 0;
      this.createFormation();
      this.syncInterface();
    }

    startRound() {
      if (this.suspended) return;
      this.state = "running";
      this.resetRound();
      this.lastTime = 0;
      this.syncInterface();
      this.setStatus("Space Invaders started. Wave 1.");
      this.queueFrame();
    }

    pauseRound() {
      if (this.state !== "running") return;
      this.state = "paused";
      this.lastTime = 0;
      this.clearInput();
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.syncInterface();
      this.setStatus("Space Invaders paused. Press Resume to continue.");
      this.draw();
    }

    resumeRound() {
      if (this.state !== "paused" || this.suspended) return;
      this.state = "running";
      this.lastTime = 0;
      this.syncInterface();
      this.setStatus("Space Invaders resumed.");
      this.queueFrame();
    }

    endRound() {
      if (this.state !== "running") return;
      this.state = "gameover";
      this.clearInput();
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
      }
      if (this.bestScore > 0) saveBestScore(this.bestScore);
      this.syncInterface();
      this.setStatus(
        `Game over. Score ${this.score}. Best ${this.bestScore}. Press Replay to try again.`,
      );
      this.draw();
    }

    onActionClick(event) {
      event.preventDefault();
      this.focusStage();
      if (this.state === "running") this.pauseRound();
      else if (this.state === "paused") this.resumeRound();
      else this.startRound();
    }

    canvasPoint(event) {
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width) return null;
      return {
        x: clamp(
          ((event.clientX - bounds.left) / bounds.width) * this.worldWidth,
          PLAYER_WIDTH / 2 + 8,
          this.worldWidth - PLAYER_WIDTH / 2 - 8,
        ),
        y: ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT,
      };
    }

    moveToPointer(event) {
      const point = this.canvasPoint(event);
      if (!point) return;
      this.pointerTarget = point.x - PLAYER_WIDTH / 2;
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest?.("button, a, input, select, textarea")) return;
      if (!this.canvas.contains(event.target)) return;

      event.preventDefault();
      this.focusStage();
      this.pointerId = event.pointerId;
      this.stage.setPointerCapture?.(event.pointerId);

      if (this.state === "paused") {
        this.resumeRound();
        return;
      }
      if (this.state !== "running") {
        this.startRound();
      }
      if (this.state === "running") {
        this.moveToPointer(event);
        this.fire();
      }
    }

    onPointerMove(event) {
      if (event.pointerId !== this.pointerId || this.state !== "running") return;
      event.preventDefault();
      this.moveToPointer(event);
    }

    onPointerUp(event) {
      if (event.pointerId !== this.pointerId) return;
      this.stage.releasePointerCapture?.(event.pointerId);
      this.pointerId = null;
    }

    onKeyDown(event) {
      const key = event.key;
      if (key === "p" || key === "P") {
        if (this.state !== "running" && this.state !== "paused") return;
        event.preventDefault();
        if (this.state === "running") this.pauseRound();
        else this.resumeRound();
        return;
      }

      if (["ArrowLeft", "a", "A"].includes(key)) {
        if (this.state !== "running") return;
        event.preventDefault();
        this.pointerTarget = null;
        this.keys.left = true;
        return;
      }
      if (["ArrowRight", "d", "D"].includes(key)) {
        if (this.state !== "running") return;
        event.preventDefault();
        this.pointerTarget = null;
        this.keys.right = true;
        return;
      }

      if (![" ", "ArrowUp", "w", "W"].includes(key)) return;
      event.preventDefault();
      if (event.repeat && this.state !== "running") return;
      if (this.state === "paused") this.resumeRound();
      else if (this.state !== "running") this.startRound();
      else this.fire();
    }

    onKeyUp(event) {
      if (["ArrowLeft", "a", "A"].includes(event.key)) {
        this.keys.left = false;
      }
      if (["ArrowRight", "d", "D"].includes(event.key)) {
        this.keys.right = false;
      }
    }

    fire() {
      if (
        this.state !== "running" ||
        this.suspended ||
        this.waveDelay > 0 ||
        this.playerFireClock > 0 ||
        this.playerShots.length >= PLAYER_SHOT_LIMIT
      ) {
        return;
      }

      this.playerShots.push({
        x: this.player.x + this.player.width / 2 - 2,
        y: this.player.y - 13,
        width: 4,
        height: 14,
      });
      this.playerFireClock = 0.18;
    }

    fireEnemyShot() {
      const lowestByColumn = new Map();
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const current = lowestByColumn.get(enemy.column);
        if (!current || enemy.y > current.y) {
          lowestByColumn.set(enemy.column, enemy);
        }
      }
      const candidates = [...lowestByColumn.values()];
      if (!candidates.length) return;
      const enemy = candidates[Math.floor(Math.random() * candidates.length)];
      this.enemyShots.push({
        x: enemy.x + enemy.width / 2 - 2,
        y: enemy.y + enemy.height + 3,
        width: 4,
        height: 13,
      });
    }

    updatePlayer(delta) {
      const input = Number(this.keys.right) - Number(this.keys.left);
      if (input) {
        this.player.x += input * PLAYER_SPEED * delta;
      } else if (this.pointerTarget !== null) {
        const difference = this.pointerTarget - this.player.x;
        const step = PLAYER_SPEED * 1.75 * delta;
        this.player.x += clamp(difference, -step, step);
        if (Math.abs(difference) < 0.8) this.pointerTarget = null;
      }
      this.player.x = clamp(
        this.player.x,
        8,
        this.worldWidth - this.player.width - 8,
      );
    }

    updateFormation(delta) {
      const alive = this.enemies.filter((enemy) => enemy.alive);
      if (!alive.length) return;

      const speed = Math.min(128, 38 + (this.wave - 1) * 8 + (1 - alive.length / this.enemies.length) * 72);
      const move = this.formationDirection * speed * delta;
      const left = Math.min(...alive.map((enemy) => enemy.x));
      const right = Math.max(...alive.map((enemy) => enemy.x + enemy.width));
      const hitsEdge = left + move < 14 || right + move > this.worldWidth - 14;

      if (hitsEdge) {
        this.formationDirection *= -1;
        for (const enemy of alive) enemy.y += 17;
      } else {
        for (const enemy of alive) enemy.x += move;
      }

      if (alive.some((enemy) => enemy.y + enemy.height >= this.player.y - 12)) {
        this.endRound();
      }
    }

    hitPlayer() {
      if (this.hitCooldown > 0) return;
      this.lives -= 1;
      this.enemyShots.length = 0;
      this.player.x = (this.worldWidth - this.player.width) / 2;
      this.pointerTarget = null;
      this.hitCooldown = 1.35;
      if (this.lives <= 0) {
        this.endRound();
      } else {
        this.setStatus(`Ship hit. ${this.lives} ${this.lives === 1 ? "life" : "lives"} remaining.`);
      }
    }

    updateShots(delta) {
      for (const shot of this.playerShots) shot.y -= PLAYER_SHOT_SPEED * delta;
      for (const shot of this.enemyShots) {
        shot.y += (ENEMY_SHOT_SPEED + this.wave * 5) * delta;
      }

      for (let shotIndex = this.playerShots.length - 1; shotIndex >= 0; shotIndex -= 1) {
        const shot = this.playerShots[shotIndex];
        let hit = false;
        for (const enemy of this.enemies) {
          if (!enemy.alive || !intersects(shot, enemy)) continue;
          enemy.alive = false;
          hit = true;
          this.score += enemy.value;
          if (this.score > this.bestScore) this.bestScore = this.score;
          this.updateScoreOutputs();
          break;
        }
        if (hit || shot.y + shot.height < 0) {
          this.playerShots.splice(shotIndex, 1);
        }
      }

      const playerHitbox = {
        x: this.player.x + 5,
        y: this.player.y + 3,
        width: this.player.width - 10,
        height: this.player.height - 3,
      };
      for (let index = this.enemyShots.length - 1; index >= 0; index -= 1) {
        const shot = this.enemyShots[index];
        if (shot.y > WORLD_HEIGHT) {
          this.enemyShots.splice(index, 1);
        } else if (this.hitCooldown <= 0 && intersects(shot, playerHitbox)) {
          this.enemyShots.splice(index, 1);
          this.hitPlayer();
          break;
        }
      }
    }

    update(delta) {
      this.playerFireClock = Math.max(0, this.playerFireClock - delta);
      this.hitCooldown = Math.max(0, this.hitCooldown - delta);
      this.updatePlayer(delta);

      if (this.waveDelay > 0) {
        this.waveDelay -= delta;
        if (this.waveDelay <= 0) {
          this.wave += 1;
          this.createFormation();
          this.setStatus(`Wave ${this.wave} started.`);
        }
        return;
      }

      this.updateFormation(delta);
      if (this.state !== "running") return;

      this.enemyFireClock += delta;
      const fireInterval = Math.max(0.42, 1.05 - this.wave * 0.055);
      if (this.enemyFireClock >= fireInterval) {
        this.enemyFireClock %= fireInterval;
        this.fireEnemyShot();
      }

      this.updateShots(delta);
      if (this.state !== "running") return;

      if (!this.enemies.some((enemy) => enemy.alive)) {
        this.playerShots.length = 0;
        this.enemyShots.length = 0;
        this.waveDelay = 1.15;
        this.score += this.wave * 100;
        if (this.score > this.bestScore) this.bestScore = this.score;
        this.updateScoreOutputs();
        this.setStatus(`Wave ${this.wave} cleared.`);
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

      context.strokeStyle = this.colors.line;
      context.setLineDash([5, 8]);
      context.beginPath();
      context.moveTo(0, 510);
      context.lineTo(this.worldWidth, 510);
      context.stroke();
      context.setLineDash([]);
    }

    drawEnemy(enemy) {
      const context = this.context;
      const phase = this.reducedMotion ? 0 : Math.sin(this.idleTime * 7 + enemy.column) * 1.4;
      context.save();
      context.translate(enemy.x, enemy.y + phase);
      context.fillStyle = enemy.row < 2 ? this.colors.accentDeep : this.colors.raised;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 1.7;

      context.beginPath();
      context.moveTo(5, 6);
      context.lineTo(10, 1);
      context.lineTo(20, 1);
      context.lineTo(25, 6);
      context.lineTo(30, 10);
      context.lineTo(26, 20);
      context.lineTo(21, 16);
      context.lineTo(9, 16);
      context.lineTo(4, 20);
      context.lineTo(0, 10);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = this.colors.text;
      context.fillRect(8, 8, 4, 4);
      context.fillRect(18, 8, 4, 4);
      context.strokeStyle = this.colors.lineStrong;
      context.beginPath();
      context.moveTo(7, 4);
      context.lineTo(3, 0);
      context.moveTo(23, 4);
      context.lineTo(27, 0);
      context.stroke();
      context.restore();
    }

    drawEnemies() {
      for (const enemy of this.enemies) {
        if (enemy.alive) this.drawEnemy(enemy);
      }
    }

    drawPlayer() {
      if (
        this.hitCooldown > 0 &&
        !this.reducedMotion &&
        Math.floor(this.hitCooldown * 10) % 2 === 0
      ) {
        return;
      }

      const context = this.context;
      const { x, y, width, height } = this.player;
      context.fillStyle = this.colors.accent;
      context.strokeStyle = this.colors.text;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y + height);
      context.lineTo(x + 7, y + 8);
      context.lineTo(x + width * 0.38, y + 8);
      context.lineTo(x + width / 2, y);
      context.lineTo(x + width * 0.62, y + 8);
      context.lineTo(x + width - 7, y + 8);
      context.lineTo(x + width, y + height);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = this.colors.surface;
      context.fillRect(x + width / 2 - 3, y + 7, 6, 10);
    }

    drawShots() {
      const context = this.context;
      context.fillStyle = this.colors.text;
      for (const shot of this.playerShots) {
        context.fillRect(shot.x, shot.y, shot.width, shot.height);
      }
      context.fillStyle = this.colors.danger;
      for (const shot of this.enemyShots) {
        context.fillRect(shot.x, shot.y, shot.width, shot.height);
      }
    }

    drawHud() {
      const context = this.context;
      context.font = "700 11px SFMono-Regular, Consolas, monospace";
      context.textAlign = "left";
      context.fillStyle = this.colors.muted;
      context.fillText("SCORE", 18, 25);
      context.fillStyle = this.colors.text;
      context.font = "700 24px SFMono-Regular, Consolas, monospace";
      context.fillText(String(this.score).padStart(5, "0"), 18, 50);

      context.fillStyle = this.colors.muted;
      context.font = "700 11px SFMono-Regular, Consolas, monospace";
      context.textAlign = "center";
      context.fillText(`WAVE ${String(this.wave).padStart(2, "0")}`, this.worldWidth / 2, 25);

      context.textAlign = "right";
      context.fillText(`BEST ${String(this.bestScore).padStart(5, "0")}`, this.worldWidth - 18, 25);
      context.fillText(`LIVES ${"◆".repeat(this.lives)}`, this.worldWidth - 18, 47);
    }

    drawMessage(title, instruction) {
      const context = this.context;
      const width = Math.min(390, this.worldWidth - 36);
      const height = 92;
      const x = (this.worldWidth - width) / 2;
      const y = WORLD_HEIGHT * 0.39;

      context.save();
      context.globalAlpha = 0.95;
      context.fillStyle = this.colors.surface;
      context.fillRect(x, y, width, height);
      context.globalAlpha = 1;
      context.strokeStyle = this.colors.lineStrong;
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
      context.fillStyle = this.colors.text;
      context.textAlign = "center";
      context.font = "700 17px SFMono-Regular, Consolas, monospace";
      context.fillText(title, this.worldWidth / 2, y + 35);
      context.fillStyle = this.colors.muted;
      context.font = "700 10px SFMono-Regular, Consolas, monospace";
      context.fillText(instruction, this.worldWidth / 2, y + 63);
      context.restore();
    }

    draw() {
      if (!this.context || !this.canvas.width || !this.canvas.height) return;
      this.configureContext();
      this.drawGrid();
      this.drawEnemies();
      this.drawShots();
      this.drawPlayer();
      this.drawHud();

      if (this.suspended && this.state === "running") {
        this.drawMessage("PAUSED", "THE GAME RESUMES WHEN VISIBLE");
      } else if (this.waveDelay > 0 && this.state === "running") {
        this.drawMessage("WAVE CLEAR", `PREPARING WAVE ${this.wave + 1}`);
      } else if (!this.overlay && this.state === "ready") {
        this.drawMessage("READY", "MOVE A/D OR ARROWS / FIRE SPACE, W OR UP");
      } else if (!this.overlay && this.state === "paused") {
        this.drawMessage("PAUSED", "PRESS RESUME OR P TO CONTINUE");
      } else if (!this.overlay && this.state === "gameover") {
        this.drawMessage("GAME OVER", "PRESS REPLAY TO TRY AGAIN");
      }
    }
  }

  const initialiseGames = () => {
    document.querySelectorAll("[data-invaders-game]").forEach((root) => {
      if (root.dataset.invadersReady) return;
      const canvas = root.querySelector("[data-invaders-canvas]");
      if (!(canvas instanceof HTMLCanvasElement)) return;
      root.dataset.invadersReady = "true";
      new SpaceInvadersGame(root);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseGames, { once: true });
  } else {
    initialiseGames();
  }
})();
