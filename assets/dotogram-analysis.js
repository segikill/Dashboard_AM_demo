(() => {
  "use strict";

  if (typeof state === "undefined" || typeof render !== "function" || typeof geoValues !== "function") return;

  let selectedKey = null;
  let runtime = null;
  let renderedSignature = null;
  let restoredSignature = null;
  const renderCache = new Map();

  const signature = () => [
    state.year,
    state.sex,
    state.age,
    state.dotUnit,
    state.dotMetric,
    state.dotClass,
    state.dotLabels || "outliers"
    , state.dotDataset || "mortality",
    Math.round(document.getElementById("viz")?.clientWidth || innerWidth),
    Math.round(document.getElementById("viz")?.clientHeight || innerHeight)
  ].join("|");

  const rememberCurrentView = (key) => {
    const viz = document.getElementById("viz");
    if (!viz || !runtime || !viz.querySelector(".svg-chart")) return;
    const host = document.createElement("div");
    while (viz.firstChild) host.appendChild(viz.firstChild);
    renderCache.delete(key);
    renderCache.set(key, {
      host,
      runtime,
      selectedKey,
      method: document.getElementById("methodText")?.textContent || ""
    });
    while (renderCache.size > 6) renderCache.delete(renderCache.keys().next().value);
  };

  const restoreCached = () => {
    if (state.view !== "dotogram") return false;
    if (state.dotDataset === "resources") return false;
    const key = signature();
    const cached = renderCache.get(key);
    if (!cached) return false;
    renderCache.delete(key);
    const viz = document.getElementById("viz");
    if (!viz) return false;
    viz.innerHTML = "";
    while (cached.host.firstChild) viz.appendChild(cached.host.firstChild);
    runtime = cached.runtime;
    selectedKey = cached.selectedKey;
    const method = document.getElementById("methodText");
    if (method && cached.method) method.textContent = cached.method;
    restoredSignature = key;
    return true;
  };

  const formatValue = value => Number.isFinite(value) ? DF.format(value) : "Нет данных";

  const itemColor = (value) => {
    if (!value.total) return "#667085";
    if (state.dotClass !== "all") return DATA.classes[+state.dotClass]?.color || "#356ae6";
    const leading = value.classes.indexOf(Math.max(...value.classes));
    return DATA.classes[leading]?.color || "#667085";
  };

  const buildRuntime = () => {
    const defs = DATA.municipalities;
    const map = new Map(defs.map((definition, idx) => [idx, { idx, metricValue: demoMetric(state.dotMetric).values[definition.id] ?? null }]));
    const totalRows = state.dotMetric === "share" && state.dotClass === "all" ? filtered().length : 0;
    const items = [...map.values()].map((source) => {
      const definition = defs[source.idx];
      const value = source.metricValue;
      return {
        key: `${state.dotUnit}:${source.idx}`,
        index: source.idx,
        name: String(definition?.name || "Не указано"),
        territoryType: state.dotUnit === "mo"
          ? String(definition?.displayType || definition?.municipalityType || "муниципальная территория")
          : String(definition?.type || (definition?.isCity ? "город" : "населённый пункт")),
        municipality: state.dotUnit === "settlement" ? String(definition?.municipality || "") : "",
        population: populationDisplay(definition,state.dotMetric).value,
        populationLabel: populationDisplay(definition,state.dotMetric).label,
        populationNote: populationDisplay(definition,state.dotMetric).note,
        value,
        valueText: formatValue(value),
        color: "#356a9d",
      };
    }).filter((item) => item.value != null && Number.isFinite(item.value));

    const ranked = ANALYTICS_CORE.rankItems(
      items,
      (item) => item.value,
      (left, right) => left.name.localeCompare(right.name, "ru")
    );
    const rankByKey = new Map(ranked.map((item) => [item.key, item.rank]));
    items.forEach((item) => { item.rank = rankByKey.get(item.key); });
    const raw = items.map((item) => item.value);
    const q1 = quantile(raw, .25) ?? 0;
    const q3 = quantile(raw, .75) ?? 0;
    const threshold = q3 + 1.5 * (q3 - q1);
    items.forEach((item) => { item.isOutlier = item.value > threshold; });
    const drawItems = state.dotUnit === "mo" ? ranked : items;

    if (!selectedKey || !items.some((item) => item.key === selectedKey)) selectedKey = ranked[0]?.key || null;
    runtime = { items, ranked, drawItems, median: quantile(raw, .5), q1, q3, threshold };
    return runtime;
  };

  const selectedItem = () => runtime?.items.find((item) => item.key === selectedKey) || runtime?.ranked[0] || null;

  const syncPointSelection = () => {
    document.querySelectorAll("#viz [data-dotogram-key]").forEach((node) => {
      const active = node.dataset.dotogramKey === selectedKey;
      node.classList.toggle("is-selected", active);
      node.setAttribute("aria-pressed", String(active));
    });
  };

  const emitSelection = () => {
    window.dispatchEvent(new CustomEvent("atlas:dotogram-state", { detail: { selectedKey } }));
  };

  const selectItem = (key, focus = false) => {
    if (!runtime?.items.some((item) => item.key === key)) return;
    selectedKey = key;
    syncPointSelection();
    const point = document.querySelector(`#viz [data-dotogram-key="${CSS.escape(key)}"]`);
    if (focus) point?.focus({ preventScroll: true });
    emitSelection();
  };

  const decoratePoints = () => {
    if (state.view !== "dotogram") return;
    if (state.dotDataset === "resources") return;
    const currentSignature = signature();
    if (restoredSignature === currentSignature && runtime) {
      restoredSignature = null;
      renderedSignature = currentSignature;
      syncPointSelection();
      return;
    }
    const model = buildRuntime();
    const points = [...document.querySelectorAll("#viz .dotogram-ranked circle, #viz .dotogram-groups circle")];
    points.forEach((point, index) => {
      const item = model.drawItems[index];
      if (!item) return;
      point.dataset.dotogramKey = item.key;
      point.classList.add("dotogram-point");
      point.setAttribute("tabindex", "0");
      point.setAttribute("role", "button");
      point.setAttribute("aria-label", `${item.name}: ${item.valueText}`);
      point.addEventListener("click", () => selectItem(item.key));
      point.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectItem(item.key);
      });
    });
    syncPointSelection();
    renderedSignature = currentSignature;
  };

  const insightFor = (item) => {
    if (!item || !runtime) return "Для выбранного среза нет территорий с рассчитанным значением.";
    const comparison = runtime.median == null ? "" : item.value > runtime.median
      ? `Значение выше медианы территорий (${formatValue(runtime.median)}).`
      : item.value < runtime.median ? `Значение ниже медианы территорий (${formatValue(runtime.median)}).` : "Значение совпадает с медианой территорий.";
    const outlier = item.isOutlier ? " Территория относится к верхним статистическим выбросам по правилу Q3 + 1,5×IQR." : "";
    return `${item.name} занимает ${item.rank}-е место из ${runtime.items.length}. ${comparison}${outlier}`;
  };

  const getSummary = () => {
    if (!runtime || state.view === "dotogram" && !runtime.items.length) buildRuntime();
    const selected = selectedItem();
    return Object.freeze({
      active: state.view === "dotogram",
      unit: String(state.dotUnit),
      metric: String(state.dotMetric),
      classIndex: String(state.dotClass),
      labels: String(state.dotLabels || "outliers"),
      metricLabel: demoMetric(state.dotMetric).unit,
      sourcePage: demoMetric(state.dotMetric).page,
      classOptions: Object.freeze(DATA.classes.map((item, index) => Object.freeze({ value: String(index), label: `${item.roman}. ${item.short}` }))),
      itemCount: runtime?.items.length || 0,
      medianValue: runtime?.median ?? null,
      medianText: runtime?.median == null ? "н/д" : formatValue(runtime.median),
      selectedKey,
      selected: selected ? Object.freeze({
        ...selected,
        insight: insightFor(selected)
      }) : null,
      topItems: Object.freeze((runtime?.ranked || []).slice(0, 10).map((item) => Object.freeze({ ...item })))
    });
  };

  const setOption = (option, value) => {
    if (state.view !== "dotogram") return;
    const valid = {
      unit: ["settlement", "mo"],
      metric: Object.keys(DEMO.mortality),
      labels: ["outliers", "top", "off"]
    };
    if (option === "classIndex") {
      const next = String(value);
      if (next !== "all" && !DATA.classes[+next]) return;
      state.dotClass = next;
    } else if (valid[option]?.includes(String(value))) {
      state[option === "unit" ? "dotUnit" : option === "metric" ? "dotMetric" : "dotLabels"] = String(value);
    } else return;
    selectedKey = null;
    render();
  };

  const originalRender = render;
  render = function dotogramCompatibleRender() {
    const nextSignature = state.view === "dotogram" ? signature() : null;
    if (nextSignature && renderedSignature && nextSignature !== renderedSignature) {
      rememberCurrentView(renderedSignature);
    }
    const result = originalRender.apply(this, arguments);
    if (state.view === "dotogram") decoratePoints();
    return result;
  };

  window.AmurDotogramAnalysis = Object.freeze({
    enhanced: true,
    restoreCached,
    getSummary,
    setOption,
    selectItem
  });

  if (state.view === "dotogram") decoratePoints();
})();
