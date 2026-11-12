(() => {
  "use strict";

  const MAPLIBRE_VERSION = "5.24.0";
  const MAPLIBRE_SCRIPT = `assets/vendor/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.js`;
  const MAPLIBRE_STYLE = `assets/vendor/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.css`;
  const DATA_SCRIPT = "data/infrastructure-data.js?v=3db472f7fc21";
  const PREFIX = "mortality-";
  const SETTLEMENT_SYMBOL_CLASSES = [
    { code: "under_1k", diameter: 6 },
    { code: "1k_2_5k", diameter: 8 },
    { code: "2_5k_5k", diameter: 12 },
    { code: "5k_10k", diameter: 17 },
    { code: "10k_20k", diameter: 21 },
    { code: "20k_40k", diameter: 26 },
    { code: "40k_200k", diameter: 42, donut: true, ring: 8 },
    { code: "over_200k", diameter: 62, donut: true, ring: 11 }
  ];
  const REGULAR_CLASSES = SETTLEMENT_SYMBOL_CLASSES.filter((item) => !item.donut);
  const DONUT_CLASSES = SETTLEMENT_SYMBOL_CLASSES.filter((item) => item.donut);
  const SETTLEMENT_LAYER_IDS = SETTLEMENT_SYMBOL_CLASSES.map(
    (item) => `${PREFIX}settlement-${item.code}`
  );
  const DONUT_OUTLINE_LAYER_IDS = DONUT_CLASSES.map(
    (item) => `${PREFIX}settlement-${item.code}-outline`
  );
  const DONUT_INNER_OUTLINE_LAYER_IDS = DONUT_CLASSES.map(
    (item) => `${PREFIX}settlement-${item.code}-inner-outline`
  );

  let map = null;
  let basemap = null;
  let root = null;
  let mountToken = 0;
  let mapLibrePromise = null;
  let dataPromise = null;
  let sourceData = null;
  let currentModel = null;
  let appliedUnit = "";
  let selected = null;
  let pendingSelection = null;
  let hoverPopup = null;
  let cardDock = null;
  let detailsRequested = false;
  let interactionAbort = null;
  let hoverFrame = 0;
  const appliedFeatureState = {
    mo: new Map(),
    settlement: new Map()
  };

  const escapeHtml = (value) => String(value ?? "").replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]
  );

  const ensureStylesheet = (href, id) => {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  const loadScript = (src, id) => new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === "true" || (id === "amur-maplibre-js" && window.maplibregl)
        || (id === "amur-infrastructure-data" && window.AMUR_INFRASTRUCTURE_DATA)) {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Не удалось загрузить ${src}`)), { once: true });
    document.head.appendChild(script);
  });

  const ensureMapLibre = () => {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (!mapLibrePromise) {
      ensureStylesheet(MAPLIBRE_STYLE, "amur-maplibre-css");
      mapLibrePromise = loadScript(MAPLIBRE_SCRIPT, "amur-maplibre-js").then(() => window.maplibregl);
    }
    return mapLibrePromise;
  };

  const ensureData = () => {
    if (window.AMUR_INFRASTRUCTURE_DATA) return Promise.resolve(window.AMUR_INFRASTRUCTURE_DATA);
    if (!dataPromise) {
      dataPromise = loadScript(DATA_SCRIPT, "amur-infrastructure-data").then(
        () => window.AMUR_INFRASTRUCTURE_DATA
      );
    }
    return dataPromise;
  };

  const setVisibility = (layerId, visible) => {
    if (!map?.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  };

  const radiusExpression = (symbolClass) => {
    const base = symbolClass.diameter * .5;
    return [
      "interpolate", ["linear"], ["zoom"],
      4, base * .66,
      6, base * .76,
      8, base * .9,
      10, base,
      12, base * 1.08
    ];
  };

  const donutStrokeExpression = (symbolClass) => [
    "interpolate", ["linear"], ["zoom"],
    4, symbolClass.ring * .66,
    9, symbolClass.ring * .94,
    12, symbolClass.ring * 1.04
  ];

  const donutOuterRadiusExpression = (symbolClass) => {
    const base = symbolClass.diameter * .5;
    return [
      "interpolate", ["linear"], ["zoom"],
      4, base * .66 + symbolClass.ring * .66,
      6, base * .76 + symbolClass.ring * .78,
      8, base * .9 + symbolClass.ring * .9,
      10, base + symbolClass.ring * .97,
      12, base * 1.08 + symbolClass.ring * 1.04
    ];
  };

  const metricColorExpression = (model) => {
    if (model?.demo && model.unit === "settlement") return "#5d9bab";
    if (model?.zeroColor) {
      const metric = ["number", ["feature-state", "metric"], 0];
      return [
        "case",
        ["!", ["boolean", ["feature-state", "hasValue"], false]], "#98a2b3",
        ["==", metric, 0], model.zeroColor,
        ...model.boundaries.slice(1, -1).flatMap((cut, index) => [["<=", metric, cut], model.colors[index]]),
        model.colors.at(-1)
      ];
    }
    const colors = model?.colors?.length === 5
      ? model.colors
      : ["#e5f2f4", "#b7dadd", "#78bbc1", "#3b8c99", "#115b70"];
    const boundaries = model?.boundaries?.length === 6
      ? model.boundaries
      : [0, 1, 2, 3, 4, 5];
    return [
      "case",
      ["!", ["boolean", ["feature-state", "hasValue"], false]],
      "#98a2b3",
      [
        "step",
        ["number", ["feature-state", "metric"], 0],
        colors[0],
        boundaries[1], colors[1],
        boundaries[2], colors[2],
        boundaries[3], colors[3],
        boundaries[4], colors[4]
      ]
    ];
  };

  const featureOpacityExpression = (normal, suppressed) => [
    "case",
    ["!", ["boolean", ["feature-state", "active"], false]], 0,
    ["boolean", ["feature-state", "suppressed"], false], suppressed,
    normal
  ];

  const buildShell = () => `
    <div class="mortality-map-shell">
      <section class="mortality-map-column">
        <header class="mortality-map-toolbar">
          <div class="react-map-chrome-host" data-react-map-chrome hidden></div>
          <div class="legacy-mortality-map-toolbar" data-legacy-map-chrome>
            <div>
              <span>Тематическая WebGL-карта</span>
              <b>Смертность по территориям</b>
            </div>
            <button type="button" data-mortality-fit>Весь регион</button>
          </div>
        </header>
        <div class="mortality-map" role="application" aria-label="Интерактивная карта смертности Амурской области"></div>
        <div class="map-death-summary" data-map-death-summary role="status" aria-atomic="true" hidden></div>
        <div class="mortality-map-status" hidden></div>
      </section>
      <aside class="map-side mortality-map-side">
        <div class="react-map-inspector-host" data-react-map-inspector hidden></div>
        <section class="site-map-selection-card" hidden></section>
        <div class="map-legend"></div>
        <div data-react-municipal-context></div>
        <h3>Наибольшие значения</h3>
        <div class="rank-list"></div>
      </aside>
    </div>`;

  const showStatus = (message, kind = "") => {
    const element = root?.querySelector(".mortality-map-status");
    if (!element) return;
    element.hidden = !message;
    element.textContent = message;
    element.className = `mortality-map-status ${kind}`.trim();
  };

  const selectedFeature = () => selected && currentModel && selected.kind === currentModel.unit
    ? currentModel.featuresById.get(Number(selected.id)) : null;
  const panels = () => window.AtlasLegacyBridge?.getMapChromeSummary?.();
  const narrow = () => matchMedia("(max-width: 1023px)").matches;
  const dockHidden = () => Boolean(panels()?.rightPanelOpen
    || narrow() && (panels()?.rightPanelOpen || panels()?.leftPanelOpen));
  const closeDetails = () => {
    detailsRequested = false;
    window.AtlasLegacyBridge?.setMapPanel("right", false);
    renderSelectionCard();
    cardDock?.update({ focus: true });
  };
  const openDetails = () => {
    if (!selectedFeature()) return;
    detailsRequested = true;
    if (narrow()) window.AtlasLegacyBridge?.setMapPanel("left", false);
    window.AtlasLegacyBridge?.setMapPanel("right", true);
    renderSelectionCard();
    const heading = root.querySelector(".site-map-selection-card h3");
    heading?.focus({ preventScroll: true });
    root.querySelector(".mortality-map-side")?.scrollTo({ top: 0 });
  };

  const renderLegendAndRank = () => {
    if (!root || !currentModel) return;
    const legend = root.querySelector(".map-legend");
    const rank = root.querySelector(".rank-list");
    const summary = root.querySelector("[data-map-death-summary]");
    summary.hidden = !currentModel.deathSummaryHtml;
    if (summary.innerHTML !== currentModel.deathSummaryHtml) summary.innerHTML = currentModel.deathSummaryHtml;
    legend.innerHTML = `
      <b>Проекция · EPSG:3857</b>
      <b>Цвет · ${escapeHtml(currentModel.legendMetricLabel || currentModel.metricLabel)}</b>
      ${currentModel.fixedLegendHtml || `<div class="legend-ramp"></div><div class="legend-range"><span>0 ${escapeHtml(currentModel.unitLabel)}</span><span>${escapeHtml(currentModel.maximumFormatted)}</span></div>`}
      ${currentModel.rateNoteHtml || ""}
      ${currentModel.unit === "settlement" ? currentModel.populationLegendHtml || "" : ""}
      ${currentModel.unit === "settlement" ? currentModel.settlementLabelLegendHtml || "" : currentModel.municipalityLabelLegendHtml || ""}
      ${currentModel.suppressSmallValues ? '<div class="site-map-legend-note">Малые значения n &lt; 5 приглушены</div>' : ""}
      <div class="legend-range"><span>${escapeHtml(currentModel.scaleLabel)}</span><span>Web Mercator</span></div>`;
    rank.innerHTML = currentModel.ranks.map((feature, index) => `
      <button type="button" class="rank-item${feature.suppressed ? " site-map-suppressed" : ""}" data-rank-kind="${feature.kind}" data-rank-id="${feature.id}">
        <span>${index + 1}. ${escapeHtml(feature.name)}</span>
        <b>${escapeHtml(feature.metricFormatted)}</b>
      </button>`).join("");
    rank.querySelectorAll("[data-rank-id]").forEach((button) => {
      button.addEventListener("click", event => {
        select(button.dataset.rankKind, Number(button.dataset.rankId), { fly: true, focus: event.detail === 0 });
      });
    });
    renderSelectionCard();
  };

  const renderSelectionCard = () => {
    const card = root?.querySelector(".site-map-selection-card");
    if (!card || !currentModel) return;
    const feature = selectedFeature();
    if (!feature || !detailsRequested) {
      card.hidden = true;
      if (card.innerHTML) card.innerHTML = "";
      cardDock?.update();
      return;
    }
    card.hidden = false;
    const hidden = feature.suppressed;
    const facts = currentModel.demo ? (currentModel.unit === "settlement" ? [[feature.populationLabel, feature.populationFormatted]] : [[currentModel.metricLabel, feature.metricFormatted], ["Единица", feature.card.unit], ["Источник", feature.card.basis]]) : [
      [currentModel.metricLabel, hidden ? "Менее 5" : feature.metricFormatted],
      [feature.populationLabel, feature.populationFormatted],
      ...(hidden || !feature.calculation ? [] : [["Расчёт", feature.calculation]]),
      ...(!hidden && feature.selectedFormatted !== feature.totalFormatted ? [["Всего смертей в группе", feature.totalFormatted], ["Выбранный класс", feature.selectedFormatted]] : []),
      ...(!hidden && feature.selectedFormatted !== feature.totalFormatted ? [["Доля класса", feature.shareFormatted]] : []),
      ...(!hidden ? [["Структура причин", feature.structure]] : [])
    ];
    const html = `<h3 tabindex="-1">${escapeHtml(feature.name)}</h3><p class="territory-detail-context">${escapeHtml(feature.card.context)}<br>${escapeHtml(feature.card.group)}</p>
      <dl class="territory-detail-grid">${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
      ${feature.populationNote ? `<p class="territory-detail-note">${escapeHtml(feature.populationNote)}</p>` : ""}
      <button type="button" class="territory-detail-return" data-card-return>Вернуться к карте</button>`;
    if (card.innerHTML !== html) card.innerHTML = html;
    cardDock?.update();
  };

  const applySelectionLayers = () => {
    if (!map?.getSource(`${PREFIX}municipalities`)) return;
    const moId = selected?.kind === "mo" ? Number(selected.id) : -1;
    const settlementId = selected?.kind === "settlement" ? Number(selected.id) : -1;
    if (map.getLayer(`${PREFIX}municipality-selected`)) {
      map.setFilter(`${PREFIX}municipality-selected`, ["==", ["id"], moId]);
    }
    if (map.getLayer(`${PREFIX}settlement-selected`)) {
      map.setFilter(`${PREFIX}settlement-selected`, ["==", ["id"], settlementId]);
    }
  };

  const clearSelection = () => {
    selected = null;
    pendingSelection = null;
    detailsRequested = false;
    hoverPopup?.remove();
    applySelectionLayers();
    renderSelectionCard();
    window.dispatchEvent(new CustomEvent("atlas:mortality-selection", { detail: null }));
  };

  const extendBounds = (coordinates, bounds) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number") {
      bounds.extend(coordinates);
      return;
    }
    coordinates.forEach((item) => extendBounds(item, bounds));
  };

  const flyToFeature = (kind, id) => {
    if (!map || !sourceData) return;
    const collection = kind === "mo" ? sourceData.municipalities : sourceData.settlements;
    const feature = collection.features.find((item) => Number(item.id ?? item.properties?.id) === Number(id));
    if (!feature) return;
    if (kind === "settlement") {
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 9.2), duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420 });
      return;
    }
    const bounds = new window.maplibregl.LngLatBounds();
    extendBounds(feature.geometry.coordinates, bounds);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 70, maxZoom: 10.5, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 460 });
    }
  };

  const select = (kind, id, options = {}) => {
    const normalizedKind = kind === "mo" ? "mo" : "settlement";
    const numericId = Number(id);
    if (!currentModel || currentModel.unit !== normalizedKind || !currentModel.featuresById.has(numericId)) {
      pendingSelection = { kind: normalizedKind, id: numericId, options };
      return;
    }
    selected = { kind: normalizedKind, id: numericId };
    pendingSelection = null;
    detailsRequested = false;
    hoverPopup?.remove();
    if (narrow()) {
      window.AtlasLegacyBridge?.setMapPanel("left", false);
      window.AtlasLegacyBridge?.setMapPanel("right", false);
    }
    applySelectionLayers();
    renderSelectionCard();
    window.dispatchEvent(new CustomEvent("atlas:mortality-selection", {
      detail: { kind: normalizedKind, id: numericId }
    }));
    if (options.fly !== false) flyToFeature(normalizedKind, numericId);
    cardDock?.update({ focus: Boolean(options.focus) });
  };

  const fitRegion = (animate = true) => {
    if (!map || !sourceData?.settlements?.features?.length) return;
    const points = sourceData.settlements.features.map((feature) => feature.geometry.coordinates);
    const bounds = points.reduce(
      (box, coordinate) => box.extend(coordinate),
      new window.maplibregl.LngLatBounds(points[0], points[0])
    );
    map.fitBounds(bounds, {
      padding: { top: 42, right: 48, bottom: 42, left: 48 },
      duration: animate ? 480 : 0,
      maxZoom: 6.2
    });
  };

  const addSourcesAndLayers = (data) => {
    map.addSource(`${PREFIX}region-mask`, { type: "geojson", data: data.regionMask });
    map.addSource(`${PREFIX}municipalities`, { type: "geojson", data: data.municipalities });
    map.addSource(`${PREFIX}settlements`, { type: "geojson", data: data.settlements });

    map.addLayer({
      id: `${PREFIX}region-mask`,
      type: "fill",
      source: `${PREFIX}region-mask`,
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": .7,
        "fill-outline-color": "rgba(255,255,255,0)"
      }
    });
    map.addLayer({
      id: `${PREFIX}municipality-context`,
      type: "fill",
      source: `${PREFIX}municipalities`,
      paint: { "fill-color": "#dce6ee", "fill-opacity": .28 }
    });
    map.addLayer({
      id: `${PREFIX}municipality-theme`,
      type: "fill",
      source: `${PREFIX}municipalities`,
      paint: {
        "fill-color": metricColorExpression(currentModel),
        "fill-opacity": featureOpacityExpression(.82, .16)
      }
    });
    map.addLayer({
      id: `${PREFIX}municipality-line`,
      type: "line",
      source: `${PREFIX}municipalities`,
      paint: {
        "line-color": "#080808",
        "line-opacity": .2,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, .75, 10, 1.25, 14, 1.7]
      }
    });
    map.addLayer({
      id: `${PREFIX}municipality-selected`,
      type: "line",
      source: `${PREFIX}municipalities`,
      filter: ["==", ["id"], -1],
      paint: {
        "line-color": "#f4b400",
        "line-opacity": .95,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 10, 4]
      }
    });

    SETTLEMENT_SYMBOL_CLASSES.forEach((symbolClass) => {
      const thematicColor = metricColorExpression(currentModel);
      const paint = symbolClass.donut
        ? {
            "circle-radius": radiusExpression(symbolClass),
            "circle-color": "rgba(255,255,255,.44)",
            "circle-opacity": featureOpacityExpression(.82, .18),
            "circle-stroke-color": thematicColor,
            "circle-stroke-opacity": featureOpacityExpression(.9, .22),
            "circle-stroke-width": donutStrokeExpression(symbolClass)
          }
        : {
            "circle-radius": radiusExpression(symbolClass),
            "circle-color": thematicColor,
            "circle-opacity": featureOpacityExpression(.88, .18),
            "circle-stroke-color": "#324b62",
            "circle-stroke-opacity": featureOpacityExpression(.76, .22),
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, .55, 9, .9, 12, 1.1]
          };
      map.addLayer({
        id: `${PREFIX}settlement-${symbolClass.code}`,
        type: "circle",
        source: `${PREFIX}settlements`,
        filter: ["==", ["get", "population_class"], symbolClass.code],
        paint
      });
      if (symbolClass.donut) {
        map.addLayer({
          id: `${PREFIX}settlement-${symbolClass.code}-inner-outline`,
          type: "circle",
          source: `${PREFIX}settlements`,
          filter: ["==", ["get", "population_class"], symbolClass.code],
          paint: {
            "circle-radius": radiusExpression(symbolClass),
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#324b62",
            "circle-stroke-opacity": featureOpacityExpression(.82, .2),
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, .7, 9, 1, 12, 1.2]
          }
        });
        map.addLayer({
          id: `${PREFIX}settlement-${symbolClass.code}-outline`,
          type: "circle",
          source: `${PREFIX}settlements`,
          filter: ["==", ["get", "population_class"], symbolClass.code],
          paint: {
            "circle-radius": donutOuterRadiusExpression(symbolClass),
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#324b62",
            "circle-stroke-opacity": featureOpacityExpression(.82, .2),
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, .75, 9, 1.05, 12, 1.25]
          }
        });
      }
    });
    map.addLayer({
      id: `${PREFIX}settlement-missing`,
      type: "circle",
      source: `${PREFIX}settlements`,
      filter: ["<=", ["coalesce", ["get", "population2021"], 0], 0],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 10, 3.4],
        "circle-color": metricColorExpression(currentModel),
        "circle-opacity": featureOpacityExpression(.72, .16),
        "circle-stroke-color": "#63758a",
        "circle-stroke-opacity": featureOpacityExpression(.8, .2),
        "circle-stroke-width": 1
      }
    });
    map.addLayer({
      id: `${PREFIX}settlement-selected`,
      type: "circle",
      source: `${PREFIX}settlements`,
      filter: ["==", ["id"], -1],
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, ["+", ["*", ["coalesce", ["get", "diameter_px"], 7], .33], 6],
          8, ["+", ["*", ["coalesce", ["get", "diameter_px"], 7], .45], 6],
          12, ["+", ["*", ["coalesce", ["get", "diameter_px"], 7], .54], 6]
        ],
        "circle-color": "rgba(244,180,0,.08)",
        "circle-stroke-color": "#f4b400",
        "circle-stroke-width": 2.4
      }
    });

    map.addLayer({
      id: `${PREFIX}city-label`,
      type: "symbol",
      source: `${PREFIX}settlements`,
      filter: ["==", ["get", "is_city"], true],
      minzoom: 5,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 8, 13.5, 11, 15],
        "text-offset": [0, 1.15],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#17304d",
        "text-halo-color": "rgba(255,255,255,.86)",
        "text-halo-width": 1.25
      }
    });
    map.addLayer({
      id: `${PREFIX}settlement-label-major`,
      type: "symbol",
      source: `${PREFIX}settlements`,
      filter: ["all", ["==", ["get", "is_city"], false], [">=", ["coalesce", ["get", "population2021"], 0], 2500]],
      minzoom: 7.2,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7.2, 9.5, 10, 10.5, 12, 11.5],
        "text-offset": [0, 1],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#40546b",
        "text-halo-color": "rgba(255,255,255,.84)",
        "text-halo-width": 1
      }
    });
    map.addLayer({
      id: `${PREFIX}settlement-label-minor`,
      type: "symbol",
      source: `${PREFIX}settlements`,
      filter: ["all", ["==", ["get", "is_city"], false], ["<", ["coalesce", ["get", "population2021"], 0], 2500]],
      minzoom: 9.6,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9.6, 9, 12, 10.5, 14, 11.5],
        "text-offset": [0, .9],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#5a6879",
        "text-halo-color": "rgba(255,255,255,.82)",
        "text-halo-width": .9
      }
    });
  };

  const stateSignature = (feature) => [
    feature.metricValue,
    feature.active ? 1 : 0,
    feature.suppressed ? 1 : 0
  ].join("|");

  const applyFeatureStates = () => {
    if (!map || !currentModel) return;
    const source = currentModel.unit === "mo"
      ? `${PREFIX}municipalities`
      : `${PREFIX}settlements`;
    if (!map.getSource(source)) return;
    const cache = appliedFeatureState[currentModel.unit];
    currentModel.features.forEach((feature) => {
      const signature = stateSignature(feature);
      if (cache.get(feature.id) === signature) return;
      cache.set(feature.id, signature);
      map.setFeatureState(
        { source, id: Number(feature.id) },
        {
          metric: Number.isFinite(feature.metricValue) ? feature.metricValue : 0,
          hasValue: Number.isFinite(feature.metricValue),
          active: feature.active,
          suppressed: feature.suppressed
        }
      );
    });
  };

  const applyPaint = () => {
    if (!map || !currentModel) return;
    const color = metricColorExpression(currentModel);
    const targets = [
      [`${PREFIX}municipality-theme`, "fill-color"],
      [`${PREFIX}settlement-missing`, "circle-color"],
      ...SETTLEMENT_SYMBOL_CLASSES.map((item) => [
        `${PREFIX}settlement-${item.code}`,
        item.donut ? "circle-stroke-color" : "circle-color"
      ])
    ];
    targets.forEach(([layerId, property]) => {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, color);
    });
  };

  const applyVisibility = () => {
    if (!map || !currentModel) return;
    const settlements = currentModel.unit === "settlement";
    setVisibility(`${PREFIX}municipality-theme`, !settlements);
    setVisibility(`${PREFIX}municipality-selected`, !settlements);
    SETTLEMENT_LAYER_IDS.forEach((layerId) => setVisibility(layerId, settlements));
    DONUT_OUTLINE_LAYER_IDS.forEach((layerId) => setVisibility(layerId, settlements));
    DONUT_INNER_OUTLINE_LAYER_IDS.forEach((layerId) => setVisibility(layerId, settlements));
    setVisibility(`${PREFIX}settlement-missing`, settlements);
    setVisibility(`${PREFIX}settlement-selected`, settlements);
    const labelsEnabled = currentModel.labels !== "off";
    setVisibility(`${PREFIX}city-label`, labelsEnabled);
    setVisibility(`${PREFIX}settlement-label-major`, settlements && currentModel.labels === "auto");
    setVisibility(`${PREFIX}settlement-label-minor`, settlements && currentModel.labels === "auto");
  };

  const applyModel = (renderSide = true) => {
    if (!currentModel || !root) return;
    hoverPopup?.remove();
    if (renderSide) renderLegendAndRank();
    if (!map?.getSource(`${PREFIX}municipalities`)) return;
    if (appliedUnit !== currentModel.unit) {
      appliedUnit = currentModel.unit;
      const request = pendingSelection;
      clearSelection();
      pendingSelection = request;
    }
    applyFeatureStates();
    applyPaint();
    applyVisibility();
    applySelectionLayers();
    if (pendingSelection?.kind === currentModel.unit) {
      const request = pendingSelection;
      pendingSelection = null;
      select(request.kind, request.id, request.options);
    }
  };

  const interactiveLayers = () => currentModel?.unit === "mo"
    ? [`${PREFIX}municipality-theme`]
    : [...SETTLEMENT_LAYER_IDS, `${PREFIX}settlement-missing`];

  const featureFromRendered = (rendered) => {
    if (!rendered || !currentModel) return null;
    const id = Number(rendered.id ?? rendered.properties?.id);
    return currentModel.featuresById.get(id) || null;
  };

  const bindInteractions = () => {
    interactionAbort = new AbortController();
    cardDock = window.AmurTerritoryCard.createDock({
      container: map.getContainer(), map,
      getData: () => selectedFeature()?.card || null,
      getItems: () => currentModel?.features || [],
      onSelect: (id, options) => select(currentModel.unit, id, options),
      onClear: clearSelection, onDetails: openDetails, isHidden: dockHidden
    });
    root.addEventListener("click", event => {
      if (event.target.closest("[data-card-return]")) closeDetails();
    }, { signal: interactionAbort.signal });
    document.addEventListener("keydown", event => {
      if (root?.isConnected && detailsRequested && panels()?.rightPanelOpen && event.key === "Escape") {
        closeDetails();
        event.stopImmediatePropagation();
      }
    }, { signal: interactionAbort.signal, capture: true });
    hoverPopup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16,
      maxWidth: "200px",
      focusAfterOpen: false,
      className: "mortality-hover-popup"
    });
    map.on("mousemove", (event) => {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        if (!map || !window.AtlasInteraction?.canHover(event.originalEvent) || map.isMoving()) { hoverPopup?.remove(); return; }
        const layers = interactiveLayers().filter((layerId) => map.getLayer(layerId));
        const rendered = map.queryRenderedFeatures(event.point, { layers })[0];
        const feature = featureFromRendered(rendered);
        map.getCanvas().style.cursor = feature ? "pointer" : "";
        if (!feature || selected?.id === feature.id && selected?.kind === feature.kind) {
          hoverPopup.remove();
          return;
        }
        hoverPopup
          .setLngLat(event.lngLat)
          .setHTML(window.AmurTerritoryCard.render(feature.card))
          .addTo(map);
      });
    });
    map.on("movestart", () => { cancelAnimationFrame(hoverFrame); hoverPopup?.remove(); });
    map.getCanvas().addEventListener("mouseleave", () => {
      cancelAnimationFrame(hoverFrame);
      map.getCanvas().style.cursor = "";
      hoverPopup?.remove();
    });
    map.on("click", (event) => {
      const layers = interactiveLayers().filter((layerId) => map.getLayer(layerId));
      const rendered = map.queryRenderedFeatures(event.point, { layers })[0];
      const feature = featureFromRendered(rendered);
      if (!feature) {
        clearSelection();
        return;
      }
      hoverPopup?.remove();
      select(feature.kind, feature.id, { fly: false });
    });
  };

  const destroy = () => {
    mountToken += 1;
    basemap?.destroy();
    basemap = null;
    cancelAnimationFrame(hoverFrame);
    hoverPopup?.remove();
    cardDock?.destroy();
    cardDock = null;
    interactionAbort?.abort();
    interactionAbort = null;
    detailsRequested = false;
    hoverPopup = null;
    if (map) {
      map.remove();
      map = null;
    }
    root = null;
    sourceData = null;
    currentModel = null;
    appliedUnit = "";
    selected = null;
    pendingSelection = null;
    appliedFeatureState.mo.clear();
    appliedFeatureState.settlement.clear();
  };

  const update = (model) => {
    currentModel = model;
    applyModel();
  };

  const mount = async (container, model) => {
    if (!container) return;
    if (root?.isConnected && root.parentElement === container && map) {
      update(model);
      map.resize();
      return;
    }
    destroy();
    const token = ++mountToken;
    currentModel = model;
    container.innerHTML = buildShell();
    root = container.querySelector(".mortality-map-shell");
    renderLegendAndRank();
    root.querySelector("[data-mortality-fit]")?.addEventListener("click", () => fitRegion(true));
    showStatus("Загружаем картографический движок…");
    try {
      const [maplibregl, data] = await Promise.all([ensureMapLibre(), ensureData()]);
      if (token !== mountToken || !root?.isConnected) return;
      sourceData = data;
      map = new maplibregl.Map({
        container: root.querySelector(".mortality-map"),
        style: window.AmurBasemap.localStyle(),
        center: [128.3, 52.8],
        zoom: 5.1,
        minZoom: 3.5,
        maxZoom: 15.5,
        attributionControl: false,
        fadeDuration: 0,
        pitchWithRotate: false
      });
      map.getContainer().append(root.querySelector(".mortality-map-status"));
      const summary = root.querySelector("[data-map-death-summary]");
      map.getContainer().append(summary);
      summary.hidden = false;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => {
        if (token !== mountToken) return;
        addSourcesAndLayers(data);
        bindInteractions();
        fitRegion(false);
        showStatus("");
        applyModel(false);
        basemap = window.AmurBasemap.attach(map, {
          beforeId: `${PREFIX}region-mask`,
          onChange: ({ state }) => {
            if (token !== mountToken) return;
            showStatus(state === "local"
              ? "Внешняя подложка недоступна. Локальные границы, показатели и выбор объектов работают."
              : "", state === "local" ? "is-warning" : "");
          }
        });
      });
      map.on("error", (event) => {
        if (event.sourceId?.startsWith(PREFIX)) {
          showStatus("Не удалось загрузить тематический слой карты.", "is-error");
        }
      });
    } catch (error) {
      console.error(error);
      if (token !== mountToken || !root) return;
      showStatus(`Не удалось открыть карту: ${error.message}`, "is-error");
    }
  };

  const resize = () => map?.resize();

  const debug = () => ({
    mounted: Boolean(map),
    loaded: Boolean(map?.loaded()),
    basemap: basemap?.getStatus() || null,
    unit: currentModel?.unit || null,
    features: currentModel?.features?.length || 0,
    selected,
    card: selectedFeature()?.card || null,
    zoom: map?.getZoom() ?? null,
    moving: Boolean(map?.isMoving()),
    sampleModelId: currentModel?.features?.find((feature) => feature.active)?.id
      ?? currentModel?.features?.[0]?.id
      ?? null,
    featureStateCacheSize: currentModel ? appliedFeatureState[currentModel.unit].size : 0,
    sampleFeatureState: map?.getSource(`${PREFIX}municipalities`) && currentModel?.features?.length
      ? map.getFeatureState({
          source: currentModel.unit === "mo" ? `${PREFIX}municipalities` : `${PREFIX}settlements`,
          id: Number(currentModel.features.find((feature) => feature.active)?.id ?? currentModel.features[0].id)
        })
      : null,
    sourceFeatureIds: map?.getSource(`${PREFIX}municipalities`) && currentModel
      ? map.querySourceFeatures(
          currentModel.unit === "mo" ? `${PREFIX}municipalities` : `${PREFIX}settlements`
        ).slice(0, 8).map((feature) => feature.id)
      : [],
    layers: map?.getStyle()?.layers?.filter((layer) => layer.id.startsWith(PREFIX)).map((layer) => layer.id) || []
  });

  const getSelection = () => selected && currentModel && selected.kind === currentModel.unit ? { ...selected } : null;
  window.AmurMortalityMap = { mount, update, destroy, resize, select, openDetails, clearSelection, getSelection, debug };
})();
