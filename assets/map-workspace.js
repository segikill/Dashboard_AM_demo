/* Desktop workspace only. Existing map instances and data models retain ownership. */
(() => {
  "use strict";
  const desktop = () => innerWidth >= 1024;
  const wide = () => innerWidth - (document.querySelector(".viz-rail")?.getBoundingClientRect().width || 80) >= 1380;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "Нет данных";
  const filters = document.querySelector("[data-react-global-filters]");
  const home = document.createComment("Global filters home");
  filters?.before(home);
  let frame = 0, initializedMortality = false, facility = null, lastMedicalMode = null;
  let medicalInformationOpen = true;
  const initializedMedicalShells = new WeakSet();
  const notify = () => window.dispatchEvent(new Event("atlas:workspace-panel"));
  const shell = () => document.querySelector("#viz .infra-shell");
  const setInformation = (open, { focus = true } = {}) => {
    const root = shell();
    if (!root || !desktop()) return;
    medicalInformationOpen = open;
    if (open && !wide()) window.AtlasLegacyBridge?.setInfrastructurePanel(false);
    root.classList.toggle("has-map-information", open);
    const panel = root.querySelector(".map-workspace-information");
    if (panel) { panel.inert = !open; panel.setAttribute("aria-hidden", String(!open)); }
    window.AmurInfrastructureMap?.resize();
    notify();
    schedule();
    if (focus && open) requestAnimationFrame(() => panel?.querySelector("h3")?.focus({ preventScroll: true }));
    if (focus && !open) root.querySelector(".map-workspace-details")?.focus({ preventScroll: true });
  };
  const showFacility = (title, html) => {
    facility = { title, html };
    setInformation(true);
  };
  const networkHtml = () => {
    const data = window.AMUR_INFRASTRUCTURE_DATA;
    if (!data) return "";
    const selected = window.AmurInfrastructureMap?.getSelection?.();
    const territory = selected == null ? null : data.municipalities.features.find(f => Number(f.id ?? f.properties.id) === selected);
    const labels = { hospital:"Больницы",polyclinic:"Поликлиники",fap:"ФАП",ambulatory:"Амбулатории",maternity:"Родильные дома",consultation:"Консультации",rehabilitation:"Реабилитация",health_post:"Здравпункты" };
    return `${facility ? facility.html : territory ? `<section class="map-workspace-network-selection"><h4>${esc(territory.properties.name)}</h4><b>${fmt(territory.properties.population2021)}</b><p>жителей · перепись 2021</p></section>` : ""}
      <section><h4>Область · охват населения</h4><p class="map-workspace-note">Зоны от больниц · население 2021</p><dl>${data.meta.isochrone_population_coverage.map(row => `<dt>До ${row.minutes} минут</dt><dd>${fmt(row.population)}<small>${fmt(row.share_percent)}%</small></dd>`).join("")}</dl><p class="map-workspace-note">Зона 60 минут включает 20-минутную.</p></section>
      <section><h4>Каталог учреждений</h4><p class="map-workspace-note">Всего ${fmt(data.meta.facilities)} · не зависит от масштаба карты</p><dl>${Object.entries(data.meta.facility_counts).map(([key,value]) => `<dt>${esc(labels[key] || key)}</dt><dd>${fmt(value)}</dd>`).join("")}</dl></section>`;
  };
  const compactLegend = (map, medical) => {
    let button = map.querySelector(".map-workspace-legend");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "map-workspace-legend";
      button.setAttribute("aria-label", "Открыть легенду карты");
      button.addEventListener("click", () => {
        if (medical) { facility = null; setInformation(true); }
        else { window.AtlasLegacyBridge.setMapPanel("right", true); document.querySelector(".mortality-map-side .map-legend")?.scrollIntoView({ block: "nearest" }); }
      });
      map.append(button);
    }
    const resource = window.AtlasLegacyBridge.getResourceState().infrastructure;
    const source = medical ? document.querySelector("#viz [data-resource-definition]") : document.querySelector("#viz .map-legend > b:nth-child(2)");
    const label = medical && !resource ? "Учреждения · зоны 20 / 60 минут" : source?.textContent?.replace(/^Цвет · /, "") || "Текущий показатель";
    const ramp = document.querySelector(medical ? "#viz .resource-legend > i" : "#viz .map-legend .legend-ramp");
    const colors = !medical ? [...document.querySelectorAll("#viz .map-legend .site-map-class-row > i")] : [];
    const swatches = medical && !resource ? '<i style="background:#ef718f"></i><i style="background:#f8b2c2"></i>'
      : colors.length ? colors.map(item => `<i style="background:${esc(getComputedStyle(item).backgroundColor)}"></i>`).join("")
      : ramp ? `<i style="background:${esc(getComputedStyle(ramp).background)}"></i>` : "";
    const markup = `<b>Легенда</b><span>${esc(label)}</span><span class="map-workspace-legend__colors" aria-hidden="true">${swatches}</span><small>Обозначения и сведения →</small>`;
    if (button.innerHTML !== markup) button.innerHTML = markup;
    const open = medical ? shell()?.classList.contains("has-map-information") : window.AtlasLegacyBridge.getMapChromeSummary().rightPanelOpen;
    button.hidden = Boolean(open);
  };
  const update = () => {
    frame = 0;
    const bridge = window.AtlasLegacyBridge;
    if (!bridge) return;
    const view = bridge.getSnapshot().view;
    const enabled = desktop() && ["map", "infrastructure"].includes(view);
    document.body.classList.toggle("map-workspace-desktop", enabled);
    if (filters) {
      const mapControlsReady = !filters.hidden && document.querySelector("#viz [data-react-map-chrome-ready]");
      const moveToDrawer = enabled && view === "map" && mapControlsReady;
      const target = moveToDrawer ? document.querySelector("#atlasDrawer .drawer-scroll") : home.parentElement;
      if (target && filters.parentElement !== target) {
        if (moveToDrawer) target.prepend(filters);
        else home.after(filters);
      }
    }
    if (!enabled) return;
    if (view === "map") {
      const map = document.querySelector("#viz .mortality-map");
      if (!map) return;
      if (!initializedMortality) {
        initializedMortality = true;
        bridge.setMapPanel("right", true);
      }
      const info = bridge.getMapChromeSummary();
      if (!wide() && info.leftPanelOpen && info.rightPanelOpen) bridge.setMapPanel("left", false);
      compactLegend(map, false);
    } else {
      const root = shell();
      if (!root) return;
      if (!initializedMedicalShells.has(root)) {
        initializedMedicalShells.add(root);
        setInformation(medicalInformationOpen, { focus: false });
      }
      const mode = bridge.getResourceState().infrastructure;
      if (lastMedicalMode !== mode) { facility = null; lastMedicalMode = mode; }
      if (window.AmurInfrastructureMap?.getSelection?.() != null) facility = null;
      root.classList.toggle("map-workspace-resources", mode);
      root.classList.toggle("has-facility-information", Boolean(facility));
      const panel = root.querySelector(".map-workspace-information");
      const open = root.classList.contains("has-map-information");
      if (open && !wide() && !root.classList.contains("is-panel-collapsed")) bridge.setInfrastructurePanel(false);
      if (panel) { panel.inert = !open; panel.setAttribute("aria-hidden", String(!open)); }
      const network = root.querySelector("[data-network-information]");
      if (network && (!mode || facility)) { const html = networkHtml(); if (network.innerHTML !== html) network.innerHTML = html; }
      const heading = root.querySelector(".map-workspace-information > header h3");
      const title = facility?.title || (mode ? "Показатель и территория" : "Сеть и доступность");
      if (heading && heading.textContent !== title) heading.textContent = title;
      const map = root.querySelector(".infra-map");
      if (map) compactLegend(map, true);
    }
  };
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  window.AmurMapWorkspace = { desktop, wide, setInformation, showFacility, clearFacility: () => { facility = null; schedule(); }, refresh: schedule };
  document.addEventListener("click", event => {
    if (event.target.closest("[data-medical-information-close]")) setInformation(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !desktop() || !shell()?.classList.contains("has-map-information") || document.querySelector(".method.is-open")) return;
    setInformation(false);
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener("atlas:legacy-state", schedule);
  window.addEventListener("atlas:react-ready", schedule);
  window.addEventListener("atlas:resource-options", schedule);
  window.addEventListener("atlas:workspace-panel", schedule);
  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(document.getElementById("viz"), { childList: true, subtree: true });
  schedule();
})();
