(() => {
  "use strict";
  const start = () => {
    const body = document.body;
    const hero = document.querySelector(".hero");
    const bar = document.querySelector(".global-filterbar");
    const viz = document.getElementById("viz");
    if (!hero || !bar || !viz) return;
    const narrow = matchMedia("(max-width: 1023px)");
    let initialized = false;
    let previousView = "";
    let infraPrepared = false;
    let frame = 0;
    bar.id = "atlasGlobalFilters";
    const tools = document.createElement("div");
    tools.className = "mobile-tools";
    tools.innerHTML = '<button type="button" class="mobile-filter-toggle" aria-controls="atlasGlobalFilters" aria-expanded="false">Фильтры</button><button type="button" class="mobile-details-toggle" aria-expanded="false">Аналитика</button>';
    hero.appendChild(tools);
    const filterToggle = tools.querySelector(".mobile-filter-toggle");
    const detailsToggle = tools.querySelector(".mobile-details-toggle");
    const hint = document.createElement("small");
    hint.className = "mobile-chart-hint";
    hint.textContent = "Нажмите строку или точку для сведений. Список прокручивается вниз.";
    document.querySelector(".chart-head > div:first-child")?.appendChild(hint);
    const resize = () => requestAnimationFrame(() => dispatchEvent(new Event("resize")));
    const closeDetails = () => {
      body.classList.remove("mobile-details-open");
      detailsToggle.setAttribute("aria-expanded", "false");
      schedule();
    };
    const openDetails = () => {
      body.classList.add("mobile-details-open");
      detailsToggle.setAttribute("aria-expanded", "true");
      window.AtlasInteraction?.dismiss();
      schedule();
    };
    filterToggle.addEventListener("click", () => {
      const hidden = body.classList.toggle("mobile-filters-hidden");
      filterToggle.setAttribute("aria-expanded", String(!hidden));
      resize();
    });
    detailsToggle.addEventListener("click", () => {
      const open = body.classList.toggle("mobile-details-open");
      detailsToggle.setAttribute("aria-expanded", String(open));
      schedule();
    });
    const manage = (element, closed) => {
      if (!element) return;
      element.inert = narrow.matches && closed;
    };
    const sync = () => {
      frame = 0;
      const bridge = window.AtlasLegacyBridge;
      if (!narrow.matches) {
        initialized = false;
        body.classList.remove("mobile-filters-hidden", "mobile-details-open");
        document.querySelectorAll(".sidebar, .infra-layer-composer, .treev2-inspector, .heatv2-inspector, .hybrid-inspector, .mortality-map-side").forEach(el => { el.inert = false; });
        return;
      }
      const view = bridge?.getSnapshot().view || body.dataset.shellView;
      hint.classList.toggle("is-needed", new Set(["arrow", "pyramid", "plot", "dotogram"]).has(view));
      if (bridge && !initialized) {
        initialized = true;
        body.classList.add("mobile-filters-hidden");
        bridge.setNavigationPanel(false);
      }
      if (view !== previousView) {
        previousView = view;
        infraPrepared = false;
        body.classList.remove("hybrid-inspector-open");
        closeDetails();
        bridge?.setNavigationPanel(false);
      }
      if (view === "infrastructure" && !infraPrepared && viz.querySelector(".infra-shell")) {
        infraPrepared = true;
        bridge?.setNavigationPanel(false);
      }
      filterToggle.setAttribute("aria-expanded", String(!body.classList.contains("mobile-filters-hidden")));
      const panel = viz.querySelector(".treev2-inspector, .heatv2-inspector");
      if (panel) {
        panel.id = view === "treemap" ? "mobileStructureInspector" : "mobileMatrixInspector";
        detailsToggle.setAttribute("aria-controls", panel.id);
        if (!panel.querySelector(":scope > .mobile-panel-close")) {
          const close = document.createElement("button");
          close.type = "button";
          close.className = "mobile-panel-close";
          close.textContent = "Закрыть аналитику";
          close.addEventListener("click", () => { closeDetails(); detailsToggle.focus(); });
          panel.prepend(close);
        }
        manage(panel, !body.classList.contains("mobile-details-open"));
      }
      manage(document.querySelector(".sidebar"), document.querySelector(".workspace")?.classList.contains("drawer-collapsed"));
      manage(viz.querySelector(".infra-layer-composer"), viz.querySelector(".infra-shell")?.classList.contains("is-panel-collapsed"));
      manage(document.querySelector(".hybrid-inspector"), !body.classList.contains("hybrid-inspector-open"));
      manage(viz.querySelector(".mortality-map-side"), !body.classList.contains("shell-inspector-open"));
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
    addEventListener("atlas:legacy-state", schedule);
    addEventListener("atlas:infrastructure-panel", schedule);
    addEventListener("atlas:treemap-details", event => {
      if (!narrow.matches) return;
      if (event.detail) openDetails();
      else closeDetails();
    });
    addEventListener("resize", schedule);
    const showSelectionDetails = target => {
      if (narrow.matches && target.closest("#viz .heatv2-cell")) openDetails();
      if (target.closest('#viz [data-inspector-managed="true"], #viz .dotogram-point') && !new Set(["treemap", "heatmap"]).has(body.dataset.shellView)) {
        body.classList.add("hybrid-inspector-open");
        document.querySelector(".hybrid-inspector-toggle")?.setAttribute("aria-expanded", "true");
      }
      window.AtlasInteraction?.dismiss();
      schedule();
    };
    document.addEventListener("click", event => {
      if (!narrow.matches || !(event.target instanceof Element)) return;
      if (event.target.closest("[data-react-navigation-view]")) closeDetails();
      showSelectionDetails(event.target);
    });
    document.addEventListener("keydown", event => {
      if (innerWidth > 1180) return;
      if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element) showSelectionDetails(event.target);
      if (!narrow.matches || event.key !== "Escape") return;
      closeDetails();
      body.classList.remove("hybrid-inspector-open", "shell-inspector-open");
      window.AtlasLegacyBridge?.setNavigationPanel(false);
      document.querySelector("[data-react-navigation-panel]")?.focus();
      schedule();
    });
    new MutationObserver(schedule).observe(viz, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
