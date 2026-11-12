(function installAtlasLegacyBridge() {
  "use strict";

  if (window.AtlasLegacyBridge) return;

  const listeners = new Set();
  const getResourceState = () => ({ indicator: String(state.resourceIndicator || "doctors_rate"),
    year: [2023,2024,2025].includes(Number(state.resourceYear)) ? Number(state.resourceYear) : 2025,
    selectedId: DATA.municipalities.some(t => t.id === Number(state.resourceSelected)) ? Number(state.resourceSelected) : null,
    infrastructure: state.infraResources === "on", comparison: state.dotDataset === "resources", threeYears: state.resourceLayout === "years" });
  const resourceActive = () => state.view === "infrastructure" && getResourceState().infrastructure || state.view === "dotogram" && getResourceState().comparison;
  const setResourceOption = (option, value) => {
    if (option === "indicator" && ["fap_count","doctors_rate","nurses_rate","cardiologist_rate","neurologist_rate","ambulance_doctor_rate","doctors_persons_pct","visits_person","beds_24h_count","beds_24h_rate","therapist_rate","endocrinologist_rate","surgeon_rate","traumatologist_rate","anesthetist_rate","ophthalmologist_rate","ent_rate","dermatologist_rate","infectiologist_rate","psychiatrist_rate","pediatrician_rate","obgyn_rate","doctors_positions_pct","doctors_multiple","nurses_positions_pct","nurses_persons_pct","nurses_multiple","fap_visits_mean","visits_illness","visits_preventive","visits_dental","visits_doctor_position","therapist_load","cardiologist_load","endocrinologist_load","infectiologist_load","pediatrician_load","neurologist_load","surgeon_load","traumatologist_load","obgyn_load","ophthalmologist_load","ent_load","phthisiatrist_load","beds_day_rate","occupancy_24h","occupancy_day","stay_24h","stay_day","turnover_24h","turnover_day","hospitalization_rate","hospital_fatality_pct","xray_rate","fluorography_rate","ultrasound_rate","endoscopy_rate","functional_rate","xray_per100visits","functional_per100visits","physiotherapy_per100visits","lab_per100visits"].includes(String(value))) state.resourceIndicator = String(value);
    else if (option === "year" && [2023,2024,2025].includes(Number(value))) state.resourceYear = String(value);
    else if (option === "layout" && (value === "rank" || value === "years")) state.resourceLayout = value;
    else if (option === "selectedId" && String(value) === "region") state.resourceSelected = "";
    else if (option === "selectedId" && DATA.municipalities.some(t => t.id === Number(value))) state.resourceSelected = String(value);
    else if (option === "infrastructure") {
      const selected = window.AmurInfrastructureMap?.getSelection?.();
      if (selected != null) state.resourceSelected = String(selected);
      state.infraResources = value ? "on" : "off";
    }
    else if (option === "comparison") { state.dotDataset = value ? "resources" : "mortality"; if (state.view === "dotogram") render(); else emit(); return; }
    else return;
    headerSummaryKey = "";
    emit();
    window.dispatchEvent(new Event("atlas:resource-options"));
  };
  const dataSummary = Object.freeze({
    regionKey: String(DATA.regionKey),
    populationYear: Number(DATA.populationYear),
    regionName: String(DATA.regionName),
    period: String(DATA.period),
    records: DATA.records.length,
    years: Object.freeze([...DATA.years]),
    defaultYear: DEFAULT_YEAR,
    classes: DATA.classes.length,
    blocks: DATA.blocks.length,
    codes: DATA.codes.length,
    municipalities: DATA.municipalities.length,
    settlements: DATA.settlements.length
  });
  const snapshot = () => Object.freeze({
    view: String(state.view),
    year: String(state.year),
    sex: String(state.sex),
    age: String(state.age)
  });
  let currentSnapshot = snapshot();
  let actionMessage = "";
  let filteredCountKey = "";
  let filteredCount = 0;
  let headerSummaryKey = "";
  let headerSummary;
  let mapChromeSummaryKey = "";
  let mapChromeSummary;
  let fallbackMortalitySelection = null;
  const contextMunicipalities = Object.freeze(DATA.municipalities.map(item => Object.freeze({
    id: item.id, name: item.name, sourceId: item.sourceId
  })));
  const getMunicipalContextSummary = () => {
    const selected = document.querySelector("#viz .mortality-map-shell")
      ? window.AmurMortalityMap?.getSelection?.()
      : fallbackMortalitySelection;
    const matchingUnit = selected?.kind === (state.mapUnit === "mo" ? "mo" : "settlement");
    const settlement = matchingUnit && selected.kind === "settlement"
      ? DATA.settlements.find(item => item.id === selected.id) : null;
    const municipality = matchingUnit && selected.kind === "mo"
      ? DATA.municipalities.find(item => item.id === selected.id)
      : settlement ? DATA.municipalities[settlement.municipalityIndex] : null;
    return { selectedSiteId: municipality?.id ?? null, settlementName: settlement?.name ?? null,
      municipalities: contextMunicipalities };
  };
  let infrastructureChromeSummaryKey = "";
  let infrastructureChromeSummary;
  let navigationSummaryKey = "";
  let navigationSummary;
  let treemapSummaryKey = "";
  let treemapSummary;
  let heatmapSummaryKey = "";
  let heatmapSummary;
  let rankSummaryKey = "";
  let rankSummary;
  let pyramidSummaryKey = "";
  let pyramidSummary;
  let plotSummaryKey = "";
  let plotSummary;
  let dotogramSummaryKey = "";
  let dotogramSummary;

  const emit = () => {
    document.body.classList.toggle("medical-comparison", state.view === "dotogram" && getResourceState().comparison);
    currentSnapshot = snapshot();
    listeners.forEach((listener) => listener());
    window.dispatchEvent(new CustomEvent("atlas:legacy-state", { detail: currentSnapshot }));
  };

  const originalRender = render;
  render = function reactCompatibleRender() {
    const result = originalRender.apply(this, arguments);
    queueMicrotask(emit);
    return result;
  };

  const setGlobalFilters = () => {}; // Fixed demo slice: 2025, both sexes, all ages.

  const validViews = new Set([
    "map",
    "infrastructure",
    "treemap",
    "heatmap",
    "arrow",
    "pyramid",
    "plot",
    "dotogram"
  ]);

  const setView = (view) => {
    const nextView = String(view);
    if (nextView === "plot" || !validViews.has(nextView) || nextView === String(state.view)) return;
    state.view = nextView;
    render();
  };

  // The header describes the slices on screen, including comparisons that suspend
  // one global filter. Keep the user's saved filters intact when changing modes.
  const headerScope = () => {
    const filters = { year: state.year, sex: state.sex, age: state.age };
    let years = null;
    if (state.view === "pyramid") {
      filters.sex = "all";
      filters.age = "all";
      if (state.pyramidView === "trend") years = [DATA.years[0], DATA.years.at(-1)];
    } else if (state.view === "arrow") {
      if (state.rankView === "trend") years = [...DATA.years];
      else if (state.rankCompare === "time") years = [DATA.years[0], DATA.years.at(-1)];
      else filters.sex = "all";
    } else if (state.view === "plot" && state.plotView === "compare") {
      if (state.plotCompare === "time") years = [...new Set([Number(state.plotYearA), Number(state.plotYearB)])];
      else filters.sex = "all";
    }
    const period = years
      ? years.length === DATA.years.length && years.every((year, index) => year === DATA.years[index])
        ? String(DATA.period) : years.join(" → ")
      : state.year === "all" ? String(DATA.period) : String(state.year);
    return { filters, years, period };
  };
  const getFilteredCount = (scope) => {
    const key = JSON.stringify(scope);
    if (key !== filteredCountKey) {
      filteredCountKey = key;
      filteredCount = ANALYTICS_CORE.filterRecords(DATA.records, scope.filters, scope.years ? { years: scope.years } : {}).length;
    }
    return filteredCount;
  };

  const getHeaderSummary = () => {
    const svgButton = document.querySelector('[data-legacy-header-actions] [data-atlas-action="svg"]');
    const svgAvailable = Boolean(svgButton && !svgButton.disabled);
    const csvAvailable = !resourceActive();
    const scope = headerScope();
    const key = `${JSON.stringify(scope)}|${state.view}|${svgAvailable}|${csvAvailable}|${getResourceState().year}|${actionMessage}`;
    if (key !== headerSummaryKey || !headerSummary) {
      headerSummaryKey = key;
      headerSummary = Object.freeze({
        periodLabel: resourceActive() ? `ресурсы ${getResourceState().year}` : state.view === "infrastructure" ? "Сеть и доступность" : scope.period,
        scope: resourceActive() ? "resources" : state.view === "infrastructure" ? "network" : "mortality",
        filteredRecords: getFilteredCount(scope),
        svgAvailable,
        csvAvailable,
        actionMessage
      });
    }
    return headerSummary;
  };

  const triggerHeaderAction = action => { if (action === "help") document.getElementById("atlasHelpToggle")?.click(); };

  const isCompactInspector = () => window.innerWidth <= 1540;
  const getMapChromeSummary = () => {
    const workspace = document.getElementById("atlasWorkspace");
    const compactInspector = isCompactInspector();
    const leftPanelOpen = !workspace?.classList.contains("drawer-collapsed");
    const rightPanelOpen = window.AmurMapWorkspace?.desktop()
      ? !document.body.classList.contains("shell-inspector-collapsed")
      : compactInspector ? document.body.classList.contains("shell-inspector-open")
      : !document.body.classList.contains("shell-inspector-collapsed");
    const mapMounted = Boolean(window.AmurMortalityMap?.debug?.().mounted);
    const selectedObject = window.AmurMortalityMap?.getSelection?.();
    const selectedLabel = selectedObject
      ? (selectedObject.kind === "mo" ? DATA.municipalities : DATA.settlements).find(item => item.id === selectedObject.id)?.name || ""
      : document.querySelector(".mortality-map-side .site-map-selection-card:not([hidden]) > b")?.textContent?.trim() || "";
    const key = [state.view, leftPanelOpen, rightPanelOpen, compactInspector, mapMounted, selectedLabel].join("|");
    if (key !== mapChromeSummaryKey || !mapChromeSummary) {
      mapChromeSummaryKey = key;
      mapChromeSummary = Object.freeze({
        active: state.view === "map",
        leftPanelOpen,
        rightPanelOpen,
        compactInspector,
        mapMounted,
        selectedLabel
      });
    }
    return mapChromeSummary;
  };

  const scheduleMapResize = () => {
    window.AmurMortalityMap?.resize?.();
    window.setTimeout(() => window.AmurMortalityMap?.resize?.(), 230);
  };

  const setMapPanel = (panel, open) => {
    if (state.view !== "map") return;
    const nextOpen = Boolean(open);
    if (window.AmurMapWorkspace?.desktop() && nextOpen && !window.AmurMapWorkspace.wide()) {
      if (panel === "right") setMapPanel("left", false);
      else if (panel === "left") setMapPanel("right", false);
    }
    if (panel === "left") {
      const workspace = document.getElementById("atlasWorkspace");
      const currentOpen = !workspace?.classList.contains("drawer-collapsed");
      if (currentOpen !== nextOpen) document.getElementById("drawerRailToggle")?.click();
    } else if (panel === "right") {
      if (window.AmurMapWorkspace?.desktop()) {
        document.body.classList.toggle("shell-inspector-collapsed", !nextOpen);
        document.body.classList.toggle("shell-inspector-open", nextOpen);
      } else if (isCompactInspector()) {
        document.body.classList.toggle("shell-inspector-open", nextOpen);
      } else {
        document.body.classList.toggle("shell-inspector-collapsed", !nextOpen);
      }
    } else {
      return;
    }
    mapChromeSummaryKey = "";
    scheduleMapResize();
    queueMicrotask(emit);
  };

  const triggerMapAction = (action) => {
    if (state.view !== "map") return;
    if (action === "details") window.AmurMortalityMap?.openDetails();
    else if (action === "fit") document.querySelector("[data-mortality-fit]")?.click();
  };

  const getInfrastructureChromeSummary = () => {
    const shell = document.querySelector(".infra-shell");
    const panelOpen = Boolean(shell && !shell.classList.contains("is-panel-collapsed"));
    const mapMounted = Boolean(window.AmurInfrastructureMap?.debug?.().mounted);
    const informationOpen = Boolean(shell?.classList.contains("has-map-information"));
    const facilities = Number(window.AMUR_INFRASTRUCTURE_DATA?.meta?.facilities || 0);
    const key = [state.view, panelOpen, mapMounted, facilities, informationOpen].join("|");
    if (key !== infrastructureChromeSummaryKey || !infrastructureChromeSummary) {
      infrastructureChromeSummaryKey = key;
      infrastructureChromeSummary = Object.freeze({
        active: state.view === "infrastructure",
        informationOpen,
        panelOpen,
        mapMounted,
        facilities
      });
    }
    return infrastructureChromeSummary;
  };

  const setInfrastructurePanel = (open) => {
    if (state.view !== "infrastructure") return;
    if (open && window.AmurMapWorkspace?.desktop() && !window.AmurMapWorkspace.wide()) window.AmurMapWorkspace.setInformation(false);
    const shell = document.querySelector(".infra-shell");
    const currentOpen = Boolean(shell && !shell.classList.contains("is-panel-collapsed"));
    if (currentOpen !== Boolean(open)) shell?.querySelector("[data-legacy-infra-panel-toggle]")?.click();
    infrastructureChromeSummaryKey = "";
    window.AmurInfrastructureMap?.resize?.();
    window.setTimeout(() => window.AmurInfrastructureMap?.resize?.(), 230);
    queueMicrotask(emit);
  };

  const triggerInfrastructureAction = (action) => {
    if (state.view !== "infrastructure" || action !== "fit") return;
    document.querySelector(".infra-fit-button")?.click();
  };

  const getMapTerritories = () => {
    const medical = state.view === "infrastructure";
    const definitions = medical || state.mapUnit === "mo" ? DATA.municipalities : DATA.settlements;
    return definitions.map(item => ({ id: Number(item.id), label: item.municipality ? `${item.name} · ${item.municipality}` : item.name }));
  };
  const searchMapTerritory = query => {
    if (!["map", "infrastructure"].includes(state.view)) return "";
    const normalize = value => String(value).trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
    const text = normalize(query);
    if (!text) return "Введите название территории";
    const items = getMapTerritories();
    const exact = items.find(item => normalize(item.label) === text);
    const matches = exact ? [exact] : items.filter(item => normalize(item.label).includes(text));
    if (matches.length !== 1) return matches.length ? "Несколько совпадений. Выберите полное название из списка" : "Территория не найдена в текущем слое";
    if (state.view === "infrastructure") window.AmurInfrastructureMap?.selectTerritory(matches[0].id, { fly: true, focus: true });
    else window.AmurMortalityMap?.select(state.mapUnit, matches[0].id, { fly: true, focus: true });
    return `Выбрано: ${matches[0].label}`;
  };
  const setInfrastructureInformation = open => window.AmurMapWorkspace?.setInformation(Boolean(open));
  window.addEventListener("atlas:workspace-panel", () => { infrastructureChromeSummaryKey = ""; queueMicrotask(emit); });

  const getNavigationSummary = () => {
    const infrastructureView = state.view === "infrastructure";
    const shell = infrastructureView ? document.querySelector(".infra-shell") : null;
    const panelOpen = infrastructureView
      ? Boolean(shell && !shell.classList.contains("is-panel-collapsed"))
      : !document.getElementById("atlasWorkspace")?.classList.contains("drawer-collapsed");
    const key = `${state.view}|${panelOpen}`;
    if (key !== navigationSummaryKey || !navigationSummary) {
      navigationSummaryKey = key;
      navigationSummary = Object.freeze({
        activeView: String(state.view),
        panelOpen,
        viewCount: validViews.size
      });
    }
    return navigationSummary;
  };

  const setNavigationPanel = (open) => {
    if (state.view === "infrastructure") {
      setInfrastructurePanel(open);
      return;
    }
    const workspace = document.getElementById("atlasWorkspace");
    const currentOpen = !workspace?.classList.contains("drawer-collapsed");
    if (currentOpen !== Boolean(open)) document.getElementById("drawerRailToggle")?.click();
    navigationSummaryKey = "";
    queueMicrotask(emit);
  };

  const getTreemapSummary = () => {
    const api = window.AmurTreemapV2;
    if (!api) {
      return Object.freeze({
        active: false,
        level: "root",
        metric: "n",
        color: "count",
        sort: "value",
        showValues: true,
        minShare: .5,
        contextLabel: "Все классы МКБ-10",
        breadcrumbs: Object.freeze([]),
        selected: null,
        children: Object.freeze([])
      });
    }
    const key = [
      state.view,
      state.year,
      state.sex,
      state.age,
      state.treeType,
      state.treeIndex,
      state.treeMetric,
      state.treeColor,
      state.treeSort,
      state.treeShowValues,
      state.treeMinShare,
      document.querySelector(".treev2-canvas .tile.is-selected")?.dataset.treeKey || ""
    ].join("|");
    if (key !== treemapSummaryKey || !treemapSummary) {
      treemapSummaryKey = key;
      treemapSummary = api.getSummary();
    }
    return treemapSummary;
  };

  const setTreemapOption = (option, value) => {
    if (state.view !== "treemap") return;
    window.AmurTreemapV2?.setOption?.(option, value);
  };

  const setTreemapLevel = (level) => {
    if (state.view !== "treemap") return;
    window.AmurTreemapV2?.setLevel?.(level);
  };

  const triggerTreemapAction = (action) => {
    if (state.view !== "treemap") return;
    if (action === "reset") window.AmurTreemapV2?.reset?.();
    else if (action === "drill") window.AmurTreemapV2?.drill?.();
  };

  const selectTreemapChild = (key) => {
    if (state.view !== "treemap") return;
    window.AmurTreemapV2?.selectChild?.(String(key));
  };

  const getHeatmapSummary = () => {
    const api = window.AmurHeatmapV2;
    if (!api) {
      return Object.freeze({
        active: false,
        unit: "mo",
        metric: "share",
        limit: "25",
        rows: 0,
        columns: 0,
        selected: null,
        topTerritories: Object.freeze([])
      });
    }
    const key = [
      state.view,
      state.year,
      state.sex,
      state.age,
      state.heatUnit,
      state.heatMetric,
      state.heatLimit,
      document.querySelector(".heatv2-cell.is-selected")?.dataset.heatmapKey || ""
    ].join("|");
    if (key !== heatmapSummaryKey || !heatmapSummary) {
      heatmapSummaryKey = key;
      heatmapSummary = api.getSummary();
    }
    return heatmapSummary;
  };

  const setHeatmapOption = (option, value) => {
    if (state.view !== "heatmap") return;
    window.AmurHeatmapV2?.setOption?.(option, value);
  };

  const selectHeatmapCell = (key) => {
    if (state.view !== "heatmap") return;
    window.AmurHeatmapV2?.selectCell?.(String(key));
  };

  const getRankSummary = () => {
    const api = window.AmurRankAnalysis;
    if (!api) {
      return Object.freeze({
        active: false,
        view: "compare",
        compare: "time",
        level: "class",
        classIndex: "all",
        metric: "n",
        top: "15",
        onlyChanges: false,
        itemCount: 0,
        slices: Object.freeze([]),
        classOptions: Object.freeze([]),
        selected: null,
        movers: Object.freeze([])
      });
    }
    const key = [
      state.view,
      state.year,
      state.sex,
      state.age,
      state.rankView,
      state.rankCompare,
      state.rankLevel,
      state.rankClass,
      state.rankMetric,
      state.rankTop,
      state.rankOnlyChanges,
      document.querySelector(".rank-trajectory.is-selected")?.dataset.rankKey || ""
    ].join("|");
    if (key !== rankSummaryKey || !rankSummary) {
      rankSummaryKey = key;
      rankSummary = api.getSummary();
    }
    return rankSummary;
  };

  const setRankOption = (option, value) => {
    if (state.view !== "arrow") return;
    window.AmurRankAnalysis?.setOption?.(option, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  };

  const selectRankItem = (key) => {
    if (state.view !== "arrow") return;
    window.AmurRankAnalysis?.selectItem?.(String(key));
  };

  const getPyramidSummary = () => {
    const api = window.AmurPyramidAnalysis;
    if (!api) {
      return Object.freeze({
        active: false,
        view: "structure",
        level: "class",
        parentClass: "all",
        cause: "all",
        metric: "n",
        ageStep: "5",
        labels: "major",
        firstYear: DATA.years[0],
        lastYear: DATA.years[DATA.years.length - 1],
        periodLabel: String(DATA.period || ""),
        causeLabel: "Все причины смерти",
        classOptions: Object.freeze([]),
        causeOptions: Object.freeze([]),
        total: 0,
        maleTotal: 0,
        femaleTotal: 0,
        peakLabel: "н/д",
        selected: null,
        topBins: Object.freeze([])
      });
    }
    const key = [
      state.view,
      state.year,
      state.pyramidView,
      state.pyramidLevel,
      state.pyramidParentClass,
      state.pyramidCause,
      state.pyramidMetric,
      state.pyramidAgeStep,
      state.pyramidLabels,
      api.getSummary()?.selected?.key || ""
    ].join("|");
    if (key !== pyramidSummaryKey || !pyramidSummary) {
      pyramidSummaryKey = key;
      pyramidSummary = api.getSummary();
    }
    return pyramidSummary;
  };

  const setPyramidOption = (option, value) => {
    if (state.view !== "pyramid") return;
    window.AmurPyramidAnalysis?.setOption?.(String(option), String(value));
  };

  const selectPyramidItem = (key) => {
    if (state.view !== "pyramid") return;
    window.AmurPyramidAnalysis?.selectItem?.(String(key));
  };

  const getPlotSummary = () => {
    const api = window.AmurPlotAnalysis;
    if (!api) {
      return Object.freeze({
        active: false,
        view: "profile",
        level: "class",
        classIndex: "all",
        cause: "all",
        interval: "p10p90",
        sort: "n",
        minN: "10",
        top: "15",
        compare: "time",
        yearA: String(DATA.years[0]),
        yearB: String(DATA.years[DATA.years.length - 1]),
        distributionMetric: "n",
        years: Object.freeze([...DATA.years]),
        classOptions: Object.freeze([]),
        causeOptions: Object.freeze([]),
        sliceLabels: Object.freeze([]),
        itemCount: 0,
        selectedKey: null,
        context: null,
        topItems: Object.freeze([])
      });
    }
    const live = api.getSummary();
    const key = [
      state.view,
      state.year,
      state.sex,
      state.age,
      live.view,
      live.level,
      live.classIndex,
      live.cause,
      live.interval,
      live.sort,
      live.minN,
      live.top,
      live.compare,
      live.yearA,
      live.yearB,
      live.distributionMetric,
      live.context?.key || live.context?.title || ""
    ].join("|");
    if (key !== plotSummaryKey || !plotSummary) {
      plotSummaryKey = key;
      plotSummary = live;
    }
    return plotSummary;
  };

  const setPlotOption = (option, value) => {
    if (state.view !== "plot") return;
    window.AmurPlotAnalysis?.setOption?.(String(option), String(value));
  };

  const selectPlotItem = (key) => {
    if (state.view !== "plot") return;
    window.AmurPlotAnalysis?.selectItem?.(String(key));
  };

  const triggerPlotAction = (action) => {
    if (state.view !== "plot") return;
    window.AmurPlotAnalysis?.triggerAction?.(String(action));
  };

  const getDotogramSummary = () => {
    const api = window.AmurDotogramAnalysis;
    if (!api) {
      return Object.freeze({
        active: false,
        unit: "settlement",
        metric: "n",
        classIndex: "all",
        labels: "outliers",
        metricLabel: "количество смертей",
        classOptions: Object.freeze([]),
        itemCount: 0,
        medianValue: null,
        medianText: "н/д",
        selectedKey: null,
        selected: null,
        topItems: Object.freeze([])
      });
    }
    const live = api.getSummary();
    const key = [
      state.view,
      state.year,
      state.sex,
      state.age,
      live.unit,
      live.metric,
      live.classIndex,
      live.labels,
      live.itemCount,
      live.selectedKey || ""
    ].join("|");
    if (key !== dotogramSummaryKey || !dotogramSummary) {
      dotogramSummaryKey = key;
      dotogramSummary = live;
    }
    return dotogramSummary;
  };

  const setDotogramOption = (option, value) => {
    if (state.view !== "dotogram") return;
    window.AmurDotogramAnalysis?.setOption?.(String(option), String(value));
  };

  const selectDotogramItem = (key) => {
    if (state.view !== "dotogram") return;
    window.AmurDotogramAnalysis?.selectItem?.(String(key));
  };

  window.AtlasLegacyBridge = Object.freeze({
    version: "1",
    getSnapshot: () => currentSnapshot,
    getDataSummary: () => dataSummary,
    getPopulationBasisNote: () => rateBasisText(),
    getHeaderSummary,
    getMortalityScope: headerScope,
    getMapChromeSummary,
    getMapTerritories,
    searchMapTerritory,
    setInfrastructureInformation,
    getResourceState,
    setResourceOption,
    getMunicipalContextSummary,
    getInfrastructureChromeSummary,
    getNavigationSummary,
    getTreemapSummary,
    getHeatmapSummary,
    getRankSummary,
    getPyramidSummary,
    getPlotSummary,
    getDotogramSummary,
    setGlobalFilters,
    setView,
    setNavigationPanel,
    triggerHeaderAction,
    setMapPanel,
    triggerMapAction,
    setInfrastructurePanel,
    triggerInfrastructureAction,
    setTreemapOption,
    setTreemapLevel,
    triggerTreemapAction,
    selectTreemapChild,
    setHeatmapOption,
    selectHeatmapCell,
    setRankOption,
    selectRankItem,
    setPyramidOption,
    selectPyramidItem,
    setPlotOption,
    selectPlotItem,
    triggerPlotAction,
    setDotogramOption,
    selectDotogramItem,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });

  window.addEventListener("atlas:dotogram-state", () => {
    dotogramSummaryKey = "";
    emit();
  });

  const legacyActionStatus = document.querySelector("[data-legacy-header-actions] .atlas-action-status");
  if (legacyActionStatus) {
    new MutationObserver(() => {
      actionMessage = legacyActionStatus.textContent?.trim() || "";
      headerSummaryKey = "";
      emit();
    }).observe(legacyActionStatus, { childList: true, characterData: true, subtree: true });
  }

  const syncMapChrome = () => {
    mapChromeSummaryKey = "";
    emit();
  };
  window.addEventListener("atlas:mortality-selection", (event) => {
    fallbackMortalitySelection = event.detail;
    syncMapChrome();
  });
  window.addEventListener("atlas:infrastructure-panel", () => {
    infrastructureChromeSummaryKey = "";
    navigationSummaryKey = "";
    emit();
  });
  window.addEventListener("atlas:treemap-state", () => {
    treemapSummaryKey = "";
    emit();
  });
  window.addEventListener("atlas:heatmap-state", () => {
    heatmapSummaryKey = "";
    emit();
  });
  window.addEventListener("atlas:rank-state", () => {
    rankSummaryKey = "";
    emit();
  });
  window.addEventListener("atlas:pyramid-state", () => {
    pyramidSummaryKey = "";
    emit();
  });
  window.addEventListener("atlas:plot-state", () => {
    plotSummaryKey = "";
    emit();
  });
  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(syncMapChrome);
  }, { passive: true });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#drawerRailToggle, #drawerToggle, [data-legacy-map-inspector-toggle]")) {
      navigationSummaryKey = "";
      queueMicrotask(syncMapChrome);
    }
  }, true);

  queueMicrotask(emit);

  const loadReactRuntime = () => {
    const moduleUrl = location.hostname === "127.0.0.1" && location.port === "5173"
      ? "/src/hybrid/main.tsx"
      : "assets/react/atlas-hybrid.js?v=8d9dcf7bf2eb";
    const moduleScript = document.createElement("script");
    moduleScript.type = "module";
    moduleScript.src = moduleUrl;
    moduleScript.addEventListener("error", (error) => {
      const root = document.querySelector("[data-react-hybrid-root]");
      if (root) root.dataset.reactStatus = "load-error";
      window.dispatchEvent(new Event("atlas:react-load-error"));
      console.error("React hybrid runtime failed to load", error);
    });
    document.head.appendChild(moduleScript);
  };
  loadReactRuntime();
})();
