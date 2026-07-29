(() => {
  "use strict";

  const root = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const themeLabel = themeToggle?.querySelector(".theme-toggle__label");
  const themeColor = document.querySelector('meta[name="theme-color"]');

  const applyTheme = (theme, save = false) => {
    const nextTheme = theme === "light" ? "light" : "dark";
    root.dataset.theme = nextTheme;

    if (themeToggle) {
      const isLight = nextTheme === "light";
      themeToggle.setAttribute(
        "aria-label",
        `Switch to ${isLight ? "dark" : "light"} theme`,
      );
      themeToggle.title = `Switch to ${isLight ? "dark" : "light"} theme`;
    }

    if (themeLabel) {
      themeLabel.textContent = nextTheme === "light" ? "Light" : "Dark";
    }

    themeColor?.setAttribute(
      "content",
      nextTheme === "light" ? "#eef4f8" : "#06101c",
    );

    if (save) {
      try {
        localStorage.setItem("kelvin-theme", nextTheme);
      } catch (_) {
        // Theme switching still works if storage has been disabled.
      }
    }
  };

  applyTheme(root.dataset.theme);

  themeToggle?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === "kelvin-theme" && event.newValue) {
      applyTheme(event.newValue);
    }
  });

  const tabs = [...document.querySelectorAll("[data-project-tab]")];
  const panels = [...document.querySelectorAll("[data-project-panel]")];
  const tabList = document.querySelector('.project-tabs[role="tablist"]');
  const horizontalTabs = window.matchMedia("(max-width: 950px)");

  const syncTabOrientation = () => {
    tabList?.setAttribute(
      "aria-orientation",
      horizontalTabs.matches ? "horizontal" : "vertical",
    );
  };

  syncTabOrientation();
  horizontalTabs.addEventListener?.("change", syncTabOrientation);

  const activateTab = (nextTab, moveFocus = false) => {
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

    if (moveFocus) {
      nextTab.focus();
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));

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
      activateTab(tabs[nextIndex], true);
      tabs[nextIndex].scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  });

  const navLinks = [...document.querySelectorAll(".main-nav a")];
  const currentPage = document.body.dataset.page || "home";

  navLinks.forEach((link) => {
    const isCurrent = link.dataset.pageLink === currentPage;
    link.classList.toggle("is-active", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  /* A deliberate vertical wheel gesture moves through the site's pages. The
     listener runs in the bubble phase so contained interactions, especially
     the Project 01 model sequence, can consume the wheel event first. */
  const pageSequence = [
    { id: "home", href: "index.html" },
    { id: "projects", href: "projects.html" },
    { id: "games", href: "games.html" },
    { id: "about", href: "about.html" },
    { id: "contact", href: "contact.html" },
  ];
  const pageIndex = pageSequence.findIndex((page) => page.id === currentPage);
  const wheelLockKey = "kelvin-page-wheel-lock";
  const wheelThreshold = 520;
  const wheelQuietWindow = 500;
  let wheelDistance = 0;
  let wheelDirection = 0;
  let lastWheelAt = 0;
  let isChangingPage = false;
  let arrivalLockUntil = 0;

  try {
    arrivalLockUntil = Number(sessionStorage.getItem(wheelLockKey)) || 0;
    if (arrivalLockUntil <= Date.now()) {
      sessionStorage.removeItem(wheelLockKey);
      arrivalLockUntil = 0;
    }
  } catch (_) {
    // Cross-page wheel navigation also works when session storage is blocked.
  }

  const clearArrivalLock = () => {
    arrivalLockUntil = 0;
    try {
      sessionStorage.removeItem(wheelLockKey);
    } catch (_) {
      // Nothing else is required if storage is unavailable.
    }
  };

  const guardArrivalWheel = (event) => {
    if (!arrivalLockUntil) return;
    if (Date.now() >= arrivalLockUntil) {
      clearArrivalLock();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    arrivalLockUntil = Math.max(arrivalLockUntil, Date.now() + 180);

    try {
      sessionStorage.setItem(wheelLockKey, String(arrivalLockUntil));
    } catch (_) {
      // The in-memory lock is enough for the current document.
    }
  };

  window.addEventListener("wheel", guardArrivalWheel, {
    capture: true,
    passive: false,
  });

  const normalizedWheelAxis = (event, axis) => {
    let value = axis === "x" ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) value *= 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      value *= window.innerHeight;
    }
    return value;
  };

  const hasScrollRoom = (element, direction) => {
    const maximum = element.scrollHeight - element.clientHeight;
    if (maximum <= 1) return false;
    return direction > 0
      ? element.scrollTop < maximum - 1
      : element.scrollTop > 1;
  };

  const canScrollVertically = (target, direction) => {
    let element = target instanceof Element ? target : null;

    while (element && element !== document.body && element !== root) {
      const overflowY = getComputedStyle(element).overflowY;
      if (
        /(auto|scroll|overlay)/.test(overflowY) &&
        hasScrollRoom(element, direction)
      ) {
        return true;
      }
      element = element.parentElement;
    }

    const scroller = document.scrollingElement;
    if (!scroller) return false;

    const rootOverflow = getComputedStyle(root).overflowY;
    const bodyOverflow = getComputedStyle(document.body).overflowY;
    const documentIsLocked =
      /(hidden|clip)/.test(rootOverflow) || /(hidden|clip)/.test(bodyOverflow);

    return !documentIsLocked && hasScrollRoom(scroller, direction);
  };

  const wheelTargetIsInteractive = (target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest(
        'a, button, input, select, textarea, [role="tab"], [role="slider"], [contenteditable]:not([contenteditable="false"]), .game-stage',
      ),
    );
  };

  const moveToAdjacentPage = (direction) => {
    if (isChangingPage || pageIndex < 0) return;
    isChangingPage = true;

    const nextIndex =
      (pageIndex + direction + pageSequence.length) % pageSequence.length;
    const lockUntil = Date.now() + 850;

    try {
      sessionStorage.setItem(wheelLockKey, String(lockUntil));
    } catch (_) {
      // The navigation itself does not depend on session storage.
    }

    window.location.assign(pageSequence[nextIndex].href);
  };

  window.addEventListener(
    "wheel",
    (event) => {
      if (
        isChangingPage ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        pageIndex < 0 ||
        wheelTargetIsInteractive(event.target)
      ) {
        return;
      }

      const deltaY = normalizedWheelAxis(event, "y");
      const deltaX = normalizedWheelAxis(event, "x");
      if (Math.abs(deltaY) < 2 || Math.abs(deltaX) > Math.abs(deltaY)) return;

      const direction = Math.sign(deltaY);
      if (canScrollVertically(event.target, direction)) {
        wheelDistance = 0;
        wheelDirection = 0;
        return;
      }

      event.preventDefault();
      const now = performance.now();
      const elapsed = now - lastWheelAt;

      if (elapsed > wheelQuietWindow || direction !== wheelDirection) {
        wheelDistance = 0;
      } else if (elapsed > 80) {
        wheelDistance *= Math.max(0.55, 1 - elapsed / 1500);
      }

      wheelDirection = direction;
      lastWheelAt = now;
      wheelDistance += Math.min(Math.abs(deltaY), 160);

      if (wheelDistance >= wheelThreshold) {
        wheelDistance = 0;
        moveToAdjacentPage(direction);
      }
    },
    { passive: false },
  );

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
})();
