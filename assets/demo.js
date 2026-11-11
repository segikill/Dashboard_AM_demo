(() => {
  "use strict";

  const element = id => document.getElementById(id);
  const data = JSON.parse(element("atlas-data").textContent);
  const navigation = element("vizNav");
  const tabs = [...navigation.querySelectorAll("[data-view]")];
  const panelButtons = [...document.querySelectorAll("[data-panel]")];
  const mobile = matchMedia("(max-width: 1023px)");
  const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const display = value => value == null ? "Нет данных" : format.format(value);
  const years = [2023, 2024, 2025];
  const palette = ["#deedf1", "#b4d7df", "#79b0bf", "#44869b", "#1e5975"];
  const missing = "#e4e7e9";
  const censusContext = "ВПН-2020 · 1 октября 2021 года";
  const territoryCard = window.AmurTerritoryCard;
  const municipalities = [...data.territories].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const names = new Map([["region", "Амурская область"], ...municipalities.map(({ id, name }) => [id, name])]);
  const settlements = data.settlements.map((item, index) => ({ ...item, id: "s" + index }));
  const settlementById = new Map(settlements.map(item => [item.id, item]));
  const state = {
    view: "map",
    mortalityYear: 2025,
    resourceYear: 2025,
    resource: data.indicators[1].id,
    comparisonPage: 0
  };
  const mapStates = Object.fromEntries(["map", "infrastructure"].map(view => [view, {
    drawer: !mobile.matches, information: false, settlements: false, selected: "region",
    colours: new Map(), search: "", informationTrigger: null
  }]));
  const maps = {};
  let analysisDrawer = !mobile.matches;
  const comparisonPageSize = 7;
  const currentMapState = () => mapStates[state.view];
  const currentMap = () => maps[state.view];

  function isMap() {
    return Boolean(currentMapState());
  }

  function year() {
    return state.view === "map" ? state.mortalityYear : state.resourceYear;
  }

  function metric() {
    if (state.view === "map") return data.indicators[0];
    return data.indicators.find(indicator => indicator.id === state.resource);
  }

  function getValue(indicator, id, period) {
    return indicator.values[id]?.[years.indexOf(period)] ?? null;
  }

  function addOption(select, value, label) {
    select.append(new Option(label, value));
  }

  for (const indicator of data.indicators.slice(1)) {
    addOption(element("indicator"), indicator.id, indicator.label);
  }
  addOption(element("territory"), "region", names.get("region"));
  const municipalityOptions = document.createElement("optgroup");
  municipalityOptions.label = "Муниципальные образования";
  for (const { id, name } of municipalities) addOption(municipalityOptions, id, name);
  element("territory").append(municipalityOptions);

  const settlementOptions = document.createElement("optgroup");
  settlementOptions.label = "Населённые пункты";
  for (const item of [...settlements].sort((a, b) => a.name.localeCompare(b.name, "ru"))) {
    addOption(settlementOptions, item.id, item.name + " · " + display(item.population) + " чел.");
  }

  function selectableItems() {
    return currentMapState().settlements ? [...municipalities, ...settlements] : municipalities;
  }

  function mapContainer(view) {
    return element(view === "map" ? "mortalityMap" : "medicalMap");
  }

  function activateMap() {
    const view = state.view;
    element("mortalityMap").hidden = view !== "map";
    element("medicalMap").hidden = view !== "infrastructure";
    element("mapError").hidden = true;
    if (currentMap()) return;
    try {
      maps[view] = window.atlasDemoMap.create(mapContainer(view), {
        isActive: () => state.view === view,
        hideCard: () => mapStates[view].information || (mobile.matches && mapStates[view].drawer),
        items: selectableItems,
        card: territoryCardData,
        select: selectTerritory,
        openInformation: () => setPanel("mapInformation", true),
        escape: () => {
          const current = currentMapState();
          if (current.information) setPanel("mapInformation", false);
          else if (mobile.matches && current.drawer) setPanel("atlasDrawer", false);
          else return false;
          return true;
        }
      });
    } catch (error) {
      element("mapError").textContent = "Не удалось открыть карту. Сведения доступны через список территорий.";
      element("mapError").hidden = false;
      console.warn("Map unavailable:", error);
    }
  }

  function updateMap(options) {
    const { colours, selected, settlements } = currentMapState();
    currentMap()?.update({ colours, selected, settlements }, options);
  }

  function hasRoomForBothPanels() {
    return innerWidth - (document.querySelector(".viz-rail").getBoundingClientRect().width || 80) >= 1380 &&
      !mobile.matches;
  }

  function renderPanels() {
    const current = currentMapState();
    if (current?.drawer && current.information && !hasRoomForBothPanels()) current.drawer = false;
    const drawerOpen = current ? current.drawer : analysisDrawer;
    const informationOpen = Boolean(current?.information);
    element("atlasWorkspace").classList.toggle("drawer-collapsed", !drawerOpen);
    element("atlasDrawer").inert = !drawerOpen;
    element("mapInformation").hidden = !informationOpen;
    element("mapInformation").inert = !informationOpen;
    element("mapLegend").hidden = informationOpen;
    for (const button of panelButtons) {
      button.setAttribute("aria-expanded", button.dataset.panel === "atlasDrawer" ? drawerOpen : informationOpen);
    }
  }

  function setPanel(panel, open) {
    const current = currentMapState();
    if (!current) {
      if (panel !== "atlasDrawer") return;
      analysisDrawer = open;
      renderPanels();
      const focus = open && mobile.matches ? element("onsFilters").querySelector("select") :
        !open ? element("analysisHeading").querySelector('[data-panel="atlasDrawer"]') : null;
      focus?.focus({ preventScroll: true });
      return;
    }
    if (panel === "atlasDrawer") {
      current.drawer = open;
      if (open && !hasRoomForBothPanels()) current.information = false;
    } else {
      current.information = open;
      if (open) {
        current.informationTrigger = document.activeElement;
        if (!hasRoomForBothPanels()) current.drawer = false;
      }
    }
    renderPanels();
    currentMap()?.resize();
    updateMap();
    if (panel === "mapInformation") {
      const trigger = current.informationTrigger;
      const fallback = element("mapStage").querySelector('.map-workspace-toolbar [data-panel="mapInformation"]');
      const target = open ? element("mapInformationTitle") :
        trigger !== document.body && trigger?.getClientRects().length ? trigger : fallback;
      target?.focus({ preventScroll: true });
    } else if (!open && mobile.matches) {
      element("drawerRailToggle").focus({ preventScroll: true });
    }
  }

  function selectTerritory(id, { fly = false, focus = false } = {}) {
    const current = currentMapState();
    if (!current || !names.has(id) && (!current.settlements || !settlementById.has(id))) return;
    current.selected = id;
    if (fly && mobile.matches && current.drawer) setPanel("atlasDrawer", false);
    renderTerritory();
    for (const button of element("comparison").querySelectorAll("[data-territory]")) {
      if (button.dataset.territory === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    updateMap({ focus });
    if (fly) currentMap()?.focusFeature(id);
  }

  function territoryCardData(id) {
    const indicator = metric();
    const period = year();
    const settlement = settlementById.get(id);
    return settlement ? {
      name: settlement.name,
      context: censusContext,
      value: settlement.population,
      unit: "чел.",
      label: "Численность населения"
    } : {
      name: names.get(id),
      context: String(period),
      value: getValue(indicator, id, period),
      unit: indicator.unit,
      label: indicator.label,
      footer: id === "region" ? null : { label: "По области", value: display(getValue(indicator, "region", period)) }
    };
  }

  function renderTerritory() {
    const indicator = metric();
    const period = year();
    const id = currentMapState().selected;
    const isSettlement = settlementById.has(id);
    element("territory").value = id;
    element("territoryDetails").innerHTML = territoryCard.render(territoryCardData(id));
    element("annualSeries").hidden = isSettlement;
    element("medicalComparison").hidden = state.view !== "infrastructure" || isSettlement;
    if (isSettlement) return;
    element("series").replaceChildren(...years.map(item => {
      const cell = document.createElement("div");
      cell.classList.toggle("is-current", item === period);
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = item;
      description.textContent = display(getValue(indicator, id, item));
      cell.append(term, description);
      return cell;
    }));
  }

  function renderSettlements() {
    const show = currentMapState().settlements;
    element("populationLegend").hidden = !show;
    element("showSettlements").checked = show;
    if (show) element("territory").append(settlementOptions);
    else settlementOptions.remove();
  }

  function renderMedicalComparison(indicator, period) {
    if (state.view !== "infrastructure") return;
    const rows = municipalities.map(({ id, name }) => ({ id, name, value: getValue(indicator, id, period) }));
    rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    element("comparison").replaceChildren(...rows.map(row => {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      const label = document.createElement("span");
      const number = document.createElement("strong");
      button.type = "button";
      button.dataset.territory = row.id;
      if (row.id === currentMapState().selected) button.setAttribute("aria-current", "true");
      label.textContent = row.name;
      number.textContent = display(row.value);
      button.append(label, number);
      button.addEventListener("click", () => selectTerritory(row.id, { fly: true }));
      listItem.append(button);
      return listItem;
    }));
    renderPagination();
  }

  function renderPagination() {
    const rows = [...element("comparison").children];
    const pageCount = Math.ceil(rows.length / comparisonPageSize);
    rows.forEach((row, index) => {
      row.hidden = mobile.matches && Math.floor(index / comparisonPageSize) !== state.comparisonPage;
    });
    element("pageCount").textContent = (state.comparisonPage + 1) + " из " + pageCount;
    element("previous").disabled = state.comparisonPage === 0;
    element("next").disabled = state.comparisonPage + 1 >= pageCount;
  }

  function renderMetric() {
    const indicator = metric();
    const period = year();
    const focusYear = document.activeElement?.dataset.year != null;
    element("indicatorField").hidden = state.view === "map";
    element("indicator").value = state.resource;
    element("years").style.gridTemplateColumns = "repeat(" + indicator.years.length + ", minmax(0, 1fr))";
    element("years").replaceChildren(...indicator.years.map(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.year = item;
      button.textContent = item;
      button.setAttribute("aria-pressed", item === period);
      return button;
    }));
    if (focusYear) element("years").querySelector('[aria-pressed="true"]')?.focus();

    let coverage = 0;
    const colours = new Map();
    for (const { id } of municipalities) {
      const value = getValue(indicator, id, period);
      const bin = indicator.breaks.findIndex(limit => value <= limit);
      if (value !== null) coverage += 1;
      colours.set(id, value === null ? missing : palette[bin < 0 ? palette.length - 1 : bin]);
    }
    currentMapState().colours = colours;
    element("mapTitle").textContent = indicator.label;
    element("mapUnit").textContent = "Амурская область · " + period + " · " + indicator.unit + " · " + coverage + " из " + municipalities.length + " МО";
    element("legendUnit").textContent = indicator.unit;
    element("metricSource").textContent = "Сборник «Здоровье и здравоохранение Амурской области», стр. " + indicator.page + ".";
    const limits = indicator.breaks.map((limit, index) =>
      index === 0 ? "≤ " + display(limit) : "> " + display(indicator.breaks[index - 1]) + " – " + display(limit)
    );
    limits.push("> " + display(indicator.breaks.at(-1)), "Нет данных");
    element("legend").replaceChildren(...limits.map((label, index) => {
      const entry = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.style.background = palette[index] ?? missing;
      entry.append(swatch, label);
      return entry;
    }));
    renderTerritory();
    renderMedicalComparison(indicator, period);
    updateMap();
  }

  function renderView() {
    const current = tabs.find(tab => tab.dataset.view === state.view);
    document.body.dataset.shellView = state.view;
    for (const tab of tabs) {
      tab.classList.toggle("active", tab === current);
      tab.setAttribute("aria-pressed", tab === current);
    }
    element("mapStage").hidden = !isMap();
    element("analysisHeading").hidden = isMap();
    element("onsStage").hidden = isMap();
    element("onsFilters").hidden = isMap();
    element("localControls").hidden = !isMap();
    element("chartTitle").textContent = current.title;
    const contentTitle = isMap() ? "mapTitle" : "chartTitle";
    element("mapStage").closest(".content").setAttribute("aria-labelledby", contentTitle);
    element("drawerTitle").textContent = state.view === "infrastructure" ? "Медицинские ресурсы по МО" : current.title;
    renderPanels();
    if (mobile.matches) current.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (isMap()) {
      activateMap();
      element("mapSearchInput").value = currentMapState().search;
      element("mapSearchMessage").textContent = "";
      renderSettlements();
      renderMetric();
      currentMap()?.resize();
    } else {
      window.atlasOns.show(state.view);
    }
  }

  function syncView() {
    const requested = location.hash.slice(1);
    const next = tabs.some(tab => tab.dataset.view === requested) ? requested : "map";
    if (next !== state.view) {
      currentMap()?.deactivate();
      window.atlasOns.closeDetails();
      state.view = next;
      state.comparisonPage = 0;
    }
    renderView();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => { location.hash = tab.dataset.view; });
  }
  navigation.addEventListener("keydown", event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const offset = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    const next = event.key === "Home" ? tabs[0] :
      event.key === "End" ? tabs.at(-1) :
      offset ? tabs[(index + offset + tabs.length) % tabs.length] : null;
    if (next) {
      event.preventDefault();
      next.focus();
    }
  });
  for (const button of panelButtons) {
    button.addEventListener("click", () => {
      setPanel(button.dataset.panel, button.getAttribute("aria-expanded") !== "true");
    });
  }
  element("years").addEventListener("click", event => {
    if (!event.target.dataset.year) return;
    if (state.view === "map") state.mortalityYear = Number(event.target.dataset.year);
    else state.resourceYear = Number(event.target.dataset.year);
    state.comparisonPage = 0;
    renderMetric();
  });
  element("indicator").addEventListener("change", event => {
    state.resource = event.target.value;
    const supported = metric().years;
    if (!supported.includes(state.resourceYear)) state.resourceYear = supported.at(-1);
    state.comparisonPage = 0;
    renderMetric();
  });
  element("showSettlements").addEventListener("change", event => {
    const current = currentMapState();
    current.settlements = event.target.checked;
    renderSettlements();
    if (!current.settlements && settlementById.has(current.selected)) selectTerritory("region");
    else updateMap();
  });
  element("territory").addEventListener("change", event => {
    selectTerritory(event.target.value, { fly: true, focus: true });
  });
  element("resetMap").addEventListener("click", () => currentMap()?.fitRegion());

  const normalizeSearch = value => value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ");
  const searchInput = element("mapSearchInput");
  const searchMessage = element("mapSearchMessage");
  searchInput.addEventListener("input", () => {
    currentMapState().search = searchInput.value;
    searchMessage.textContent = "";
  });
  element("mapSearch").addEventListener("submit", event => {
    event.preventDefault();
    const query = normalizeSearch(searchInput.value);
    if (!query) return;
    const items = selectableItems();
    const exact = items.filter(item => normalizeSearch(item.name) === query);
    const matches = exact.length ? exact : items.filter(item => normalizeSearch(item.name).includes(query));
    if (matches.length !== 1) {
      searchMessage.textContent = matches.length ? "Уточните название территории. Найдено несколько совпадений." : "Территория не найдена.";
      return;
    }
    const [item] = matches;
    currentMapState().search = item.name;
    searchInput.value = item.name;
    searchMessage.textContent = "";
    selectTerritory(item.id, { fly: true, focus: true });
  });
  element("previous").addEventListener("click", () => {
    state.comparisonPage -= 1;
    renderPagination();
  });
  element("next").addEventListener("click", () => {
    state.comparisonPage += 1;
    renderPagination();
  });
  mobile.addEventListener("change", () => {
    renderPanels();
    if (isMap()) updateMap();
    renderPagination();
  });
  document.addEventListener("keydown", event => {
    if (!isMap() && analysisDrawer && event.key === "Escape" && !element("onsDetailsDialog").open) {
      setPanel("atlasDrawer", false);
    }
  });
  window.addEventListener("resize", () => {
    const current = currentMapState();
    if (current?.drawer && current.information && !hasRoomForBothPanels()) renderPanels();
  });
  window.addEventListener("hashchange", syncView);
  syncView();
})();
