(() => {
  "use strict";

  const MAPLIBRE_VERSION = "5.24.0";
  const MAPLIBRE_SCRIPT = `assets/vendor/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.js`;
  const MAPLIBRE_STYLE = `assets/vendor/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.css`;
  const DATA_SCRIPT = "data/infrastructure-data.js?v=3db472f7fc21";
  const ROADS_DATA_SCRIPT = "data/roads-data.js?v=d591b5212c3e";
  const FACILITY_ICON_ROOT = "assets/icons/medical-facilities";

  const ROAD_PALETTES = {
    warm: {
      trunk: "#B7864F",
      primary: "#708696",
      secondary: "#9BA9B3",
      tertiary: "#C4CBD0"
    },
    neutral: {
      trunk: "#657A8B",
      primary: "#81939F",
      secondary: "#A4B1B9",
      tertiary: "#CAD1D5"
    }
  };
  const ROAD_LAYER_CLASSES = ["trunk", "primary", "secondary", "tertiary"];

  const FACILITY_TYPES = [
    { code: "hospital", label: "Больницы", color: "#2563EB", iconFile: "hospital.svg" },
    { code: "polyclinic", label: "Поликлиники", color: "#059669", iconFile: "polyclinic.svg" },
    { code: "fap", label: "ФАП", color: "#D97706", iconFile: "fap.svg" },
    { code: "ambulatory", label: "Амбулатории", color: "#0891B2", iconFile: "ambulatory.svg" },
    { code: "maternity", label: "Родильные дома", color: "#BE185D", iconFile: "maternity.svg" },
    { code: "consultation", label: "Консультации", color: "#EA580C", iconFile: "consultation.svg" },
    { code: "rehabilitation", label: "Реабилитация", color: "#7C3AED", iconFile: "rehabilitation.svg" },
    { code: "health_post", label: "Здравпункты", color: "#64748B", iconFile: "health-post.svg" }
  ];

  const TYPE_BY_CODE = new Map(FACILITY_TYPES.map((item) => [item.code, item]));
  const CUSTOM_LAYER_PREFIX = "amur-infra-";
  const DONUT_IMAGE_PREFIX = `${CUSTOM_LAYER_PREFIX}facility-donut-`;
  const FACILITY_COUNT_KEYS = FACILITY_TYPES.map((item) => `${item.code}_count`);
  const FACILITY_CLUSTER_PROPERTIES = Object.fromEntries(FACILITY_TYPES.map((item) => [
    `${item.code}_count`,
    ["+", ["case", ["==", ["get", "facility_code"], item.code], 1, 0]]
  ]));
  const POPULATION_CLASSES = [
    ["до 1 тыс.", 6],
    ["1–2,5 тыс.", 8],
    ["2,5–5 тыс.", 12],
    ["5–10 тыс.", 17],
    ["10–20 тыс.", 21],
    ["20–40 тыс.", 26],
    ["40–200 тыс.", 42, true],
    ["> 200 тыс.", 62, true]
  ];
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
  const SETTLEMENT_POINT_LAYER_NAMES = [
    ...SETTLEMENT_SYMBOL_CLASSES.map((item) => `settlement-${item.code}`),
    "settlement-missing"
  ];

  let map = null;
  let mountToken = 0;
  let dataPromise = null;
  let roadsDataPromise = null;
  let mapLibrePromise = null;
  let infrastructureData = null;
  let regionFitPending = false;
  let clusteredFacilityInputCount = 0;
  let basemap = null;
  let resourceModel = null;
  let resourceHover = null;
  let territoryDock = null;
  let networkSelection = null;
  let resourceDetailsOpen = false;
  let resourceHoverFrame = 0;
  let activeFacilityTypes = new Set(["hospital"]);
  let layerState = {
    isochrone20: true,
    isochrone60: true,
    municipalities: true,
    settlements: false,
    settlementLabels: true,
    roadsMode: "main",
    roadPalette: "warm",
    roadLabels: false,
    basemap: true,
    isochroneOpacity: 1
  };

  const escapeHtml = (value) => String(value ?? "").replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]
  );

  const formatNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU").format(number) : "нет данных";
  };

  const formatPercent = (value) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(number)}%`
      : "нет данных";
  };

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
      if (existing.dataset.loaded === "true") resolve();
      else {
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

  const ensureRoadsData = () => {
    if (window.AMUR_ROADS_DATA) return Promise.resolve(window.AMUR_ROADS_DATA);
    if (!roadsDataPromise) {
      roadsDataPromise = loadScript(ROADS_DATA_SCRIPT, "amur-roads-data").then(
        () => window.AMUR_ROADS_DATA
      );
    }
    return roadsDataPromise;
  };

  const facilityIconUrl = (item) => `${FACILITY_ICON_ROOT}/${item.iconFile}`;
  const facilityMapIconUrl = (item) => (
    infrastructureData?.facilityIcons?.[item.code] || facilityIconUrl(item)
  );

  const iconMarkup = (item) => `
    <span class="infra-card-icon" style="--infra-icon:${item.color}" aria-hidden="true">
      <img src="${facilityIconUrl(item)}" alt="" width="28" height="28">
    </span>`;

  const buildPanel = (data) => {
    const counts = data.meta.facility_counts || {};
    const coverageByMinutes = new Map(
      (data.meta.isochrone_population_coverage || []).map((item) => [Number(item.minutes), item])
    );
    const coverageMarkup = (minutes) => {
      const coverage = coverageByMinutes.get(minutes) || {};
      return `
        <span class="infra-access-coverage" aria-label="Охват населения">
          <b>${formatNumber(coverage.population)}</b>
          <small>${formatPercent(coverage.share_percent)}</small>
        </span>`;
    };
    const facilityCards = FACILITY_TYPES.map((item) => {
      const active = activeFacilityTypes.has(item.code);
      return `
        <button class="infra-layer-card ${active ? "is-active" : ""}" type="button" data-facility-type="${item.code}" aria-pressed="${active}">
          ${iconMarkup(item)}
          <span><b>${escapeHtml(item.label)}</b><small>${formatNumber(counts[item.code] || 0)} объектов</small></span>
          <i aria-hidden="true"></i>
        </button>`;
    }).join("");

    const populationLegend = POPULATION_CLASSES.map(([label, diameter, donut]) => {
      const shown = Math.max(5, Math.min(22, diameter * .42));
      return `
        <span class="infra-pop-item">
          <i class="${donut ? "is-donut" : ""}" style="--pop-size:${shown}px"></i>
          <small>${label}</small>
        </span>`;
    }).join("");

    return `
      <aside class="infra-layer-composer" aria-label="Управление слоями инфраструктурной карты">
        <header class="infra-panel-head">
          <div class="react-infra-panel-host" data-react-infra-panel hidden></div>
          <div data-legacy-infra-panel><span>Состав карты</span><h3>Инфраструктура и доступность больниц</h3></div>
          <button class="infra-panel-collapse" data-legacy-infra-panel-toggle type="button" aria-label="Свернуть панель" title="Свернуть панель">‹</button>
        </header>
        <div class="infra-panel-scroll">
          <div data-react-infra-resources></div>
          <section class="infra-layer-group">
            <div class="infra-group-title"><span>Медицинские учреждения</span><small>${formatNumber(data.meta.facilities)}</small></div>
            <div class="infra-quick-actions">
              <button type="button" data-facility-action="all">Показать все</button>
              <button type="button" data-facility-action="none">Снять все</button>
            </div>
            <div class="infra-card-grid">${facilityCards}</div>
            <div class="infra-cluster-key">
              <span class="infra-cluster-key-donut" aria-hidden="true"></span>
              <p><b>Как читать кластер</b><small>Толщина — число объектов; сектора — реальные доли; точка — ведущий тип.</small></p>
            </div>
          </section>
          <section class="infra-layer-group">
            <div class="infra-group-title"><span>Доступность от больниц</span><small>изохроны</small></div>
            <div class="infra-wide-card-grid">
              <button class="infra-wide-card is-active is-iso-20" type="button" data-layer-toggle="isochrone20" aria-pressed="true">
                <i></i><span><b>До 20 минут</b><small>зона доступности от больниц</small></span>${coverageMarkup(20)}
              </button>
              <button class="infra-wide-card is-active is-iso-60" type="button" data-layer-toggle="isochrone60" aria-pressed="true">
                <i></i><span><b>До 60 минут</b><small>расширенная зона от больниц</small></span>${coverageMarkup(60)}
              </button>
            </div>
            <p class="infra-access-note">Охват населения · перепись 2021.</p>
            <label class="infra-range-label" for="infraIsoOpacity">
              <span>Прозрачность зон</span><output>100%</output>
            </label>
            <input id="infraIsoOpacity" class="infra-range" type="range" min="20" max="100" step="5" value="100">
          </section>
          <section class="infra-layer-group">
            <div class="infra-group-title"><span>Территориальный контекст</span><small>2021</small></div>
            <div class="infra-context-grid">
              <button class="infra-context-card is-active" type="button" data-layer-toggle="municipalities" aria-pressed="true">
                <span class="infra-context-symbol is-boundary"></span><b>Границы МО</b><small>${formatNumber(data.meta.municipalities)}</small>
              </button>
              <button class="infra-context-card" type="button" data-layer-toggle="settlements" aria-pressed="false">
                <span class="infra-context-symbol is-settlement"></span><b>Населённые пункты</b><small>${formatNumber(data.meta.settlements)}</small>
              </button>
              <button class="infra-context-card is-active" type="button" data-layer-toggle="settlementLabels" aria-pressed="true">
                <span class="infra-context-symbol is-label">Аа</span><b>Подписи НП</b><small>по масштабу</small>
              </button>
            </div>
            <div class="infra-population-legend">
              <b>Размер НП · население 2021</b>
              <div>${populationLegend}</div>
              <p>Кольца: население свыше 40 тыс. человек.</p>
            </div>
          </section>
        </div>
      </aside>`;
  };

  const buildShell = (data) => `
    <div class="infra-shell">
      ${buildPanel(data)}
      <section class="infra-map-column">
        <div class="infra-map-toolbar">
          <div class="react-infra-chrome-host" data-react-infra-chrome hidden></div>
          <div class="legacy-infra-map-toolbar" data-legacy-infra-chrome>
            <div><b>Карта медицинской инфраструктуры</b></div>
            <button class="infra-fit-button" type="button" title="Показать всю Амурскую область">Вся область</button>
          </div>
        </div>
        <div class="infra-map" role="application" aria-label="Интерактивная карта медицинской инфраструктуры Амурской области"></div>
        <div class="infra-map-status" role="status">Загрузка картографического движка…</div>
      </section>
      <aside class="map-workspace-information" id="medicalMapInformation" aria-label="Сведения медицинской карты" aria-hidden="true" inert>
        <header><h3 tabindex="-1">Сеть и доступность</h3><button type="button" data-medical-information-close aria-label="Закрыть сведения медицинской карты">×</button></header>
        <div class="map-workspace-information__scroll"><div data-network-information></div><div data-resource-information></div></div>
      </aside>
    </div>`;

  const emptyStyle = {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#edf3f7" } }]
  };

  const loadMapImage = (mapInstance, name, url) => new Promise((resolve, reject) => {
    const image = new Image(64, 64);
    image.onload = () => {
      if (!mapInstance.hasImage(name)) mapInstance.addImage(name, image, { pixelRatio: 2 });
      resolve();
    };
    image.onerror = reject;
    image.src = url;
  });

  const clusterDonutMetrics = (count) => {
    if (count < 10) return { diameter: 36, ring: 7 };
    if (count < 30) return { diameter: 44, ring: 8 };
    if (count < 75) return { diameter: 52, ring: 9 };
    return { diameter: 60, ring: 10 };
  };

  const clusterDonutImage = (counts, total) => {
    const { diameter, ring } = clusterDonutMetrics(total);
    const pixelRatio = 2;
    const size = diameter * pixelRatio;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const center = size / 2;
    const radius = (diameter / 2 - ring / 2 - 1.4) * pixelRatio;
    const lineWidth = ring * pixelRatio;
    const sum = Math.max(1, counts.reduce((accumulator, value) => accumulator + value, 0));
    const dominantValue = Math.max(...counts);
    const dominantIndex = counts.indexOf(dominantValue);
    let angle = -Math.PI / 2;

    context.clearRect(0, 0, size, size);
    counts.forEach((value, index) => {
      if (!value) return;
      const sweep = (value / sum) * Math.PI * 2;
      const gap = Math.min(.024, sweep * .15);
      context.beginPath();
      context.arc(center, center, radius, angle + gap, angle + sweep - gap);
      context.strokeStyle = FACILITY_TYPES[index].color;
      context.lineWidth = lineWidth;
      context.lineCap = "butt";
      context.stroke();
      angle += sweep;
    });

    context.beginPath();
    context.arc(center, center, (diameter / 2 - .8) * pixelRatio, 0, Math.PI * 2);
    context.strokeStyle = "rgba(30, 51, 69, .72)";
    context.lineWidth = .9 * pixelRatio;
    context.stroke();
    context.beginPath();
    context.arc(center, center, (diameter / 2 - ring - 1.2) * pixelRatio, 0, Math.PI * 2);
    context.fillStyle = "rgba(250, 252, 253, .96)";
    context.fill();
    context.strokeStyle = "rgba(57, 76, 92, .32)";
    context.lineWidth = .8 * pixelRatio;
    context.stroke();
    if (dominantIndex >= 0 && dominantValue > 0) {
      const innerRadius = (diameter / 2 - ring - 1.2) * pixelRatio;
      context.beginPath();
      context.arc(
        center,
        center + innerRadius * .65,
        Math.max(1.7, diameter * .042) * pixelRatio,
        0,
        Math.PI * 2
      );
      context.fillStyle = FACILITY_TYPES[dominantIndex].color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,.96)";
      context.lineWidth = 1.1 * pixelRatio;
      context.stroke();
    }
    return context.getImageData(0, 0, size, size);
  };

  const clusterDonutIconExpression = () => [
    "concat",
    DONUT_IMAGE_PREFIX,
    ["to-string", ["get", "point_count"]],
    ...FACILITY_COUNT_KEYS.flatMap((key) => [
      "-",
      ["to-string", ["coalesce", ["get", key], 0]]
    ])
  ];

  const installClusterDonutGenerator = () => {
    map.on("styleimagemissing", (event) => {
      if (!event.id.startsWith(DONUT_IMAGE_PREFIX) || map.hasImage(event.id)) return;
      const values = event.id.slice(DONUT_IMAGE_PREFIX.length).split("-").map(Number);
      if (values.length !== FACILITY_TYPES.length + 1 || values.some((value) => !Number.isFinite(value))) return;
      const [total, ...counts] = values;
      map.addImage(event.id, clusterDonutImage(counts, total), { pixelRatio: 2 });
    });
  };

  const facilityFilter = () => ["!", ["has", "point_count"]];

  const setLayerVisibility = (id, visible) => {
    if (!map || !map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  };

  const syncFacilityFilter = () => {
    if (!map || !map.getLayer(`${CUSTOM_LAYER_PREFIX}facilities`)) return;
    const source = map.getSource(`${CUSTOM_LAYER_PREFIX}facilities`);
    if (source && infrastructureData?.facilities) {
      const filteredFeatures = infrastructureData.facilities.features.filter(
        (feature) => activeFacilityTypes.has(feature.properties.facility_code)
      );
      clusteredFacilityInputCount = filteredFeatures.length;
      source.setData({
        type: "FeatureCollection",
        features: filteredFeatures
      });
    }
    map.setFilter(`${CUSTOM_LAYER_PREFIX}facilities`, facilityFilter());
    map.setFilter(`${CUSTOM_LAYER_PREFIX}facility-stack`, [
      "all",
      facilityFilter(),
      [">", ["get", "stack_size"], 1]
    ]);
  };

  const roadClassVisible = (roadClass) => {
    if (layerState.roadsMode === "hidden") return false;
    if (roadClass === "tertiary") return layerState.roadsMode === "all";
    return true;
  };

  const syncRoadState = () => {
    if (!map) return;
    const palette = ROAD_PALETTES[layerState.roadPalette] || ROAD_PALETTES.warm;
    ROAD_LAYER_CLASSES.forEach((roadClass) => {
      const visible = roadClassVisible(roadClass);
      const lineId = `${CUSTOM_LAYER_PREFIX}road-${roadClass}-line`;
      setLayerVisibility(lineId, visible);
      if (map.getLayer(lineId)) map.setPaintProperty(lineId, "line-color", palette[roadClass]);
      if (["trunk", "primary"].includes(roadClass)) {
        setLayerVisibility(`${CUSTOM_LAYER_PREFIX}road-${roadClass}-casing`, visible);
      }
    });
    setLayerVisibility(
      `${CUSTOM_LAYER_PREFIX}road-label-major`,
      layerState.roadLabels && layerState.roadsMode !== "hidden"
    );
    setLayerVisibility(
      `${CUSTOM_LAYER_PREFIX}road-label-secondary`,
      layerState.roadLabels && layerState.roadsMode !== "hidden"
    );
    setLayerVisibility(
      `${CUSTOM_LAYER_PREFIX}road-label-tertiary`,
      layerState.roadLabels && layerState.roadsMode === "all"
    );
  };

  const syncLayerState = () => {
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}iso20-fill`, layerState.isochrone20 && !resourceModel);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}iso20-line`, layerState.isochrone20 && !resourceModel);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}iso60-fill`, layerState.isochrone60 && !resourceModel);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}iso60-line`, layerState.isochrone60 && !resourceModel);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}municipality-fill`, Boolean(resourceModel) || layerState.municipalities);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}municipality-line`, Boolean(resourceModel) || layerState.municipalities);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}municipality-label`, Boolean(resourceModel) || layerState.municipalities);
    setLayerVisibility(`${CUSTOM_LAYER_PREFIX}resource-selection`, Boolean(resourceModel) || layerState.municipalities && networkSelection !== null);
    SETTLEMENT_POINT_LAYER_NAMES.forEach(
      (name) => setLayerVisibility(`${CUSTOM_LAYER_PREFIX}${name}`, layerState.settlements)
    );
    [
      "city-label", "settlement-label-major", "settlement-label-minor"
    ].forEach((name) => setLayerVisibility(
      `${CUSTOM_LAYER_PREFIX}${name}`,
      layerState.settlementLabels
    ));
    basemap?.setVisible(layerState.basemap);
    if (map.getLayer(`${CUSTOM_LAYER_PREFIX}iso20-fill`)) {
      map.setPaintProperty(`${CUSTOM_LAYER_PREFIX}iso20-fill`, "fill-opacity", .35 * layerState.isochroneOpacity);
      map.setPaintProperty(`${CUSTOM_LAYER_PREFIX}iso60-fill`, "fill-opacity", .15 * layerState.isochroneOpacity);
    }
    syncRoadState();
    syncFacilityFilter();
  };

  const applyResourceLayer = () => {
    if (!map?.getLayer(`${CUSTOM_LAYER_PREFIX}municipality-fill`)) return false;
    if (resourceModel) {
      const features = infrastructureData.municipalities.features;
      if (features.length !== 29 || resourceModel.entries.length !== 29 || !resourceModel.entries.every(entry => features.some(f => Number(f.id) === entry.siteId && f.properties.name === entry.name))) {
        resourceModel = null;
        applyResourceLayer();
        throw new Error("Resource municipality mapping changed");
      }
      resourceModel.entries.forEach(entry => map.setFeatureState({ source: `${CUSTOM_LAYER_PREFIX}municipalities`, id: entry.siteId }, { resourceAvailable: entry.value !== null, resourceValue: entry.value ?? 0 }));
    }
    const valueRamp = ["interpolate", ["linear"], ["number", ["feature-state", "resourceValue"], 0], 0, "#edf4fc", Math.max(1,resourceModel?.maximum || 0), "#2166ac"];
    map.setPaintProperty(`${CUSTOM_LAYER_PREFIX}municipality-fill`, "fill-color", resourceModel ? ["case", ["boolean", ["feature-state", "resourceAvailable"], false], valueRamp, "#d9dfe5"] : "#ffffff");
    map.setPaintProperty(`${CUSTOM_LAYER_PREFIX}municipality-fill`, "fill-opacity", resourceModel ? .86 : .035);
    map.setFilter(`${CUSTOM_LAYER_PREFIX}resource-selection`, ["==", ["id"], resourceModel ? resourceModel.selectedId ?? -1 : networkSelection ?? -1]);
    const shell = map.getContainer().closest(".infra-shell");
    shell?.classList.toggle("is-resource-mode", Boolean(resourceModel));
    shell?.querySelectorAll('[data-layer-toggle="isochrone20"], [data-layer-toggle="isochrone60"], #infraIsoOpacity').forEach(button => { button.disabled = Boolean(resourceModel); });
    syncLayerState();
    return true;
  };
  const setResourceLayer = model => {
    resourceHover?.remove();
    if (Boolean(model) !== Boolean(resourceModel)) {
      networkSelection = model ? null : resourceModel?.selectedId ?? networkSelection;
      resourceDetailsOpen = false;
    }
    resourceModel = model;
    const result = applyResourceLayer();
    territoryDock?.update();
    return result;
  };

  const selectedTerritoryId = () => resourceModel ? resourceModel.selectedId : networkSelection;
  const territoryCard = id => {
    if (id == null || !infrastructureData) return null;
    const territory = infrastructureData.municipalities.features.find(feature => Number(feature.id ?? feature.properties.id) === Number(id));
    if (!territory) return null;
    if (!resourceModel) return {
      id: Number(id), name: territory.properties.name, context: "Инфраструктура · Перепись 2021",
      value: Number(territory.properties.population2021) > 0 ? Number(territory.properties.population2021) : null,
      unit: "жителей", label: "Население территории"
    };
    const entry = resourceModel.entries.find(item => item.siteId === Number(id));
    return entry ? {
      id: entry.siteId, name: entry.name, year: resourceModel.year,
      context: `Медицинские ресурсы · ${resourceModel.year}`, value: entry.value,
      unit: resourceModel.unit, label: resourceModel.label,
      pinnedContext: "comparison",
      footer: Number.isFinite(resourceModel.regionValue) ? { label: `Амурская область · ${resourceModel.year}`, value: formatNumber(resourceModel.regionValue) } : null,
      series: entry.series || [], seriesLabel: `По годам · ${resourceModel.unit}`
    } : null;
  };
  const resourcePanelOpen = () => !map?.getContainer().closest(".infra-shell")?.classList.contains("is-panel-collapsed");
  const clearTerritory = () => {
    window.AmurMapWorkspace?.clearFacility();
    networkSelection = null;
    resourceDetailsOpen = false;
    resourceHover?.remove();
    if (resourceModel?.selectedId != null) {
      resourceModel = { ...resourceModel, selectedId: null };
      window.dispatchEvent(new CustomEvent("atlas:resource-territory", { detail: { siteId: null } }));
    }
    applyResourceLayer();
    territoryDock?.update();
  };
  const selectTerritory = (id, options = {}) => {
    window.AmurMapWorkspace?.clearFacility();
    if (!territoryCard(id)) return;
    resourceDetailsOpen = false;
    resourceHover?.remove();
    if (resourceModel) {
      resourceModel = { ...resourceModel, selectedId: Number(id) };
      window.dispatchEvent(new CustomEvent("atlas:resource-territory", { detail: { siteId: Number(id) } }));
    } else networkSelection = Number(id);
    if (matchMedia("(max-width: 1023px)").matches) window.AtlasLegacyBridge?.setNavigationPanel(false);
    applyResourceLayer();
    territoryDock?.update({ focus: Boolean(options.focus) });
    if (options.fly) {
      const feature = infrastructureData.municipalities.features.find(item => Number(item.id ?? item.properties.id) === Number(id));
      const bounds = new window.maplibregl.LngLatBounds();
      const extend = coordinates => typeof coordinates[0] === "number" ? bounds.extend(coordinates) : coordinates.forEach(extend);
      extend(feature.geometry.coordinates);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 10.5, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420 });
    }
  };
  const openTerritoryDetails = () => {
    resourceDetailsOpen = true;
    if (window.AmurMapWorkspace?.desktop()) {
      window.AmurMapWorkspace.setInformation(true);
      territoryDock?.update();
      if (resourceModel) window.dispatchEvent(new Event("atlas:resource-details"));
      return;
    }
    if (!resourcePanelOpen()) map?.getContainer().closest(".infra-shell")?.querySelector(".infra-panel-collapse")?.click();
    territoryDock?.update();
    if (resourceModel) window.dispatchEvent(new Event("atlas:resource-details"));
    else {
      const panel = map?.getContainer().closest(".infra-shell")?.querySelector(".infra-layer-composer");
      if (panel) { panel.tabIndex = -1; panel.focus({ preventScroll: true }); panel.scrollTop = 0; }
    }
  };

  const addSourcesAndLayers = async (data, roadsData) => {
    const firstBaseLabel = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;

    map.addSource(`${CUSTOM_LAYER_PREFIX}iso20`, { type: "geojson", data: data.isochrones20 });
    map.addSource(`${CUSTOM_LAYER_PREFIX}iso60`, { type: "geojson", data: data.isochrones60 });
    map.addSource(`${CUSTOM_LAYER_PREFIX}roads`, { type: "geojson", data: roadsData });
    map.addSource(`${CUSTOM_LAYER_PREFIX}region-mask`, { type: "geojson", data: data.regionMask });
    map.addSource(`${CUSTOM_LAYER_PREFIX}municipalities`, { type: "geojson", data: data.municipalities });
    map.addSource(`${CUSTOM_LAYER_PREFIX}municipality-labels`, { type: "geojson", data: data.municipalityLabels });
    map.addSource(`${CUSTOM_LAYER_PREFIX}settlements`, { type: "geojson", data: data.settlements });
    map.addSource(`${CUSTOM_LAYER_PREFIX}facilities`, {
      type: "geojson",
      data: data.facilities,
      cluster: true,
      clusterRadius: 34,
      clusterMaxZoom: 10,
      clusterProperties: FACILITY_CLUSTER_PROPERTIES
    });
    clusteredFacilityInputCount = data.facilities.features.length;

    const belowLabels = firstBaseLabel || undefined;
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-tertiary-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 8.8,
      filter: ["==", ["get", "fclass"], "tertiary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_PALETTES.warm.tertiary,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 8.8, .22, 11, .44, 14, .62],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8.8, .35, 11, .85, 13, 1.45, 15, 2.2]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-secondary-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 6.6,
      filter: ["==", ["get", "fclass"], "secondary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_PALETTES.warm.secondary,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6.6, .28, 9, .52, 13, .72],
        "line-width": ["interpolate", ["linear"], ["zoom"], 6.6, .35, 8, .65, 10, 1.15, 12, 1.8, 14, 2.7]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}iso60-fill`,
      type: "fill",
      source: `${CUSTOM_LAYER_PREFIX}iso60`,
      paint: { "fill-color": "#ff1745", "fill-opacity": .15 }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}iso60-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}iso60`,
      paint: { "line-color": "#ff1745", "line-opacity": .0, "line-width": 1.1 }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}iso20-fill`,
      type: "fill",
      source: `${CUSTOM_LAYER_PREFIX}iso20`,
      paint: { "fill-color": "#ff1745", "fill-opacity": .35 }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}iso20-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}iso20`,
      paint: { "line-color": "#ff1745", "line-opacity": .0, "line-width": 1.35 }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-primary-casing`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 5.2,
      filter: ["==", ["get", "fclass"], "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f8fafc",
        "line-opacity": .72,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5.2, 1.45, 7, 2.1, 9, 3.05, 11, 4.3, 13, 5.8]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-primary-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 5.2,
      filter: ["==", ["get", "fclass"], "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_PALETTES.warm.primary,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.2, .45, 8, .65, 12, .8],
        "line-width": ["interpolate", ["linear"], ["zoom"], 5.2, .55, 7, 1, 9, 1.7, 11, 2.7, 13, 4]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-trunk-casing`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 3.8,
      filter: ["==", ["get", "fclass"], "trunk"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f8fafc",
        "line-opacity": .78,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 8, 2.65, 10, 3.8, 12, 5.3, 14, 7.2, 14, 9]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-trunk-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 3.8,
      filter: ["==", ["get", "fclass"], "trunk"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_PALETTES.warm.trunk,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.8, .58, 8, .74, 12, .86],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3.8, .75, 6, 1.35, 8, 2.15, 10, 3.2, 12, 4.8, 14, 6.4]
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}region-mask`,
      type: "fill",
      source: `${CUSTOM_LAYER_PREFIX}region-mask`,
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": .7,
        "fill-outline-color": "rgba(255,255,255,0)"
      }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}municipality-fill`,
      type: "fill",
      source: `${CUSTOM_LAYER_PREFIX}municipalities`,
      paint: { "fill-color": "#ffffff", "fill-opacity": .035, "fill-color-transition": { duration: 0 }, "fill-opacity-transition": { duration: 0 } }
    }, belowLabels);
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}municipality-line`,
      type: "line",
      source: `${CUSTOM_LAYER_PREFIX}municipalities`,
      paint: {
        "line-color": "#050505",
        "line-opacity": .25,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, .65, 10, 1.15, 13, 1.7]
      }
    }, belowLabels);

    map.addLayer({ id: `${CUSTOM_LAYER_PREFIX}resource-selection`, type: "line", source: `${CUSTOM_LAYER_PREFIX}municipalities`, filter: ["==", ["id"], -1], paint: { "line-color": "#124777", "line-width": 3 } }, belowLabels);
    SETTLEMENT_SYMBOL_CLASSES.forEach((symbolClass) => {
      const baseRadius = symbolClass.diameter * .5;
      const circleRadius = [
        "interpolate", ["linear"], ["zoom"],
        4, baseRadius * .68,
        6, baseRadius * .78,
        8, baseRadius * .9,
        10, baseRadius,
        12, baseRadius * 1.08
      ];
      const paint = symbolClass.donut ? {
        "circle-radius": circleRadius,
        "circle-color": "rgba(255,255,255,.44)",
        "circle-opacity": .82,
        "circle-stroke-color": "#3f8693",
        "circle-stroke-opacity": .84,
        "circle-stroke-width": [
          "interpolate", ["linear"], ["zoom"],
          4, symbolClass.ring * .68,
          9, symbolClass.ring * .95,
          12, symbolClass.ring * 1.05
        ]
      } : {
        "circle-radius": circleRadius,
        "circle-color": "#6daeba",
        "circle-opacity": .86,
        "circle-stroke-color": "#324b62",
        "circle-stroke-opacity": .78,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, .55, 9, .9, 12, 1.1]
      };
      map.addLayer({
        id: `${CUSTOM_LAYER_PREFIX}settlement-${symbolClass.code}`,
        type: "circle",
        source: `${CUSTOM_LAYER_PREFIX}settlements`,
        filter: ["==", ["get", "population_class"], symbolClass.code],
        paint
      });
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}settlement-missing`,
      type: "circle",
      source: `${CUSTOM_LAYER_PREFIX}settlements`,
      filter: ["<=", ["coalesce", ["get", "population2021"], 0], 0],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 10, 3.4],
        "circle-color": "#ffffff",
        "circle-opacity": .55,
        "circle-stroke-color": "#63758a",
        "circle-stroke-width": 1
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}municipality-label`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}municipality-labels`,
      minzoom: 8.35,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9, 7, 11.5],
        "text-max-width": 10,
        "text-allow-overlap": false
      },
      paint: {
        "text-color": "#52677c",
        "text-halo-color": "rgba(255,255,255,.88)",
        "text-halo-width": 1.2
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}city-label`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}settlements`,
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
        "text-halo-color": "rgba(255,255,255,.9)",
        "text-halo-width": 1.4
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}settlement-label-major`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}settlements`,
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
        "text-halo-color": "rgba(255,255,255,.88)",
        "text-halo-width": 1.15
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}settlement-label-minor`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}settlements`,
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
        "text-halo-color": "rgba(255,255,255,.85)",
        "text-halo-width": 1
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-label-major`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 6.2,
      filter: [
        "all",
        ["match", ["get", "fclass"], ["trunk", "primary"], true, false],
        ["any", ["has", "ref"], ["has", "name"]]
      ],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 520,
        "text-field": ["case", ["has", "ref"], ["get", "ref"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6.2, 9, 10, 10.5, 13, 11.5],
        "text-letter-spacing": .03,
        "text-keep-upright": true,
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#596874",
        "text-halo-color": "rgba(255,255,255,.88)",
        "text-halo-width": 1.35
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-label-secondary`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 9.4,
      filter: ["all", ["==", ["get", "fclass"], "secondary"], ["has", "name"]],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 620,
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9.4, 8.8, 13, 10.5],
        "text-keep-upright": true,
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#6d7881",
        "text-halo-color": "rgba(255,255,255,.86)",
        "text-halo-width": 1.2
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}road-label-tertiary`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}roads`,
      minzoom: 11.8,
      filter: ["all", ["==", ["get", "fclass"], "tertiary"], ["has", "name"]],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 720,
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11.8, 8.6, 15, 10.2],
        "text-keep-upright": true,
        "text-allow-overlap": false,
        "text-optional": true
      },
      paint: {
        "text-color": "#7b858c",
        "text-halo-color": "rgba(255,255,255,.84)",
        "text-halo-width": 1.05
      }
    });

    await Promise.all(FACILITY_TYPES.map((item) => loadMapImage(
      map,
      `${CUSTOM_LAYER_PREFIX}icon-${item.code}`,
      facilityMapIconUrl(item)
    )));
    installClusterDonutGenerator();
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}facility-clusters`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}facilities`,
      filter: ["has", "point_count"],
      layout: {
        "icon-image": clusterDonutIconExpression(),
        "icon-size": 1,
        "icon-padding": 2,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}facility-cluster-count`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}facilities`,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": [
          "step", ["get", "point_count"],
          10.5, 10, 11, 30, 11.5, 75, 12
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": "#1d3347",
        "text-halo-color": "rgba(255,255,255,.62)",
        "text-halo-width": .55
      },
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}facilities`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}facilities`,
      filter: facilityFilter(),
      layout: {
        "icon-image": [
          "match", ["get", "facility_code"],
          ...FACILITY_TYPES.flatMap((item) => [item.code, `${CUSTOM_LAYER_PREFIX}icon-${item.code}`]),
          `${CUSTOM_LAYER_PREFIX}icon-health_post`
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 7, .62, 10, .78, 13, .94],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      }
    });
    map.addLayer({
      id: `${CUSTOM_LAYER_PREFIX}facility-stack`,
      type: "symbol",
      source: `${CUSTOM_LAYER_PREFIX}facilities`,
      filter: ["all", facilityFilter(), [">", ["get", "stack_size"], 1]],
      minzoom: 10.5,
      layout: {
        "text-field": ["to-string", ["get", "stack_size"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": 9,
        "text-offset": [.95, -.95],
        "text-allow-overlap": true
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#243f59",
        "text-halo-width": 2.8
      }
    });
    syncLayerState();
    applyResourceLayer();
    window.dispatchEvent(new Event("atlas:infrastructure-ready"));
  };

  const clusterPopupHtml = (properties) => {
    const rows = FACILITY_TYPES.map((item) => ({
      ...item,
      count: Number(properties[`${item.code}_count`] || 0)
    }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count);
    const total = Number(properties.point_count || rows.reduce((sum, item) => sum + item.count, 0));
    const dominant = rows[0];
    return `
      <div class="infra-cluster-popup">
        <div class="infra-cluster-popup-title">Состав кластера</div>
        <div class="infra-cluster-popup-summary">
          <span><small>Всего учреждений</small><b>${formatNumber(total)}</b></span>
          <span><small>Различных типов</small><b>${formatNumber(rows.length)}</b></span>
        </div>
        <div class="infra-cluster-popup-rows">
          ${rows.map((item) => `
            <div>
              <i style="--cluster-type:${item.color}"></i>
              <span>${escapeHtml(item.label)}</span>
              <strong>${formatNumber(item.count)}</strong>
            </div>`).join("")}
        </div>
        ${dominant ? `<p>Ведущий тип: <b>${escapeHtml(dominant.label)}</b></p>` : ""}
        <small class="infra-cluster-popup-hint">Нажмите, чтобы приблизить и раскрыть объекты.</small>
      </div>`;
  };

  const facilityPopupHtml = (features) => {
    const unique = [];
    const seen = new Set();
    features.forEach((feature) => {
      const id = feature.properties.web_id;
      if (!seen.has(id) && activeFacilityTypes.has(feature.properties.facility_code)) {
        seen.add(id);
        unique.push(feature);
      }
    });
    const cards = unique.map((feature) => {
      const props = feature.properties;
      const type = TYPE_BY_CODE.get(props.facility_code);
      const details = [
        props.workers != null ? `<span>Работники</span><strong>${formatNumber(props.workers)}</strong>` : "",
        props.beds != null ? `<span>Койки</span><strong>${formatNumber(props.beds)}</strong>` : "",
        props.cabinet != null ? `<span>Кабинеты</span><strong>${formatNumber(props.cabinet)}</strong>` : "",
        props.service != null ? `<span>Обслуживание</span><strong>${formatNumber(props.service)}</strong>` : ""
      ].filter(Boolean).join("");
      return `
        <article class="infra-popup-card">
          <header>${type ? iconMarkup(type) : ""}<div><b>${escapeHtml(props.name)}</b><small>${escapeHtml(props.facility_type)}</small></div></header>
          ${props.address ? `<p>${escapeHtml(props.address)}</p>` : ""}
          ${details ? `<div class="infra-popup-grid">${details}</div>` : '<p class="infra-no-data">Дополнительные показатели не заполнены.</p>'}
        </article>`;
    }).join("");
    return `
      <div class="infra-popup">
        <div class="infra-popup-title">${unique.length > 1 ? `${unique.length} учреждения в одной точке` : "Медицинское учреждение"}</div>
        ${cards}
      </div>`;
  };

  const bindMapInteractions = (data) => {
    territoryDock = window.AmurTerritoryCard.createDock({
      container: map.getContainer(), map,
      getData: () => territoryCard(selectedTerritoryId()),
      getItems: () => !resourceModel && !layerState.municipalities ? [] : data.municipalities.features.map(feature => ({ id: Number(feature.id ?? feature.properties.id), name: feature.properties.name })),
      onSelect: selectTerritory, onClear: clearTerritory, onDetails: openTerritoryDetails,
      onEscape: () => {
        if (!resourceDetailsOpen || !resourcePanelOpen()) return false;
        window.AtlasLegacyBridge?.setNavigationPanel(false);
        resourceDetailsOpen = false;
        territoryDock?.update({ focus: true });
        return true;
      },
      isHidden: () => Boolean(window.AmurMapWorkspace?.desktop()
        ? map.getContainer().closest(".infra-shell")?.classList.contains("has-map-information")
        : (resourceDetailsOpen || matchMedia("(max-width: 1023px)").matches) && resourcePanelOpen())
    });
    resourceHover = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 16, maxWidth: "200px", className: "resource-hover-popup" });
    const clusterLayer = `${CUSTOM_LAYER_PREFIX}facility-clusters`;
    const clusterHoverPopup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      maxWidth: "300px",
      className: "infra-cluster-hover-popup"
    });
    map.on("mouseenter", clusterLayer, (event) => {
      if (!window.AtlasInteraction?.canHover(event.originalEvent)) return;
      const feature = event.features?.[0];
      if (!feature) return;
      clusterHoverPopup
        .setLngLat(feature.geometry.coordinates)
        .setHTML(clusterPopupHtml(feature.properties))
        .addTo(map);
    });
    map.on("mouseleave", clusterLayer, () => clusterHoverPopup.remove());
    map.on("movestart", () => clusterHoverPopup.remove());
    map.on("click", clusterLayer, async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [clusterLayer] })[0];
      if (!feature) return;
      clearTerritory();
      clusterHoverPopup.remove();
      const zoom = await map.getSource(`${CUSTOM_LAYER_PREFIX}facilities`).getClusterExpansionZoom(
        feature.properties.cluster_id
      );
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });

    map.on("click", `${CUSTOM_LAYER_PREFIX}facilities`, (event) => {
      const selected = event.features?.[0];
      if (!selected) return;
      clearTerritory();
      const locationId = selected.properties.location_id;
      const features = data.facilities.features.filter(
        (feature) => feature.properties.location_id === locationId
      );
      if (window.AmurMapWorkspace?.desktop()) {
        window.AmurMapWorkspace.showFacility("Медицинское учреждение", facilityPopupHtml(features));
        return;
      }
      new window.maplibregl.Popup({ maxWidth: "390px", closeButton: true })
        .setLngLat(selected.geometry.coordinates)
        .setHTML(facilityPopupHtml(features))
        .addTo(map);
    });

    const settlementLayers = SETTLEMENT_POINT_LAYER_NAMES.map(
      (name) => `${CUSTOM_LAYER_PREFIX}${name}`
    );
    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: settlementLayers });
      if (!features.length) return;
      const feature = features[0];
      const props = feature.properties;
      clearTerritory();
      new window.maplibregl.Popup({ maxWidth: "320px" })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(`
          <div class="infra-popup infra-territory-popup">
            <div class="infra-popup-title">${escapeHtml(props.name)}</div>
            <div class="infra-popup-grid">
              <span>Муниципалитет</span><strong>${escapeHtml(props.municipality)}</strong>
              <span>Население 2021</span><strong>${formatNumber(props.population2021)}</strong>
            </div>
          </div>`)
        .addTo(map);
    });

    map.on("click", `${CUSTOM_LAYER_PREFIX}municipality-fill`, (event) => {
      const higherPriorityLayers = [
        `${CUSTOM_LAYER_PREFIX}facilities`,
        `${CUSTOM_LAYER_PREFIX}facility-clusters`,
        ...settlementLayers
      ];
      if (map.queryRenderedFeatures(event.point, { layers: higherPriorityLayers }).length) return;
      const feature = event.features?.[0];
      if (!feature) return;
      selectTerritory(Number(feature.id ?? feature.properties.id), { fly: false });
    });

    const territoryLayers = [`${CUSTOM_LAYER_PREFIX}municipality-fill`];
    const priorities = [clusterLayer, `${CUSTOM_LAYER_PREFIX}facilities`, ...settlementLayers];
    map.on("mousemove", event => {
      cancelAnimationFrame(resourceHoverFrame);
      resourceHoverFrame = requestAnimationFrame(() => {
        if (!map || map.isMoving() || !window.AtlasInteraction?.canHover(event.originalEvent)
          || map.queryRenderedFeatures(event.point, { layers: priorities }).length) { resourceHover?.remove(); return; }
        const feature = map.queryRenderedFeatures(event.point, { layers: territoryLayers })[0];
        const id = feature && Number(feature.id ?? feature.properties.id);
        const card = feature && id !== selectedTerritoryId() ? territoryCard(id) : null;
        if (!card) { resourceHover?.remove(); return; }
        resourceHover.setLngLat(event.lngLat).setHTML(window.AmurTerritoryCard.render(card)).addTo(map);
      });
    });
    map.getCanvas().addEventListener("mouseleave", () => { cancelAnimationFrame(resourceHoverFrame); resourceHover?.remove(); });
    map.on("movestart", () => { cancelAnimationFrame(resourceHoverFrame); resourceHover?.remove(); });
    map.on("click", event => {
      if (!map.queryRenderedFeatures(event.point, { layers: [...territoryLayers, ...priorities] }).length) clearTerritory();
    });

    [
      clusterLayer,
      `${CUSTOM_LAYER_PREFIX}facilities`,
      ...settlementLayers,
      `${CUSTOM_LAYER_PREFIX}municipality-fill`
    ].forEach((layerId) => {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    });
  };

  const fitRegion = (data, animate = true) => {
    const points = data.settlements.features.map((feature) => feature.geometry.coordinates);
    if (!points.length || !map) return;
    if (!map.getContainer().clientWidth || !map.getContainer().clientHeight) {
      regionFitPending = true;
      return;
    }
    regionFitPending = false;
    const bounds = points.reduce(
      (box, coordinate) => box.extend(coordinate),
      new window.maplibregl.LngLatBounds(points[0], points[0])
    );
    map.fitBounds(bounds, {
      padding: { top: 38, right: 42, bottom: 38, left: 42 },
      duration: animate ? 700 : 0,
      maxZoom: 7.2
    });
  };

  const syncButtons = (shell) => {
    shell.querySelectorAll("[data-layer-toggle]").forEach((button) => {
      const active = Boolean(layerState[button.dataset.layerToggle]);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const backdrop = shell.querySelector('[data-basemap-toggle]');
    if (backdrop) {
      backdrop.setAttribute('aria-pressed', String(layerState.basemap));
      backdrop.title = layerState.basemap ? 'Скрыть подложку' : 'Показать подложку';
    }
  };

  const bindPanel = (shell, data) => {
    shell.querySelectorAll("[data-facility-type]").forEach((button) => {
      button.addEventListener("click", () => {
        const code = button.dataset.facilityType;
        if (activeFacilityTypes.has(code)) activeFacilityTypes.delete(code);
        else activeFacilityTypes.add(code);
        const active = activeFacilityTypes.has(code);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        syncFacilityFilter();
      });
    });
    shell.querySelectorAll("[data-facility-action]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFacilityTypes = button.dataset.facilityAction === "all"
          ? new Set(FACILITY_TYPES.map((item) => item.code))
          : new Set();
        shell.querySelectorAll("[data-facility-type]").forEach((card) => {
          const active = activeFacilityTypes.has(card.dataset.facilityType);
          card.classList.toggle("is-active", active);
          card.setAttribute("aria-pressed", String(active));
        });
        syncFacilityFilter();
      });
    });
    shell.querySelectorAll("[data-layer-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.layerToggle;
        layerState[key] = !layerState[key];
        if (key === "municipalities" && !layerState[key] && !resourceModel) clearTerritory();
        syncButtons(shell);
        syncLayerState();
        territoryDock?.update();
      });
    });
    const opacity = shell.querySelector("#infraIsoOpacity");
    const output = shell.querySelector(".infra-range-label output");
    opacity?.addEventListener("input", () => {
      layerState.isochroneOpacity = Number(opacity.value) / 100;
      if (output) output.value = `${opacity.value}%`;
      syncLayerState();
    });
    shell.querySelector(".infra-fit-button")?.addEventListener("click", () => fitRegion(data));
    shell.querySelector(".infra-panel-collapse")?.addEventListener("click", (event) => {
      const collapsed = shell.classList.toggle("is-panel-collapsed");
      event.currentTarget.textContent = collapsed ? "›" : "‹";
      event.currentTarget.setAttribute("aria-label", collapsed ? "Развернуть панель" : "Свернуть панель");
      window.setTimeout(() => map?.resize(), 220);
      window.dispatchEvent(new CustomEvent("atlas:infrastructure-panel", {
        detail: { open: !collapsed }
      }));
      if (collapsed) resourceDetailsOpen = false;
      territoryDock?.update();
    });
  };

  const showStatus = (shell, message, kind = "") => {
    const status = shell.querySelector(".infra-map-status");
    if (!status) return;
    status.textContent = message;
    status.className = `infra-map-status ${kind}`.trim();
    status.hidden = false;
  };

  const hideStatus = (shell) => {
    const status = shell.querySelector(".infra-map-status");
    if (status) status.hidden = true;
  };

  const destroy = () => {
    mountToken += 1;
    basemap?.destroy();
    basemap = null;
    territoryDock?.destroy(); territoryDock = null;
    cancelAnimationFrame(resourceHoverFrame);
    resourceHover?.remove(); resourceHover = null;
    networkSelection = null;
    resourceDetailsOpen = false;
    if (map) {
      try { map.remove(); } catch (_) { /* detached container */ }
      map = null;
    }
    infrastructureData = null;
    regionFitPending = false;
    resourceModel = null;
    clusteredFacilityInputCount = 0;
  };

  const mount = async (host) => {
    destroy();
    const token = mountToken;
    // The shared visualization host may already belong to another tab when
    // loading finishes. Keep async writes inside this view's own cached node.
    const container = document.createElement("div");
    container.className = "infra-view-host";
    host.replaceChildren(container);
    container.innerHTML = '<div class="infra-loading-card"><span></span><b>Загружаем карту…</b></div>';
    try {
      const [maplibregl, data, roadsData] = await Promise.all([
        ensureMapLibre(),
        ensureData(),
        ensureRoadsData()
      ]);
      if (token !== mountToken || !container.isConnected) return;
      infrastructureData = data;
      container.innerHTML = buildShell(data);
      const shell = container.querySelector(".infra-shell");
      bindPanel(shell, data);
      syncButtons(shell);
      map = new maplibregl.Map({
        container: shell.querySelector(".infra-map"),
        style: window.AmurBasemap.localStyle(),
        center: [128.3, 52.8],
        zoom: 5.1,
        minZoom: 3.5,
        maxZoom: 15.5,
        attributionControl: false,
        fadeDuration: 0,
        pitchWithRotate: false
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      const backdropControl = document.createElement('div');
      backdropControl.className = 'maplibregl-ctrl maplibregl-ctrl-group infra-basemap-control';
      backdropControl.innerHTML = '<button type="button" data-basemap-toggle aria-label="Подложка"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16M15 5v16"/></svg></button>';
      backdropControl.querySelector('button').addEventListener('click', () => {
        layerState.basemap = !layerState.basemap;
        syncButtons(shell);
        syncLayerState();
      });
      map.addControl({ onAdd: () => backdropControl, onRemove: () => backdropControl.remove() }, 'top-right');
      syncButtons(shell);
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", async () => {
        if (token !== mountToken) return;
        try {
          await addSourcesAndLayers(data, roadsData);
          bindMapInteractions(data);
          fitRegion(data, false);
          hideStatus(shell);
          basemap = window.AmurBasemap.attach(map, {
            beforeId: () => map.getStyle().layers.find((layer) => layer.id.startsWith(CUSTOM_LAYER_PREFIX))?.id,
            visible: layerState.basemap,
            onChange: ({ state }) => {
              if (token !== mountToken) return;
              if (state === "local") {
                showStatus(shell, "Внешняя подложка недоступна. Локальные границы, дороги и медицинские объекты работают.", "is-warning");
              } else {
                hideStatus(shell);
              }
            }
          });
        } catch (error) {
          console.error(error);
          showStatus(shell, `Ошибка подготовки слоёв: ${error.message}`, "is-error");
        }
      });
      map.on("error", (event) => {
        if (event.sourceId?.startsWith(CUSTOM_LAYER_PREFIX)) {
          showStatus(shell, "Не удалось загрузить тематический слой карты.", "is-error");
        }
      });
    } catch (error) {
      console.error(error);
      if (token !== mountToken) return;
      container.innerHTML = `
        <div class="infra-loading-card is-error">
          <b>Не удалось открыть инфраструктурную карту</b>
          <small>${escapeHtml(error.message)}</small>
          <button type="button">Повторить</button>
        </div>`;
      container.querySelector("button")?.addEventListener("click", () => mount(host));
    }
  };

  const listMapImages = () => {
    if (!map) return [];
    try {
      return map.listImages();
    } catch (_) {
      return [];
    }
  };

  const debug = () => ({
    mounted: Boolean(map),
    loaded: Boolean(map?.loaded()),
    basemap: basemap?.getStatus() || null,
    styleLoaded: Boolean(map?.isStyleLoaded()),
    zoom: map?.getZoom() ?? null,
    municipalityLabelMinzoom: map?.getStyle()?.layers?.find(
      (layer) => layer.id === `${CUSTOM_LAYER_PREFIX}municipality-label`
    )?.minzoom ?? null,
    layers: map?.getStyle()?.layers?.filter((layer) => layer.id.startsWith(CUSTOM_LAYER_PREFIX)).map((layer) => layer.id) || [],
    sources: Object.keys(map?.getStyle()?.sources || {}).filter((id) => id.startsWith(CUSTOM_LAYER_PREFIX)),
    renderedFeatures: {
      settlements: map?.getSource(`${CUSTOM_LAYER_PREFIX}settlements`)
        ? map.querySourceFeatures(`${CUSTOM_LAYER_PREFIX}settlements`).length
        : 0,
      municipalities: map?.getSource(`${CUSTOM_LAYER_PREFIX}municipalities`)
        ? map.querySourceFeatures(`${CUSTOM_LAYER_PREFIX}municipalities`).length
        : 0,
      facilities: map?.getSource(`${CUSTOM_LAYER_PREFIX}facilities`)
        ? map.querySourceFeatures(`${CUSTOM_LAYER_PREFIX}facilities`).length
        : 0
    },
    activeFacilityTypes: [...activeFacilityTypes],
    clusteredFacilityInputCount,
    images: {
      facilities: listMapImages().filter((id) => id.startsWith(`${CUSTOM_LAYER_PREFIX}icon-`)).length,
      donuts: listMapImages().filter((id) => id.startsWith(DONUT_IMAGE_PREFIX)).length
    },
    layerState: { ...layerState }
    , resources: resourceModel && map?.getLayer(`${CUSTOM_LAYER_PREFIX}municipality-fill`) ? { year: resourceModel.year, indicator: resourceModel.indicatorId, maximum: resourceModel.maximum,
      selectedId: resourceModel.selectedId, paint: map.getPaintProperty(`${CUSTOM_LAYER_PREFIX}municipality-fill`, "fill-color"), opacity: map.getPaintProperty(`${CUSTOM_LAYER_PREFIX}municipality-fill`, "fill-opacity"),
      rendered: map.queryRenderedFeatures(undefined, { layers: [`${CUSTOM_LAYER_PREFIX}municipality-fill`] }).slice(0,5).map(f => ({ id: f.id, value: map.getFeatureState({ source: `${CUSTOM_LAYER_PREFIX}municipalities`, id: f.id }) })),
      values: resourceModel.entries.map(entry => ({ id: entry.siteId, ...map.getFeatureState({ source: `${CUSTOM_LAYER_PREFIX}municipalities`, id: entry.siteId }) })) } : null
  });

  const resize = () => {
    map?.resize();
    if (regionFitPending && infrastructureData) fitRegion(infrastructureData, false);
  };

  const getSelection = () => selectedTerritoryId();
  window.addEventListener("atlas:workspace-panel", () => territoryDock?.update());
  window.AmurInfrastructureMap = { mount, destroy, resize, debug, getSelection, emptyStyle, setResourceLayer, selectTerritory, clearTerritory };
})();
