(() => {
  "use strict";

  if (!document.querySelector(".atlas-main") || typeof state === "undefined" || typeof DATA === "undefined") return;

  const body = document.body;
  const hero = document.querySelector(".atlas-main .hero");
  const filterbar = document.querySelector(".global-filterbar");
  const filters = filterbar?.querySelector(".filters");
  const drawer = document.getElementById("atlasDrawer");
  const drawerScroll = drawer?.querySelector(".drawer-scroll");
  const workspace = document.getElementById("atlasWorkspace");
  const railDrawerToggle = document.getElementById("drawerRailToggle");
  const chartHead = document.querySelector(".chart-head");
  const chartMeta = document.getElementById("chartMeta");
  const localControls = document.getElementById("localControls");
  const viz = document.getElementById("viz");

  if (!hero || !filters || !drawer || !chartHead || !localControls || !viz) return;

  body.classList.add("app-interface-v2");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);

  const buildHeader = () => {
    const title = hero.querySelector("h1");
    if (title) title.textContent = "Смертность Амурской области";

    const brand = document.createElement("span");
    brand.className = "app-brand-mark";
    brand.setAttribute("aria-hidden", "true");
    brand.innerHTML = `
      <svg viewBox="0 0 40 30">
        <path d="M1 15h6l2.4-7 4.2 15 4.2-21 4.3 26 3.2-13H39"/>
        <circle cx="20" cy="15" r="2.4"/>
      </svg>`;
    hero.prepend(brand);

    const context = document.createElement("div");
    context.className = "app-header-context";
    context.dataset.legacyHeaderStatus = "";
    context.innerHTML = `
      <span class="app-header-pill">Период <b id="appHeaderPeriod">${escapeHtml(DATA.period || "2023–2025")}</b></span>`;
    title?.insertAdjacentElement("afterend", context);

    context.insertAdjacentHTML("beforeend", '<span class="app-header-pill"><b>Демоверсия</b></span>');
    const reactHeaderHost = document.createElement("div");
    reactHeaderHost.className = "react-header-status-host";
    reactHeaderHost.dataset.reactHeaderStatus = "";
    reactHeaderHost.hidden = true;
    context.insertAdjacentElement("beforebegin", reactHeaderHost);

    const actions = document.createElement("div");
    actions.className = "app-header-actions";
    actions.dataset.legacyHeaderActions = "";

    const help = document.createElement("button");
    help.type = "button";
    help.className = "app-help-button";
    help.textContent = "?";
    help.title = "Методика и сведения о данных";
    help.setAttribute("aria-label", "Открыть методику и сведения о данных");
    help.addEventListener("click", () => document.getElementById("atlasHelpToggle")?.click());
    actions.appendChild(help);
    hero.appendChild(actions);
  };

  const buildGlobalFilters = () => {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "app-filter-reset";
    reset.textContent = "Сбросить";
    reset.title = "Сбросить общие фильтры";

    filters.append(reset);

    reset.addEventListener("click", () => {
      state.year = "all";
      state.sex = "all";
      state.age = "all";
      render();
    });
  };

  const inlineControls = document.createElement("div");
  inlineControls.className = "shell-inline-controls";
  inlineControls.setAttribute("aria-label", "Параметры текущей визуализации");
  chartHead.appendChild(inlineControls);

  const localControlsAnchor = document.createComment("local-controls-anchor");
  localControls.parentNode?.insertBefore(localControlsAnchor, localControls);

  const restoreLocalControls = () => {
    if (localControls.parentElement === inlineControls && localControlsAnchor.parentNode) {
      localControlsAnchor.parentNode.insertBefore(localControls, localControlsAnchor.nextSibling);
    }
  };

  const moveInlineControls = () => {
    restoreLocalControls();
  };

  const ensureInspectorToggle = () => {
    const toolbar = viz.querySelector(".mortality-map-toolbar");
    if (!toolbar || toolbar.querySelector(".shell-inspector-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shell-inspector-toggle";
    button.dataset.legacyMapInspectorToggle = "";
    button.textContent = "Легенда";
    button.setAttribute("aria-expanded", String(body.classList.contains("shell-inspector-open")));
    button.addEventListener("click", () => {
      const open = body.classList.toggle("shell-inspector-open");
      button.setAttribute("aria-expanded", String(open));
      window.setTimeout(() => window.AmurMortalityMap?.resize?.(), 220);
    });
    toolbar.appendChild(button);
  };

  const syncInfrastructurePanelToggle = () => {
    if (!railDrawerToggle) return;
    const glyph = railDrawerToggle.querySelector("span");
    if (state.view === "infrastructure") {
      const shell = viz.querySelector(".infra-shell");
      const collapsed = shell?.classList.contains("is-panel-collapsed") || false;
      if (glyph) glyph.textContent = collapsed ? "»" : "«";
      railDrawerToggle.setAttribute("aria-expanded", String(!collapsed));
      railDrawerToggle.title = collapsed ? "Открыть панель слоёв" : "Свернуть панель слоёв";
      railDrawerToggle.setAttribute("aria-label", railDrawerToggle.title);
      return;
    }
    const drawerOpen = !workspace?.classList.contains("drawer-collapsed");
    if (glyph) glyph.textContent = drawerOpen ? "«" : "»";
    railDrawerToggle.setAttribute("aria-expanded", String(drawerOpen));
    railDrawerToggle.title = drawerOpen ? "Свернуть панель параметров" : "Открыть панель параметров";
    railDrawerToggle.setAttribute("aria-label", railDrawerToggle.title);
  };

  railDrawerToggle?.addEventListener("click", (event) => {
    if (state.view !== "infrastructure") return;
    const infrastructureToggle = viz.querySelector(".infra-panel-collapse");
    if (!infrastructureToggle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    infrastructureToggle.click();
    requestAnimationFrame(syncInfrastructurePanelToggle);
  }, true);

  viz.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".infra-panel-collapse")) return;
    requestAnimationFrame(syncInfrastructurePanelToggle);
  });

  const syncShell = () => {
    body.dataset.shellView = state.view;
    body.classList.toggle("app-infrastructure-mode", state.view === "infrastructure");
    if (state.view !== "map") body.classList.remove("shell-inspector-open");

    const period = document.getElementById("appHeaderPeriod");
    if (period) period.textContent = state.year === "all" ? (DATA.period || "2023–2025") : String(state.year);

    const year = document.getElementById("yearSelect");
    const age = document.getElementById("ageSelect");
    if (year) year.value = state.year;
    if (age) age.value = state.age;
    document.querySelectorAll("#sexSeg button").forEach((button) => {
      button.classList.toggle("active", button.dataset.value === state.sex);
    });

    const changeNotice = document.querySelector(".atlas-change-notice");
    if (changeNotice && changeNotice.parentElement !== chartHead) chartHead.appendChild(changeNotice);
    if (chartMeta && chartMeta.parentElement !== chartHead) chartHead.appendChild(chartMeta);
    moveInlineControls();
    ensureInspectorToggle();
    syncInfrastructurePanelToggle();
  };

  buildHeader();
  buildGlobalFilters();

  const baseRender = render;
  render = () => {
    baseRender();
    syncShell();
    requestAnimationFrame(syncShell);
  };

  new MutationObserver(() => {
    ensureInspectorToggle();
    moveInlineControls();
    syncInfrastructurePanelToggle();
  }).observe(viz, { childList: true, subtree: true });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1540) body.classList.remove("shell-inspector-open");
  }, { passive: true });

  syncShell();
  render();
})();
