(() => {
  "use strict";

  const tabList = document.querySelector("[data-game-tabs]");
  if (!tabList) return;

  const tabs = [...tabList.querySelectorAll("[data-game-tab]")];
  const panels = [...document.querySelectorAll("[data-game-panel]")];
  const horizontalLayout = window.matchMedia("(max-width: 950px)");

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

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
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

  syncOrientation();
  horizontalLayout.addEventListener?.("change", syncOrientation);
})();
