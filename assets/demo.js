(() => {
  "use strict";

  const element = id => document.getElementById(id);
  const data = JSON.parse(element("atlas-data").textContent);
  const navigation = element("vizNav");
  const tabs = [...navigation.querySelectorAll("[data-view]")];
  const panelButtons = [...document.querySelectorAll("[data-panel]")];
  const mobile = matchMedia("(max-width: 1023px)");
  const svgNamespace = "http://www.w3.org/2000/svg";
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
    drawer: !mobile.matches,
    information: !mobile.matches,
    settlements: false,
    territory: "region",
    settlement: null,
    mortalityYear: 2025,
    resourceYear: 2025,
    resource: data.indicators[1].id,
    comparisonPage: 0,
    zoom: 1
  };
  const districtNodes = new Map();
  const pointNodes = new Map();
  const comparisonPageSize = 7;

  function svg(tag, attributes = {}) {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function isMap() {
    return state.view === "map" || state.view === "infrastructure";
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

  for (const { id, path } of data.territories) {
    const district = svg("path", { d: path, class: "demo-district", "fill-rule": "evenodd" });
    district.dataset.territory = id;
    district.append(svg("title"));
    district.addEventListener("click", () => selectTerritory(id, true));
    element("districts").append(district);
    districtNodes.set(id, district);
  }

  for (const item of [...settlements].sort((a, b) => a.population - b.population)) {
    const radius = Math.min(9, 2.1 + 0.85 * Math.log10(Math.max(1, item.population)));
    const point = svg("circle", { cx: item.x, cy: item.y, r: radius, class: "demo-settlement" });
    point.dataset.settlement = item.id;
    const title = svg("title");
    title.textContent = item.name + " · " + display(item.population) + " чел.";
    point.append(title);
    point.addEventListener("click", () => selectTerritory(item.id, true));
    element("settlementPoints").append(point);
    pointNodes.set(item.id, point);
  }

  function renderPanels() {
    const drawerOpen = isMap() && state.drawer;
    const informationOpen = isMap() && state.information;
    element("atlasWorkspace").classList.toggle("drawer-collapsed", !drawerOpen);
    element("atlasDrawer").inert = !drawerOpen;
    element("mapInformation").hidden = !informationOpen;
    element("drawerRailToggle").disabled = !isMap();
    for (const button of panelButtons) {
      button.setAttribute("aria-expanded", button.dataset.panel === "atlasDrawer" ? drawerOpen : informationOpen);
    }
  }

  function setPanel(panel, open) {
    if (panel === "atlasDrawer") {
      state.drawer = open;
      if (open && mobile.matches) state.information = false;
    } else {
      state.information = open;
      if (open && mobile.matches) state.drawer = false;
    }
    renderPanels();
  }

  function selectTerritory(id, fromMap = false) {
    pointNodes.get(state.settlement)?.classList.remove("is-selected");
    const settlement = settlementById.get(id);
    if (settlement) {
      state.settlement = id;
      pointNodes.get(id).classList.add("is-selected");
    } else {
      state.settlement = null;
      state.territory = id;
    }
    renderTerritory();
    for (const button of element("comparison").querySelectorAll("[data-territory]")) {
      if (!settlement && button.dataset.territory === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    if (fromMap) {
      setPanel("mapInformation", true);
      if (mobile.matches) element("territoryDetails").focus({ preventScroll: true });
    }
  }

  function renderTerritory() {
    const indicator = metric();
    const period = year();
    const settlement = settlementById.get(state.settlement);
    const id = state.territory;
    const value = getValue(indicator, id, period);
    element("territory").value = state.settlement ?? id;
    element("outline").setAttribute("d", settlement ? "" : districtNodes.get(id)?.getAttribute("d") ?? "");
    const card = settlement ? {
      name: settlement.name,
      context: censusContext,
      value: settlement.population,
      unit: "чел.",
      label: "Численность населения"
    } : {
      name: names.get(id),
      context: String(period),
      value,
      unit: indicator.unit,
      label: indicator.label,
      footer: id === "region" ? null : { label: "По области", value: display(getValue(indicator, "region", period)) }
    };
    element("territoryDetails").innerHTML = territoryCard.render(card);
    element("annualSeries").hidden = Boolean(settlement);
    element("medicalComparison").hidden = state.view !== "infrastructure" || Boolean(settlement);
    if (settlement) return;
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
    element("settlementPoints").toggleAttribute("hidden", !state.settlements);
    element("populationLegend").hidden = !state.settlements;
    element("showSettlements").checked = state.settlements;
    if (state.settlements) element("territory").append(settlementOptions);
    else settlementOptions.remove();
  }

  function renderZoom() {
    const bounds = districtNodes.get(state.territory)?.getBBox();
    const settlement = settlementById.get(state.settlement);
    const width = 660 / state.zoom;
    const height = 600 / state.zoom;
    const centerX = settlement?.x ?? (bounds ? bounds.x + bounds.width / 2 : 330);
    const centerY = settlement?.y ?? (bounds ? bounds.y + bounds.height / 2 : 300);
    const x = Math.min(660 - width, Math.max(0, centerX - width / 2));
    const y = Math.min(600 - height, Math.max(0, centerY - height / 2));
    element("map").setAttribute("viewBox", [x, y, width, height].join(" "));
    element("zoomIn").disabled = state.zoom === 3;
    element("zoomOut").disabled = state.zoom === 1;
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
      if (row.id === state.territory) button.setAttribute("aria-current", "true");
      label.textContent = row.name;
      number.textContent = display(row.value);
      button.append(label, number);
      button.addEventListener("click", () => selectTerritory(row.id));
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
    for (const [id, district] of districtNodes) {
      const value = getValue(indicator, id, period);
      const bin = indicator.breaks.findIndex(limit => value <= limit);
      if (value !== null) coverage += 1;
      district.style.fill = value === null ? missing : palette[bin < 0 ? palette.length - 1 : bin];
      district.firstElementChild.textContent = names.get(id) + " · " + display(value);
    }
    element("mapTitle").textContent = indicator.label;
    element("mapUnit").textContent = "Данные сборника · " + period + " · " + indicator.unit + " · " + coverage + " из " + municipalities.length + " МО";
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
    element("chartTitle").textContent = current.title;
    const contentTitle = isMap() ? "mapTitle" : "chartTitle";
    element("mapStage").closest(".content").setAttribute("aria-labelledby", contentTitle);
    element("drawerTitle").textContent = state.view === "map" ? "Интерактивная карта смертности" : "Медицинские ресурсы по МО";
    renderPanels();
    if (mobile.matches) current.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (isMap()) {
      renderSettlements();
      renderMetric();
      renderZoom();
    } else {
      window.atlasOns.show(state.view);
    }
  }

  function syncView() {
    const requested = location.hash.slice(1);
    state.view = tabs.some(tab => tab.dataset.view === requested) ? requested : "map";
    state.comparisonPage = 0;
    if (mobile.matches) {
      state.drawer = false;
      state.information = false;
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
    state.settlements = event.target.checked;
    if (!state.settlements && state.settlement) selectTerritory(state.territory);
    renderSettlements();
  });
  element("territory").addEventListener("change", event => {
    selectTerritory(event.target.value, true);
    renderZoom();
  });
  element("resetMap").addEventListener("click", () => {
    selectTerritory("region");
    state.zoom = 1;
    renderZoom();
  });
  element("zoomIn").addEventListener("click", () => {
    state.zoom = Math.min(3, state.zoom * 1.5);
    renderZoom();
  });
  element("zoomOut").addEventListener("click", () => {
    state.zoom = Math.max(1, state.zoom / 1.5);
    renderZoom();
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
    state.drawer = !mobile.matches;
    state.information = !mobile.matches;
    renderPanels();
    renderPagination();
  });
  window.addEventListener("hashchange", syncView);
  syncView();
})();
