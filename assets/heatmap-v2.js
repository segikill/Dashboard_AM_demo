(() => {
  "use strict";

  if (
    typeof state === "undefined"
    || typeof DATA === "undefined"
    || typeof renderHeatmap !== "function"
  ) return;

  let selectedKey = "";
  let activeModel = null;
  let activeSelected = null;

  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = (value) => esc(value);
  const analyticsCore = window.AmurAtlasAnalyticsCore;
  if (!analyticsCore?.buildHeatmapModel) return;
  const heatmapReference = Object.freeze({
    years: DATA.years,
    codes: DATA.codes,
    classes: DATA.classes,
    municipalities: DATA.municipalities,
    settlements: DATA.settlements
  });
  const emitHeatmapState = () => queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("atlas:heatmap-state"));
  });

  const cellKey = analyticsCore.heatmapCellKey;
  const groupNames = {
    city: "Города",
    urban_settlement: "Посёлки городского типа",
    district: "Районы"
  };

  const buildModel = () => {
    const model = analyticsCore.buildHeatmapModel(
    filtered(),
    DATA.records,
    heatmapReference,
    {
      unit: state.heatUnit,
      metric: state.heatMetric,
      limit: state.heatLimit,
      selectedYear: state.year, sex: state.sex, age: state.age
    }
    );
    const classes = DATA.classes.map((_, index) => index);
    const cells = model.rows.flatMap(row => classes.map(classIndex => ({
      key: cellKey("mo", row.idx, classIndex), row, definition: model.definitions[row.idx],
      classIndex, value: null, count: null, population: null, share: null,
      territoryRank: null, territoryCount: 0, causeRank: null, causeCount: 0
    })));
    return { ...model, classes, cells, cellMap: new Map(cells.map(cell => [cell.key, cell])) };
  };

  const metricText = cell => cell.value == null ? "Нет данных" : formatTerritoryMetric(state.heatMetric, cell.value);
  const className = (classIndex) => {
    const definition = DATA.classes[classIndex];
    return `${definition?.roman || ""} · ${definition?.short || ""}`;
  };

  const rankFor = (model, selected) => {
    return {
      territoryRank: selected.territoryRank,
      territoryCount: selected.territoryCount,
      causeRank: selected.causeRank,
      causeCount: selected.causeCount,
      topTerritories: []
    };
  };

  const publicCell = (cell, model = activeModel) => {
    if (!cell || !model) return null;
    const ranks = rankFor(model, cell);
    const cause = DATA.classes[cell.classIndex];
    return Object.freeze({
      key: String(cell.key),
      territory: String(cell.definition.name),
      territoryType: String(cell.definition.municipalityType || (model.unit === "mo" ? "district" : "settlement")),
      classIndex: cell.classIndex,
      classCode: String(cause?.roman || ""),
      className: String(cause?.short || ""),
      classColor: String(cause?.color || "#397aaa"),
      metricValue: cell.value == null || !Number.isFinite(cell.value) ? null : numeric(cell.value),
      metricText: metricText(cell),
      metricLabel: territoryMetricLabel(state.heatMetric),
      deaths: null,
      totalDeaths: null,
      population: cell.population == null ? null : numeric(cell.population),
      populationLabel: populationDisplay(cell.definition,state.heatMetric).label,
      populationNote: populationDisplay(cell.definition,state.heatMetric).note,
      share: null,
      territoryRank: ranks.territoryRank,
      territoryCount: ranks.territoryCount,
      causeRank: ranks.causeRank,
      causeCount: ranks.causeCount,
      formula: rateBase(state.heatMetric)
        ? rateFormula(cell.count, cell.definition, state.heatMetric)
        : ""
    });
  };

  const renderFallbackInspector = (model, selected) => {
    const fallback = document.getElementById("heatmapInspectorFallback");
    if (!fallback || !selected) return;
    const summary = publicCell(selected, model);
    const ranks = rankFor(model, selected);
    fallback.innerHTML = `
      <section class="heatv2-inspector-card">
        <span class="heatv2-kicker">Выбранная ячейка</span>
        <h3>${escapeHtml(summary.territory)}</h3>
        <p><b>${escapeHtml(summary.classCode)}</b> ${escapeHtml(summary.className)}</p>
        <div class="heatv2-primary"><strong>${escapeHtml(summary.metricText)}</strong><span>${escapeHtml(summary.metricLabel)}</span></div>
      </section>`;
    fallback.querySelectorAll("[data-heatmap-rank]").forEach((button) => {
      button.onclick = () => selectCell(button.dataset.heatmapRank);
    });
  };

  const selectCell = (key) => {
    if (!activeModel) return;
    const selected = activeModel.cells.find((cell) => cell.key === key);
    if (!selected) return;
    selectedKey = selected.key;
    activeSelected = selected;
    document.querySelectorAll(".heatv2-cell").forEach((cell) => {
      const active = cell.dataset.heatmapKey === selectedKey;
      cell.classList.toggle("is-selected", active);
      cell.setAttribute("aria-pressed", String(active));
    });
    const fallback = document.getElementById("heatmapInspectorFallback");
    if (!fallback?.parentElement?.classList.contains("is-react-owned")) {
      renderFallbackInspector(activeModel, selected);
    }
    emitHeatmapState();
  };

  renderHeatmap = () => {
    const model = buildModel();
    activeModel = model;
    if (!model.cells.some((cell) => cell.key === selectedKey)) {
      selectedKey = [...model.cells]
        .filter((cell) => Number.isFinite(cell.value))
        .sort((left, right) => right.value - left.value)[0]?.key || model.cells[0]?.key || "";
    }
    activeSelected = model.cells.find((cell) => cell.key === selectedKey) || model.cells[0] || null;

    const layout = document.createElement("div");
    layout.className = "heatmap-v2-layout";
    const stage = document.createElement("section");
    stage.className = "heatv2-stage";
    stage.setAttribute("aria-label", "Матрица территории и причины смерти");
    stage.innerHTML = `
      <header class="heatv2-stage-head">
        <div><span>Срез матрицы</span><b>${fmt(model.rows.length)} территорий × ${fmt(model.classes.length)} классов</b></div>
        <small>Нажмите ячейку для постоянной аналитики справа</small>
      </header>`;

    const wrap = document.createElement("div");
    wrap.className = "heat-wrap heatv2-scroll";
    const grid = document.createElement("div");
    grid.className = "heat-grid";
    grid.style.gridTemplateColumns = `minmax(150px, 21%) repeat(${model.classes.length}, minmax(20px, 1fr))`;
    grid.appendChild(document.createElement("div"));
    model.classes.forEach((classIndex) => {
      const head = document.createElement("div");
      head.className = "heat-head";
      head.textContent = `${DATA.classes[classIndex].roman} ${DATA.classes[classIndex].short}`;
      head.title = className(classIndex);
      grid.appendChild(head);
    });

    let previousGroup = "";
    model.rows.forEach((row) => {
      const definition = model.definitions[row.idx];
      const territoryType = definition.municipalityType || "district";
      if (model.isMunicipality && territoryType !== previousGroup) {
        const group = document.createElement("div");
        group.className = "heat-group-label";
        group.textContent = groupNames[territoryType] || "Муниципальные территории";
        grid.appendChild(group);
        previousGroup = territoryType;
      }
      const label = document.createElement("div");
      label.className = "heat-rowlabel";
      label.textContent = definition.name;
      label.title = definition.name;
      grid.appendChild(label);

      model.classes.forEach((classIndex) => {
        const cellData = model.cellMap.get(cellKey(model.unit, row.idx, classIndex));
        const cell = document.createElement("button");
        const available = Number.isFinite(cellData.value);
        const ratio = available ? cellData.value / model.maximum : 0;
        cell.type = "button";
        cell.className = `heat-cell heatv2-cell${cellData.key === selectedKey ? " is-selected" : ""}`;
        cell.dataset.heatmapKey = cellData.key;
        cell.setAttribute("aria-pressed", String(cellData.key === selectedKey));
        cell.setAttribute("aria-label", `${definition.name}. ${className(classIndex)}. ${metricText(cellData)}`);
        cell.style.background = available
          ? `rgb(${Math.round(240 - 177 * ratio)},${Math.round(244 - 118 * ratio)},${Math.round(250 - 35 * ratio)})`
          : "#f2f4f7";
        cell.style.color = available && ratio > .48 ? "#fff" : "#42506a";
        cell.textContent = !available
          ? "—"
          : state.heatMetric === "share"
            ? row.total === 0 ? "0" : cellData.value >= 2 ? DF.format(cellData.value) : ""
            : rateBase(state.heatMetric)
              ? DF.format(cellData.value)
              : row.total === 0 ? "0" : cellData.value || "";
        addTip(cell, "<b>" + escapeHtml(definition.name) + " · " + escapeHtml(className(classIndex)) + "</b><p>Доля не опубликована</p>");
        cell.onclick = () => selectCell(cellData.key);
        grid.appendChild(cell);
      });
    });

    wrap.appendChild(grid);
    wrap.insertAdjacentHTML("beforeend", '<div class="heat-scale"><span>— Доля не опубликована</span></div>');
    stage.appendChild(wrap);

    const inspector = document.createElement("aside");
    inspector.className = "heatv2-inspector";
    inspector.setAttribute("aria-label", "Аналитика выбранной ячейки матрицы");
    inspector.innerHTML = `
      <div class="react-heatmap-inspector-host" data-react-heatmap-inspector hidden></div>
      <div id="heatmapInspectorFallback" data-legacy-heatmap-inspector></div>`;
    layout.append(stage, inspector);
    els.viz.appendChild(layout);
    renderFallbackInspector(model, activeSelected);
    emitHeatmapState();
  };

  const getPublicSummary = () => {
    const model = activeModel || buildModel();
    const selected = activeSelected || model.cells[0] || null;
    const ranks = selected ? rankFor(model, selected) : { topTerritories: [] };
    return Object.freeze({
      active: state.view === "heatmap",
      unit: String(state.heatUnit),
      metric: String(state.heatMetric),
      limit: String(state.heatLimit),
      rows: model.rows.length,
      columns: model.classes.length,
      selected: publicCell(selected, model),
      topTerritories: Object.freeze(ranks.topTerritories.map((cell) => publicCell(cell, model)))
    });
  };

  const setPublicOption = (option, value) => {
    const property = { unit: "heatUnit", metric: "heatMetric", limit: "heatLimit" }[option];
    const valid = {
      unit: new Set(["mo", "settlement"]),
      metric: new Set(["share", "n", "per1k", "per10k", "per100k"]),
      limit: new Set(["25", "50", "all"])
    }[option];
    const next = String(value);
    if (!property || !valid?.has(next) || String(state[property]) === next) return;
    state[property] = next;
    selectedKey = "";
    activeModel = null;
    activeSelected = null;
    render();
  };

  window.AmurHeatmapV2 = Object.freeze({
    getSummary: getPublicSummary,
    setOption: setPublicOption,
    selectCell
  });
})();
