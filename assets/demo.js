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
  const settlements = window.atlasAmurMapData.settlements.features.map(({ properties }) => ({
    id: properties.key, name: properties.name, population: properties.population2021
  }));
  const settlementById = new Map(settlements.map(item => [item.id, item]));
  const indicators = {
    map: data.indicators.filter(item => item.id === "deaths_rate" || item.view === "map"),
    infrastructure: data.indicators.filter(item => item.id !== "deaths_rate" && item.view !== "map")
  };
  const state = {
    view: "map",
    comparisonPage: 0
  };
  const mapStates = Object.fromEntries(Object.keys(indicators).map(view => [view, {
    drawer: !mobile.matches, information: false, settlements: false, selected: "region",
    year: 2025, indicator: indicators[view][0].id, labels: "auto",
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
    return currentMapState().year;
  }

  function metric() {
    return indicators[state.view].find(indicator => indicator.id === currentMapState().indicator);
  }

  function getValue(indicator, id, period) {
    return indicator.values[id]?.[years.indexOf(period)] ?? null;
  }

  function addOption(select, value, label) {
    select.append(new Option(label, value));
  }

  addOption(element("territory"), "region", names.get("region"));
  const municipalityOptions = document.createElement("optgroup");
  municipalityOptions.label = "Муниципальные образования";
  for (const { id, name } of municipalities) addOption(municipalityOptions, id, name);
  element("territory").append(municipalityOptions);

  const settlementOptions = document.createElement("optgroup");
  settlementOptions.label = "Населённые пункты";
  for (const item of [...settlements].sort((a, b) => a.name.localeCompare(b.name, "ru"))) {
    const count = item.population == null ? "нет данных о населении" : display(item.population) + " чел.";
    addOption(settlementOptions, item.id, item.name + " · " + count);
  }
  const populationClasses = window.AmurDemoMapSymbols.classes;
  const missingPopulation = { label: "Нет данных", diameter: 6, missing: true };
  for (const { diameter, ring, label, missing } of [...populationClasses, missingPopulation]) {
    const entry = document.createElement("li");
    const symbol = document.createElement("i");
    symbol.style.setProperty("--symbol-size", Math.round(diameter / 2) + "px");
    symbol.style.setProperty("--symbol-ring", ring ? Math.round(ring / 2) + "px" : "1px");
    symbol.classList.toggle("is-ring", Boolean(ring));
    symbol.classList.toggle("is-missing", Boolean(missing));
    symbol.setAttribute("aria-hidden", "true");
    entry.append(symbol, document.createTextNode(label));
    element("populationClasses").append(entry);
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
        medical: view === "infrastructure",
        isActive: () => state.view === view,
        hideCard: () => !mobile.matches || mapStates[view].information || mapStates[view].drawer,
        items: selectableItems,
        card: territoryCardData,
        select: selectTerritory,
        openInformation: () => setPanel("mapInformation", true),
        escape: () => {
          const current = currentMapState();
          if (mobile.matches && current.information) setPanel("mapInformation", false);
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
    const { colours, selected, settlements, labels } = currentMapState();
    currentMap()?.update({ colours, selected, settlements, labels }, options);
  }

  function renderPanels() {
    const current = currentMapState();
    if (mobile.matches && current?.drawer && current.information) current.drawer = false;
    const drawerOpen = current ? current.drawer : analysisDrawer;
    const informationOpen = Boolean(current && (!mobile.matches || current.information));
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
      if (open && mobile.matches) current.information = false;
    } else {
      if (!mobile.matches) return;
      current.information = open;
      if (open) {
        current.informationTrigger = document.activeElement;
        current.drawer = false;
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
    const card = territoryCardData(id);
    element("territoryDetails").innerHTML = territoryCard.render(card);
    element("mapMobileValue").textContent = display(card.value);
    element("mapMobileValue").closest("button").setAttribute("aria-label",
      "Статистика. " + card.name + " · " + display(card.value) + (card.value == null ? "" : " " + card.unit));
    element("annualSeries").hidden = isSettlement;
    element("medicalComparison").hidden = isSettlement;
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
    element("mapLabels").value = currentMapState().labels;
    if (show) element("territory").append(settlementOptions);
    else settlementOptions.remove();
  }

  function renderComparison(indicator, period) {
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
    element("indicator").value = indicator.id;
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
    element("mapUnit").textContent = period + " · " + indicator.unit + " · " + coverage + " из " + municipalities.length + " МО";
    element("legendUnit").textContent = indicator.unit;
    element("metricSource").textContent = "Сборник «Здоровье и здравоохранение Амурской области», стр. " + indicator.page + ".";
    element("metricNote").textContent = indicator.note ?? "";
    element("metricNote").hidden = !indicator.note;
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
    renderComparison(indicator, period);
    updateMap();
  }

  function renderView() {
    const current = tabs.find(tab => tab.dataset.view === state.view);
    const geography = current.closest("[data-geography]");
    document.body.dataset.shellView = state.view;
    document.title = current.title + " · " + geography.querySelector(".demo-nav-group__title").textContent + " · Атлас";
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
      const select = element("indicator");
      select.replaceChildren();
      for (const indicator of indicators[state.view]) addOption(select, indicator.id, indicator.label);
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
    currentMapState().year = Number(event.target.dataset.year);
    state.comparisonPage = 0;
    renderMetric();
  });
  element("indicator").addEventListener("change", event => {
    const current = currentMapState();
    current.indicator = event.target.value;
    const supported = metric().years;
    if (!supported.includes(current.year)) current.year = supported.at(-1);
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
  element("mapLabels").addEventListener("change", event => {
    currentMapState().labels = event.target.value;
    updateMap();
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
  window.addEventListener("hashchange", syncView);
  syncView();
})();
