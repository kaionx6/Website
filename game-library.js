(() => {
  "use strict";

  const tabList = document.querySelector("[data-game-tabs]");
  if (!tabList) return;

  const tabs = [...tabList.querySelectorAll("[data-game-tab]")];
  const panels = [...document.querySelectorAll("[data-game-panel]")];
  const fullscreenButtons = [
    ...document.querySelectorAll("[data-game-fullscreen]"),
  ];
  const horizontalLayout = window.matchMedia("(max-width: 950px)");
  let fallbackFullscreenPanel = null;
  let fullscreenReturnFocus = null;
  let fallbackInertEntries = [];

  const getNativeFullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

  const getFullscreenPanel = () => {
    const nativeFullscreenElement = getNativeFullscreenElement();
    return (
      nativeFullscreenElement?.closest?.("[data-game-panel]") ||
      fallbackFullscreenPanel
    );
  };

  const getGameName = (gamePanel) => {
    const heading = gamePanel?.querySelector(".game-window__bar h2");
    return heading?.textContent?.split("/")[0].trim() || "game";
  };

  const queueGameResize = () => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  };

  const restoreFullscreenFocus = () => {
    const control = fullscreenReturnFocus;
    fullscreenReturnFocus = null;
    if (!control?.isConnected) return;

    try {
      control.focus({ preventScroll: true });
    } catch (_error) {
      control.focus();
    }
  };

  const syncFullscreenControls = () => {
    const activePanel = getFullscreenPanel();
    document.documentElement.classList.toggle(
      "has-game-fullscreen",
      Boolean(activePanel),
    );
    panels.forEach((panel) => {
      panel.classList.toggle(
        "is-game-fullscreen-active",
        panel === activePanel,
      );
    });

    fullscreenButtons.forEach((button) => {
      const gamePanel = button.closest("[data-game-panel]");
      const isActive = gamePanel === activePanel;
      const action = isActive ? "Exit fullscreen for" : "Enter fullscreen for";
      const label = button.querySelector("[data-game-fullscreen-label]");

      button.setAttribute("aria-pressed", String(isActive));
      button.setAttribute("aria-label", `${action} ${getGameName(gamePanel)}`);
      button.title = `${action} ${getGameName(gamePanel)}`;
      if (label) label.textContent = isActive ? "EXIT" : "FULL";
    });

    queueGameResize();
  };

  const restoreFallbackIsolation = () => {
    fallbackInertEntries.forEach(({ element, wasInert }) => {
      if (!wasInert) element.removeAttribute("inert");
    });
    fallbackInertEntries = [];
  };

  const isolateFallbackPanel = (gamePanel) => {
    restoreFallbackIsolation();
    let branch = gamePanel;

    while (branch && branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;

      [...parent.children].forEach((sibling) => {
        if (sibling === branch) return;
        const wasInert = sibling.hasAttribute("inert");
        fallbackInertEntries.push({ element: sibling, wasInert });
        sibling.setAttribute("inert", "");
      });
      branch = parent;
    }
  };

  const enterFallbackFullscreen = (gamePanel) => {
    if (fallbackFullscreenPanel && fallbackFullscreenPanel !== gamePanel) {
      fallbackFullscreenPanel.classList.remove("is-game-fullscreen-fallback");
      restoreFallbackIsolation();
    }

    fallbackFullscreenPanel = gamePanel;
    isolateFallbackPanel(gamePanel);
    gamePanel.classList.add("is-game-fullscreen-fallback");
    syncFullscreenControls();
  };

  const exitFallbackFullscreen = (restoreFocus = true) => {
    if (!fallbackFullscreenPanel) return;

    fallbackFullscreenPanel.classList.remove("is-game-fullscreen-fallback");
    fallbackFullscreenPanel = null;
    restoreFallbackIsolation();
    syncFullscreenControls();
    if (restoreFocus) restoreFullscreenFocus();
  };

  const enterGameFullscreen = async (gamePanel, button) => {
    fullscreenReturnFocus = button;
    const requestFullscreen =
      gamePanel.requestFullscreen || gamePanel.webkitRequestFullscreen;

    if (!requestFullscreen) {
      enterFallbackFullscreen(gamePanel);
      return;
    }

    try {
      const requestResult = requestFullscreen.call(gamePanel);
      if (requestResult?.then) await requestResult;

      // Older WebKit returns no promise, so give its fullscreen event a moment.
      if (!getNativeFullscreenElement() && !requestResult?.then) {
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }

      if (getNativeFullscreenElement()) {
        syncFullscreenControls();
      } else {
        enterFallbackFullscreen(gamePanel);
      }
    } catch (_error) {
      if (!getNativeFullscreenElement()) enterFallbackFullscreen(gamePanel);
    }
  };

  const exitGameFullscreen = async () => {
    if (fallbackFullscreenPanel) {
      exitFallbackFullscreen();
      return;
    }

    const exitFullscreen =
      document.exitFullscreen || document.webkitExitFullscreen;

    if (getNativeFullscreenElement() && exitFullscreen) {
      try {
        const exitResult = exitFullscreen.call(document);
        if (exitResult?.then) await exitResult;
      } catch (_error) {
        // The browser may have already handled an Escape or system gesture.
      }
    }

    syncFullscreenControls();
    if (!getFullscreenPanel()) restoreFullscreenFocus();
  };

  const handleNativeFullscreenChange = () => {
    const nativeFullscreenElement = getNativeFullscreenElement();

    if (nativeFullscreenElement && fallbackFullscreenPanel) {
      fallbackFullscreenPanel.classList.remove("is-game-fullscreen-fallback");
      fallbackFullscreenPanel = null;
      restoreFallbackIsolation();
    }

    syncFullscreenControls();
    if (!getFullscreenPanel()) restoreFullscreenFocus();
  };

  const getFallbackFocusableElements = () => {
    if (!fallbackFullscreenPanel) return [];

    return [
      ...fallbackFullscreenPanel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.getClientRects().length > 0);
  };

  const handleFallbackKeydown = (event) => {
    if (!fallbackFullscreenPanel) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      exitFallbackFullscreen();
      return;
    }

    if (event.key !== "Tab") return;
    const focusableElements = getFallbackFocusableElements();
    if (!focusableElements.length) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (
      event.shiftKey &&
      (activeElement === firstElement ||
        !fallbackFullscreenPanel.contains(activeElement))
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === lastElement ||
        !fallbackFullscreenPanel.contains(activeElement))
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const syncOrientation = () => {
    tabList.setAttribute(
      "aria-orientation",
      horizontalLayout.matches ? "horizontal" : "vertical",
    );
  };

  const activateGame = (nextTab, moveFocus = false) => {
    const panelId = nextTab.getAttribute("aria-controls");

    tabs.forEach((tab) => {
      const isActive = tab === nextTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((panel) => {
      const isActive = panel.id === panelId;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });

    if (moveFocus) nextTab.focus();

    queueGameResize();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateGame(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = index;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      activateGame(tabs[nextIndex], true);
    });
  });

  fullscreenButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const gamePanel = button.closest("[data-game-panel]");
      if (!gamePanel) return;

      if (getFullscreenPanel() === gamePanel) {
        await exitGameFullscreen();
        return;
      }

      if (getFullscreenPanel()) await exitGameFullscreen();
      await enterGameFullscreen(gamePanel, button);
    });
  });

  document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
  document.addEventListener(
    "webkitfullscreenchange",
    handleNativeFullscreenChange,
  );
  document.addEventListener("keydown", handleFallbackKeydown, true);
  window.addEventListener("orientationchange", queueGameResize);
  window.visualViewport?.addEventListener("resize", queueGameResize);
  window.addEventListener("pagehide", () => {
    exitFallbackFullscreen(false);
  });

  syncOrientation();
  syncFullscreenControls();
  horizontalLayout.addEventListener?.("change", syncOrientation);
})();
