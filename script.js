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
  const tabList = document.querySelector('[role="tablist"]');
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
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          navLinks.forEach((link) => {
            const isCurrent = link.getAttribute("href") === `#${entry.target.id}`;
            link.classList.toggle("is-active", isCurrent);
            if (isCurrent) {
              link.setAttribute("aria-current", "location");
            } else {
              link.removeAttribute("aria-current");
            }
          });
        });
      },
      { rootMargin: "-32% 0px -58%", threshold: 0 },
    );

    sections.forEach((section) => sectionObserver.observe(section));
  }

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
})();
