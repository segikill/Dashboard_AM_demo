(() => {
  "use strict";

  const main = document.querySelector("main");
  if (main && !main.id) main.id = "main-content";

  const skip = document.createElement("a");
  skip.className = "site-skip-link";
  skip.href = main ? `#${main.id}` : "#top";
  skip.textContent = "Перейти к содержанию";
  document.body.prepend(skip);

  document.querySelectorAll(".table-wrap").forEach((wrap, index) => {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    if (!wrap.hasAttribute("aria-label")) {
      const sectionTitle = wrap.closest("section")?.querySelector("h2, h3")?.textContent?.trim();
      wrap.setAttribute("aria-label", sectionTitle ? `Таблица: ${sectionTitle}` : `Прокручиваемая таблица ${index + 1}`);
    }
  });

  const selectWheelTimes = new Map();
  document.addEventListener("wheel", (event) => {
    const select = event.target instanceof Element ? event.target.closest("select") : null;
    if (!select || select.disabled || select.multiple || select.size > 1 || event.deltaY === 0) return;
    event.preventDefault();
    const key = select.id || select.name || "anonymous-select";
    const now = performance.now();
    const previous = selectWheelTimes.get(key);
    if (previous !== undefined && now - previous < 350) return;
    selectWheelTimes.set(key, now);
    const direction = event.deltaY > 0 ? 1 : -1;
    let nextIndex = select.selectedIndex + direction;
    while (nextIndex >= 0 && nextIndex < select.options.length && select.options[nextIndex].disabled) {
      nextIndex += direction;
    }
    if (nextIndex < 0 || nextIndex >= select.options.length) return;
    select.focus({ preventScroll: true });
    select.selectedIndex = nextIndex;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { passive: false });

  const improveTreemapContrast = () => {
    document.querySelectorAll(".tile").forEach((tile) => {
      tile.style.setProperty("color", "#ffffff", "important");
      tile.querySelectorAll(".tile-code, .tile-label, .tile-value").forEach((part) => {
        part.style.setProperty("color", "#ffffff", "important");
      });
    });
  };

  improveTreemapContrast();
  const chartRoot = document.getElementById("viz");
  if (chartRoot) {
    new MutationObserver(improveTreemapContrast).observe(chartRoot, { childList: true, subtree: true });
  }

  const enhanceAtlas = () => {
    if (!document.getElementById("viz")) return;
    if (typeof state === "undefined" || typeof render !== "function" || typeof DATA === "undefined") return;

    const regionKey = DATA.regionKey || "amur";
    document.body.dataset.region = regionKey;
    document.body.classList.add("site-observatory");
    const motionQuery = new URLSearchParams(window.location.search).get("motion");
    let storedMotion = "";
    try {
      storedMotion = window.localStorage.getItem("atlas-motion-mode") || "";
    } catch {
      storedMotion = "";
    }
    const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let motionMode = ["full", "reduced", "off"].includes(motionQuery)
      ? motionQuery
      : ["full", "reduced", "off"].includes(storedMotion)
        ? storedMotion
        : systemReducedMotion ? "reduced" : "full";
    const motionDuration = () => motionMode === "full" ? 260 : motionMode === "reduced" ? 120 : 0;
    const applyMotionMode = (mode, persist = true) => {
      motionMode = ["full", "reduced", "off"].includes(mode) ? mode : "full";
      document.documentElement.dataset.motionMode = motionMode;
      if (persist) {
        try {
          window.localStorage.setItem("atlas-motion-mode", motionMode);
        } catch {
          /* localStorage can be unavailable for hardened local-file sessions */
        }
      }
      const url = new URL(window.location.href);
      if (motionMode === "full") url.searchParams.delete("motion");
      else url.searchParams.set("motion", motionMode);
      history.replaceState(null, "", url);
    };
    applyMotionMode(motionMode, false);
    if (state.treeColor === undefined || state.treeColor === "change") state.treeColor = "count";
    if (state.mapLabels === undefined || state.mapLabels === "key") state.mapLabels = "auto";
    if (state.mapPalette === undefined) state.mapPalette = "teal";
    if (state.mapColorLow === undefined) state.mapColorLow = "#e5f2f4";
    if (state.mapColorHigh === undefined) state.mapColorHigh = "#115b70";
    if (state.mapBreaks === undefined) state.mapBreaks = "";
    if (state.dotLabels === undefined) state.dotLabels = "outliers";
    state.treeSort ??= "value";
    state.treeShowValues ??= true;
    state.treeMinShare ??= .5;

    const defaults = { ...state };
    const atlasWorkspace = document.getElementById("atlasWorkspace");
    const atlasDrawer = document.getElementById("atlasDrawer");
    const drawerTitle = document.getElementById("drawerTitle");
    const drawerToggle = document.getElementById("drawerToggle");
    const drawerRailToggle = document.getElementById("drawerRailToggle");
    const atlasHelpToggle = document.getElementById("atlasHelpToggle");
    const methodPanel = document.querySelector(".atlas-main .method");
    let drawerOpen = true;
    let drawerResizeTimer = 0;

    const setDrawerOpen = (open) => {
      drawerOpen = Boolean(open);
      atlasWorkspace?.classList.toggle("drawer-collapsed", !drawerOpen);
      atlasDrawer?.setAttribute("aria-hidden", String(!drawerOpen));
      if (atlasDrawer) atlasDrawer.inert = !drawerOpen;
      [drawerToggle, drawerRailToggle].forEach((button) => {
        if (!button) return;
        button.setAttribute("aria-expanded", String(drawerOpen));
      });
      if (drawerToggle) {
        drawerToggle.textContent = "«";
        drawerToggle.title = "Свернуть панель";
        drawerToggle.setAttribute("aria-label", "Свернуть панель");
      }
      if (drawerRailToggle) {
        const glyph = drawerRailToggle.querySelector("span");
        if (glyph) glyph.textContent = drawerOpen ? "«" : "»";
        drawerRailToggle.title = drawerOpen ? "Свернуть панель параметров" : "Открыть панель параметров";
      }
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
      window.clearTimeout(drawerResizeTimer);
      drawerResizeTimer = window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 260);
    };

    const closeMethodPanel = () => {
      methodPanel?.classList.remove("is-open");
      atlasHelpToggle?.setAttribute("aria-expanded", "false");
    };

    const toggleMethodPanel = () => {
      if (!methodPanel) return;
      const open = !methodPanel.classList.contains("is-open");
      methodPanel.classList.toggle("is-open", open);
      atlasHelpToggle?.setAttribute("aria-expanded", String(open));
    };

    if (methodPanel && !methodPanel.querySelector(".method-close")) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "method-close";
      close.textContent = "×";
      close.title = "Закрыть методику";
      close.setAttribute("aria-label", "Закрыть методику");
      close.addEventListener("click", closeMethodPanel);
      methodPanel.prepend(close);
    }
    drawerToggle?.addEventListener("click", () => setDrawerOpen(false));
    drawerRailToggle?.addEventListener("click", () => setDrawerOpen(!drawerOpen));
    atlasHelpToggle?.setAttribute("aria-expanded", "false");
    atlasHelpToggle?.addEventListener("click", toggleMethodPanel);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMethodPanel();
    });
    setDrawerOpen(true);

    const enumValues = {
      view: ["treemap", "heatmap", "arrow", "pyramid", "map", "dotogram", "infrastructure"],
      sex: ["all", "1", "2"],
      age: ["all", "0_14", "15_44", "45_64", "65_79", "80P"],
      treeType: ["root", "class", "block"],
      treeMetric: ["n", "share", "pgpzh", "rate"],
      treeColor: ["count", "change", "age"],
      treeSort: ["value", "name", "change"],
      heatUnit: ["mo", "settlement"],
      heatMetric: ["share", "n", "per1k", "per10k", "per100k"],
      heatLimit: ["25", "50", "all"],
      arrowMode: ["time", "sex", "region"],
      rankView: ["compare", "trend"],
      rankCompare: ["time", "sex"],
      rankLevel: ["class", "block", "code"],
      rankMetric: ["n", "share", "pgpzh"],
      rankTop: ["10", "15", "20"],
      rankOnlyChanges: ["0", "1"],
      pyramidView: ["structure", "trend", "gap"],
      pyramidLevel: ["class", "block", "code"],
      pyramidMetric: ["n", "share", "pgpzh"],
      pyramidAgeStep: ["5", "10"],
      pyramidLabels: ["all", "major", "off"],
      plotView: ["profile", "compare", "distribution"],
      plotLevel: ["class", "block", "code"],
      plotInterval: ["p10p90", "range"],
      plotSort: ["n", "medianAsc", "medianDesc", "spread", "shift"],
      plotMinN: ["5", "10", "20", "50"],
      plotTop: ["15", "25"],
      plotCompare: ["time", "sex"],
      plotDistributionMetric: ["n", "share"],
      mapUnit: ["settlement", "mo"],
      mapMetric: Object.keys(DEMO.mortality),
      mapLabels: ["auto", "centers", "off"],
      mapPalette: ["teal", "blue", "purple", "orange", "green", "rose", "custom"],
      dotUnit: ["settlement", "mo"],
      dotMetric: Object.keys(DEMO.mortality),
      dotLabels: ["outliers", "top", "off"]
    };
    const classKeys = new Set(["pyramidClass", "pyramidParentClass", "plotClass", "mapClass", "dotClass", "rankClass"]);
    const urlKeys = Object.keys(defaults);
    let restoringHistory = false;
    let searchTarget = null;
    let suppressSmallValues = false;
    let mapViewport = [0, 0, 760, 790];
    const debugMap = new URLSearchParams(window.location.search).get("debug") === "1";
    const filteredCache = new Map();
    const geoAggregateCache = new Map();
    const mapScaleCache = new Map();
    const mapPerformance = { filterMiss: false, aggregateMiss: false, filterMs: 0, aggregateMs: 0 };
    const originalFiltered = filtered;
    const cachePut = (cache, key, value, maximum = 16) => {
      if (cache.has(key)) cache.delete(key);
      cache.set(key, value);
      while (cache.size > maximum) cache.delete(cache.keys().next().value);
      return value;
    };
    const filterStateKey = () => `${state.year}|${state.sex}|${state.age}`;
    const filterOptionsKey = (options = {}) => {
      const years = Array.isArray(options.years) ? options.years.join(",") : "";
      return `${filterStateKey()}|years:${years}|ignoreYear:${options.ignoreYear ? 1 : 0}|ignoreSex:${options.ignoreSex ? 1 : 0}`;
    };
    filtered = (options = {}) => {
      const key = filterOptionsKey(options);
      if (filteredCache.has(key)) return filteredCache.get(key);
      const started = performance.now();
      const result = originalFiltered(options);
      mapPerformance.filterMiss = true;
      mapPerformance.filterMs = performance.now() - started;
      return cachePut(filteredCache, key, result, 48);
    };
    const optimizedTreeItems = () => {
      const rows = filtered();
      const definitions = state.treeType === "root"
        ? DATA.classes.map((definition, index) => ({
            i: index,
            code: definition.roman,
            label: definition.short,
            color: definition.color,
            next: "class"
          }))
        : state.treeType === "class"
          ? DATA.blocks
              .map((definition, index) => ({ definition, index }))
              .filter(({ definition }) => definition.class === state.treeIndex)
              .map(({ definition, index }) => ({
                i: index,
                code: definition.code,
                label: definition.label,
                color: DATA.classes[definition.class].color,
                next: "block"
              }))
          : DATA.codes
              .map((definition, index) => ({ definition, index }))
              .filter(({ definition }) => definition.block === state.treeIndex)
              .map(({ definition, index }) => ({
                i: index,
                code: definition.code,
                label: definition.label,
                color: DATA.classes[definition.class].color,
                next: "code"
              }));
      const itemIndex = (row) => state.treeType === "root"
        ? classOf(row)
        : state.treeType === "class" ? blockOf(row) : row[3];
      const current = new Map(definitions.map((definition) => [definition.i, { ...definition, rows: [] }]));
      rows.forEach((row) => {
        const entry = current.get(itemIndex(row));
        if (entry) entry.rows.push(row);
      });
      const minimumYear = Math.min(...DATA.years);
      const periodYears = state.year === "all"
        ? DATA.years.length <= 3
          ? [[DATA.years[0]], [DATA.years[DATA.years.length - 1]]]
          : [DATA.years.slice(0, Math.floor(DATA.years.length / 2)), DATA.years.slice(Math.floor(DATA.years.length / 2))]
        : [[Math.max(minimumYear, +state.year - 1)], [+state.year]];
      const periodAggregates = periodYears.map((years) => {
        const aggregate = new Map(definitions.map((definition) => [definition.i, { n: 0, pgpzh: 0 }]));
        filtered({ years }).forEach((row) => {
          const entry = aggregate.get(itemIndex(row));
          if (!entry) return;
          entry.n += 1;
          if (row[2] >= 0) entry.pgpzh += Math.max(75 - row[2], 0);
        });
        return { aggregate, years: years.length };
      });
      const total = rows.length;
      return [...current.values()]
        .filter((entry) => entry.rows.length)
        .map((entry) => {
          const summary = stats(entry.rows);
          const values = periodAggregates.map(({ aggregate, years }) => {
            const value = aggregate.get(entry.i) || { n: 0, pgpzh: 0 };
            return (state.treeMetric === "pgpzh" ? value.pgpzh : value.n) / years;
          });
          const change = values[0] > 0 ? (values[1] - values[0]) / values[0] * 100 : null;
          const value = state.treeMetric === "pgpzh"
            ? summary.pgpzh
            : state.treeMetric === "share" ? summary.n / Math.max(total, 1) * 100 : summary.n;
          return { ...entry, ...summary, value, change };
        })
        .sort((left, right) => right.value - left.value);
    };
    treeItems = optimizedTreeItems;
    geoValues = (unit, classKey) => {
      const key = `${filterStateKey()}|${unit}`;
      let aggregate = geoAggregateCache.get(key);
      if (!aggregate) {
        const started = performance.now();
        const definitions = unit === "mo" ? DATA.municipalities : DATA.settlements;
        const position = unit === "mo" ? 4 : 5;
        const table = new Map();
        filtered().forEach((row) => {
          const index = row[position];
          if (index < 0) return;
          if (!table.has(index)) {
            table.set(index, {
              idx: index,
              total: 0,
              selected: 0,
              ages: [],
              pgpzh: 0,
              classes: new Array(DATA.classes.length).fill(0)
            });
          }
          const value = table.get(index);
          const classIndex = classOf(row);
          value.total += 1;
          if (row[2] >= 0) {
            value.ages.push(row[2]);
            value.pgpzh += Math.max(75 - row[2], 0);
          }
          if (classIndex >= 0) value.classes[classIndex] += 1;
        });
        if (unit === "mo") definitions.forEach((_, idx) => {
          if (!table.has(idx)) table.set(idx, {idx, total:0, selected:0, ages:[], pgpzh:0, classes:new Array(DATA.classes.length).fill(0)});
        });
        aggregate = cachePut(geoAggregateCache, key, { defs: definitions, table }, 24);
        mapPerformance.aggregateMiss = true;
        mapPerformance.aggregateMs = performance.now() - started;
      }
      const map = new Map();
      aggregate.table.forEach((value, index) => {
        map.set(index, {
          ...value,
          selected: classKey === "all" ? value.total : value.classes[+classKey] || 0
        });
      });
      return { defs: aggregate.defs, map };
    };

    const isValid = (key, value) => {
      if (key === "treeShowValues") return value === "true" || value === "false";
      if (key === "treeMinShare") return value.trim() !== "" && Number.isFinite(+value) && +value >= 0 && +value <= 3;
      if (key === "dotDataset") return ["mortality", "resources"].includes(value);
      if (key === "infraResources") return ["off", "on"].includes(value);
      if (key === "resourceYear") return ["2023", "2024", "2025"].includes(value);
      if (key === "resourceLayout") return value === "rank" || value === "years";
      if (key === "resourceSelected") return value === "" || DATA.municipalities.some(t => t.id === Number(value));
      if (key === "resourceIndicator") return ["fap_count","doctors_rate","nurses_rate","cardiologist_rate","neurologist_rate","ambulance_doctor_rate","doctors_persons_pct","visits_person","beds_24h_count","beds_24h_rate","therapist_rate","endocrinologist_rate","surgeon_rate","traumatologist_rate","anesthetist_rate","ophthalmologist_rate","ent_rate","dermatologist_rate","infectiologist_rate","psychiatrist_rate","pediatrician_rate","obgyn_rate","doctors_positions_pct","doctors_multiple","nurses_positions_pct","nurses_persons_pct","nurses_multiple","fap_visits_mean","visits_illness","visits_preventive","visits_dental","visits_doctor_position","therapist_load","cardiologist_load","endocrinologist_load","infectiologist_load","pediatrician_load","neurologist_load","surgeon_load","traumatologist_load","obgyn_load","ophthalmologist_load","ent_load","phthisiatrist_load","beds_day_rate","occupancy_24h","occupancy_day","stay_24h","stay_day","turnover_24h","turnover_day","hospitalization_rate","hospital_fatality_pct","xray_rate","fluorography_rate","ultrasound_rate","endoscopy_rate","functional_rate","xray_per100visits","functional_per100visits","physiotherapy_per100visits","lab_per100visits"].includes(value);
      if (enumValues[key]) return enumValues[key].includes(value);
      if (key === "year") return value === "all" || DATA.years.map(String).includes(value);
      if (key === "mapCode") return value === "all" || mapCodes.has(value);
      if (key === "plotYearA" || key === "plotYearB") return DATA.years.map(String).includes(value);
      if (classKeys.has(key)) return value === "all" || (Number.isInteger(+value) && +value >= 0 && +value < DATA.classes.length);
      if (key === "pyramidCause") return value === "all" || (Number.isInteger(+value) && +value >= 0 && +value < Math.max(DATA.classes.length, DATA.blocks.length, DATA.codes.length));
      if (key === "plotCause") return value === "all" || (Number.isInteger(+value) && +value >= 0 && +value < Math.max(DATA.classes.length, DATA.blocks.length, DATA.codes.length));
      if (key === "treeIndex") return Number.isInteger(+value) && +value >= -1 && +value < Math.max(DATA.classes.length, DATA.blocks.length);
      if (key === "mapScaleMax") return value === "" || (Number.isFinite(+value) && +value >= 0 && +value <= 1e9);
      if (key === "mapBreaks") {
        if (value === "") return true;
        const breaks = value.split(",").map(Number);
        return breaks.length === 4
          && breaks.every((item) => Number.isFinite(item) && item > 0 && item <= 1e9)
          && breaks.every((item, index) => index === 0 || item > breaks[index - 1]);
      }
      if (key === "mapColorLow" || key === "mapColorHigh") return /^#[0-9a-f]{6}$/i.test(value);
      return false;
    };

    const readUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      urlKeys.forEach((key) => {
        const value = params.get(key);
        if (value !== null && isValid(key, value)) {
          state[key] = key === "treeShowValues" ? value === "true" : key === "treeMinShare" ? Number(value) : value;
        }
      });
      if (mapCodes.has(state.mapCode)) state.mapClass = String(mapCodes.get(state.mapCode).class);
    };

    const writeUrlState = () => {
      if (restoringHistory) return;
      const url = new URL(window.location.href);
      urlKeys.forEach((key) => {
        const value = String(state[key]);
        if (value === String(defaults[key])) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      });
      history.replaceState(null, "", url);
    };

    window.addEventListener("atlas:resource-options", () => {
      writeUrlState();
      updateMethodDescription();
    });
    const syncGlobalControls = () => {
      const year = document.getElementById("yearSelect");
      const age = document.getElementById("ageSelect");
      if (year) { year.value = state.year; year.disabled = true; }
      if (age) { age.value = state.age; age.disabled = true; }
      document.querySelectorAll("#sexSeg button").forEach(button => { button.disabled = true; });
      document.querySelectorAll("#sexSeg button").forEach((button) => button.classList.toggle("active", button.dataset.value === state.sex));
      document.querySelectorAll(".viz-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
    };

    const resetTransientGlobalControlState = () => {
      const year = document.getElementById("yearSelect");
      const age = document.getElementById("ageSelect");
      if (year) year.disabled = false;
      if (age) age.disabled = false;
      document.querySelectorAll("#sexSeg button").forEach((button) => { button.disabled = false; });
      document.body.classList.remove(
        "pyramid-filters-suspended",
        "pyramid-trend-mode",
        "plot-year-suspended",
        "plot-sex-suspended"
      );
    };

    const paletteDefinitions = {
      teal: { label: "Сине-бирюзовая", colors: ["#e5f2f4", "#79b4bf", "#115b70"] },
      blue: { label: "Синяя", colors: ["#eff6ff", "#78aee8", "#174a8b"] },
      purple: { label: "Фиолетовая", colors: ["#f5f1fb", "#b69bd6", "#5b2a86"] },
      orange: { label: "Оранжевая", colors: ["#fff4e6", "#f2a65a", "#a94712"] },
      green: { label: "Зелёная", colors: ["#edf8ef", "#7fc392", "#176b3a"] },
      rose: { label: "Розово-бордовая", colors: ["#fff0f3", "#df8ca1", "#8f2444"] },
      custom: { label: "Своя палитра", colors: [] }
    };

    const paletteColors = () => state.mapPalette === "custom"
      ? [state.mapColorLow, state.mapColorHigh]
      : paletteDefinitions[state.mapPalette]?.colors || paletteDefinitions.teal.colors;

    const rgbFromHex = (hex) => {
      const value = String(hex).replace("#", "");
      return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    };

    const continuousPaletteColor = (value) => {
      const colors = paletteColors();
      const bounded = Math.max(0, Math.min(1, Number(value) || 0));
      const position = bounded * (colors.length - 1);
      const index = Math.min(Math.floor(position), colors.length - 2);
      const fraction = position - index;
      const start = rgbFromHex(colors[index]);
      const end = rgbFromHex(colors[index + 1]);
      const mixed = start.map((channel, channelIndex) => Math.round(channel + (end[channelIndex] - channel) * fraction));
      return `rgb(${mixed.join(",")})`;
    };

    const paletteClassColors = (count = 5) => Array.from(
      { length: count },
      (_, index) => continuousPaletteColor(count === 1 ? .6 : index / (count - 1))
    );

    let activeMapBreakFractions = [0, .2, .4, .6, .8, 1];

    const mapBreakInputValue = (value) => {
      const rounded = Math.round(Number(value) * 100) / 100;
      return Number.isFinite(rounded) ? String(rounded) : "";
    };

    const equalIntervalBreaks = (scaleMaximum) => {
      const raw = Array.from({ length: 4 }, (_, index) => scaleMaximum * (index + 1) / 5);
      const precision = state.mapMetric === "n" && scaleMaximum >= 5 ? 0 : scaleMaximum >= 100 ? 1 : 2;
      const rounded = raw.map((value) => Number(value.toFixed(precision)));
      return rounded.every((value, index) => value > (index === 0 ? 0 : rounded[index - 1]) && value < scaleMaximum)
        ? rounded
        : raw;
    };

    const jenksBreaks = (source, classCount) => {
      const data = source.filter(Number.isFinite).sort((left, right) => left - right);
      const length = data.length;
      if (!length || classCount < 2) return [data[0] || 0, data[length - 1] || 0];
      const lower = Array.from({ length: length + 1 }, () => new Float64Array(classCount + 1));
      const variance = Array.from({ length: length + 1 }, () => new Float64Array(classCount + 1).fill(Infinity));
      for (let index = 1; index <= classCount; index += 1) {
        lower[1][index] = 1;
        variance[1][index] = 0;
      }
      for (let end = 2; end <= length; end += 1) {
        let sum = 0, sumSquares = 0, weight = 0, currentVariance = 0;
        for (let offset = 1; offset <= end; offset += 1) {
          const start = end - offset + 1;
          const value = data[start - 1];
          weight += 1;
          sum += value;
          sumSquares += value * value;
          currentVariance = sumSquares - sum * sum / weight;
          const previous = start - 1;
          if (previous > 0) {
            for (let group = 2; group <= classCount; group += 1) {
              const candidate = currentVariance + variance[previous][group - 1];
              if (candidate < variance[end][group]) {
                lower[end][group] = start;
                variance[end][group] = candidate;
              }
            }
          }
        }
        lower[end][1] = 1;
        variance[end][1] = currentVariance;
      }
      const result = new Array(classCount + 1).fill(0);
      result[0] = data[0];
      result[classCount] = data[length - 1];
      let end = length;
      for (let group = classCount; group > 1; group -= 1) {
        const index = Math.max(0, Math.round(lower[end][group]) - 2);
        result[group - 1] = data[index];
        end = Math.max(1, Math.round(lower[end][group]) - 1);
      }
      return result;
    };

    const automaticMapBreaks = (metricValues, scaleMaximum) => {
      const positive = metricValues
        .filter((value) => Number.isFinite(value) && value > 0 && value <= scaleMaximum);
      const unique = [...new Set(positive)];
      if (unique.length < 5) return equalIntervalBreaks(scaleMaximum);
      const raw = jenksBreaks([...positive, scaleMaximum], 5).slice(1, -1);
      const valid = raw.length === 4
        && raw.every((value, index) => Number.isFinite(value)
          && value > (index === 0 ? 0 : raw[index - 1])
          && value < scaleMaximum);
      return valid ? raw : equalIntervalBreaks(scaleMaximum);
    };

    const mapCauseKey = () => state.mapCode === "all" ? state.mapClass : state.mapCode;
    const mapCauseLabel = () => {
      const code = mapCodes.get(state.mapCode);
      const category = DATA.classes[Number(state.mapClass)];
      return code ? `${code.code} · ${code.label}`
        : category ? `${category.roman}. ${category.short}` : "Все классы МКБ-10";
    };
    const mapPeriodLabel = () => `${DATA.years[0]}–${DATA.years.at(-1)}`;
    const currentMapPeriod = () => state.year === "all" ? mapPeriodLabel() : state.year;
    const mapDeathSummaryHtml = ({ map }) => {
      let deaths = 0;
      let hasValues = false;
      for (const value of map.values()) {
        if (!Number.isFinite(value.metricValue)) continue;
        hasValues = true;
        if (!suppressSmallValues || value.selected >= 5) deaths += value.selected;
      }
      const cause = esc(mapCauseLabel());
      const stat = hasValues || !rateBase(state.mapMetric)
        ? `<strong data-map-death-count>${fmt(deaths)}</strong> <span>смертей на карте</span>`
        : '<span>Нет данных для расчёта</span>';
      return `<div class="map-death-summary__stat">${stat}</div>
        <div class="map-death-summary__cause">${cause}</div>
        <div class="map-death-summary__period">${currentMapPeriod()}</div>`;
    };
    const fixedMapScaleLabel = () => `Единая шкала · ${mapPeriodLabel()}`;
    const mapScaleLabel = context => context.fixed ? fixedMapScaleLabel()
      : context.manualScale ? "шкала задана вручную" : "автомасштаб по фильтру · Дженкс";
    const mapMetricLabel = () => state.mapUnit === "settlement" ? "Население НП" : demoMetric(state.mapMetric).label;
    const formatMapMetric = value => Number.isFinite(value) ? DF.format(value) : "Нет данных";

    let cardSeriesKey = "";
    let cardSeries = new Map();
    const mapAnnualSeries = () => {
      const cause = mapCauseKey();
      const key = `${state.sex}|${state.age}|${state.mapUnit}|${cause}`;
      if (cardSeriesKey === key) return cardSeries;
      cardSeriesKey = key;
      cardSeries = new Map();
      const position = state.mapUnit === "mo" ? 4 : 5;
      filtered({ ignoreYear: true }).forEach(row => {
        const index = row[position];
        if (index < 0) return;
        const key = `${index}|${row[0]}`;
        const aggregate = cardSeries.get(key) || { total: 0, selected: 0 };
        aggregate.total += 1;
        const matches = state.mapCode === "all" ? cause === "all" || classOf(row) === Number(cause)
          : DATA.codes[row[3]]?.code === cause;
        if (matches) aggregate.selected += 1;
        cardSeries.set(key, aggregate);
      });
      return cardSeries;
    };

    const fixedMunicipalityBreaks = series => {
      const values = [...series.values()].map(row => row.selected).filter(value => value > 0);
      if (!values.length) return [];
      const maximum = Math.max(...values);
      const rounded = [.25, .5, .75, .95].map(percentile => {
        const value = quantile(values, percentile);
        const step = value < 50 ? 5 : 10;
        return Math.ceil(value / step) * step;
      });
      return [...new Set(rounded)].filter(value => value < maximum);
    };

    const mapScaleContext = () => {
      const cacheKey = [
        filterStateKey(), state.mapUnit, mapCauseKey(), state.mapMetric,
        state.mapScaleMax, state.mapBreaks
      ].join("|");
      if (mapScaleCache.has(cacheKey)) return mapScaleCache.get(cacheKey);
      const defs = state.mapUnit === "mo" ? DATA.municipalities : DATA.settlements;
      const map = new Map(defs.map((definition, idx) => [idx, {
        idx, selected: 0, total: 0, classes: [], ages: [], pgpzh: 0,
        metricValue: state.mapUnit === "mo" ? demoMetric(state.mapMetric).values[definition.id] ?? null : null
      }]));
      const series = mapAnnualSeries();
      const totalRows = filtered().length;
      const years = state.year === "all" ? DATA.years : [state.year];
      const metricValues = [...map.values()].map(value => value.metricValue).filter(Number.isFinite);
      if (fixedMunicipalityCount()) {
        const cuts = fixedMunicipalityBreaks(series);
        return cachePut(mapScaleCache, cacheKey, {
          defs, map, series, fixed: true, boundaries: [0, ...cuts, Infinity], innerBreaks: cuts,
          zeroColor: "#e3e8ed"
        }, 24);
      }
      const manualMaximum = Number(state.mapScaleMax);
      const scaleMaximum = manualMaximum > 0 ? manualMaximum : Math.max(1, ...metricValues);
      const automatic = automaticMapBreaks(metricValues, scaleMaximum);
      const requested = String(state.mapBreaks || "").split(",").map(Number);
      const manual = requested.length === 4
        && requested.every((value, index) => Number.isFinite(value)
          && value > (index === 0 ? 0 : requested[index - 1])
          && value < scaleMaximum);
      if (state.mapBreaks && !manual) state.mapBreaks = "";
      const innerBreaks = manual ? requested : automatic;
      const boundaries = [0, ...innerBreaks, scaleMaximum];
      return cachePut(mapScaleCache, cacheKey, {
        defs, map, series,
        boundaries, innerBreaks, manual, metricValues, scaleMaximum,
        algorithm: manual ? "manual" : "jenks",
        manualScale: manualMaximum > 0
      }, 24);
    };

    const mapClassIndex = (value, boundaries) => {
      for (let index = 1; index < boundaries.length - 1; index += 1) {
        if (value <= boundaries[index]) return index - 1;
      }
      return boundaries.length - 2;
    };
    const mapClassColors = context => paletteClassColors(context.boundaries.length - 1);
    const fixedMapLegendHtml = context => {
      const intervals = mapClassColors(context).map((color, index) => {
        const lower = fmt(context.boundaries[index]);
        const upper = context.boundaries[index + 1];
        const label = upper === Infinity ? `> ${lower}` : `> ${lower} и ≤ ${fmt(upper)}`;
        return `<div class="site-map-class-row"><i style="background:${color}"></i><span>${label}</span></div>`;
      });
      return `<div class="site-map-class-breaks" data-fixed-map-legend aria-label="${fixedMapScaleLabel()}">
        <div class="site-map-class-row"><i style="background:${context.zeroColor}"></i><span>0 · нет зарегистрированных случаев</span></div>
        ${intervals.join("")}
      </div>`;
    };

    const syncActiveMapBreaks = () => {
      const context = mapScaleContext();
      if (!context.fixed) activeMapBreakFractions = context.boundaries.map((value) => value / context.scaleMaximum);
      return context;
    };

    const paletteColor = (value) => {
      const bounded = Math.max(0, Math.min(1, Number(value) || 0));
      const classIndex = mapClassIndex(bounded, activeMapBreakFractions);
      return paletteClassColors()[classIndex];
    };

    window.mapRamp = paletteColor;

    const addSupplementalControls = () => {
      const controls = document.getElementById("localControls");
      if (!controls) return;
      if (state.view === "map") {
        const note = controls.querySelector(".site-rate-note");
        if (note) document.getElementById("mapMetric")?.closest(".field")?.insertAdjacentElement("afterend", note);
      }
      if (state.view === "treemap") {
        const color = document.getElementById("treeColor");
        if (color && !color.querySelector('option[value="count"]')) {
          color.insertAdjacentHTML("afterbegin", '<option value="count">Количество · пастельная градация</option>');
        }
        if (color) color.value = state.treeColor;
      }
      if (state.view === "map") {
        const paletteOptions = Object.entries(paletteDefinitions)
          .map(([value, definition]) => `<option value="${value}">${definition.label}</option>`)
          .join("");
        const customColors = state.mapPalette === "custom" ? `
          <div class="site-map-palette-colors">
            <label><span>Минимум <output>${state.mapColorLow.toUpperCase()}</output></span><input id="mapColorLow" type="color" value="${state.mapColorLow}"></label>
            <label><span>Максимум <output>${state.mapColorHigh.toUpperCase()}</output></span><input id="mapColorHigh" type="color" value="${state.mapColorHigh}"></label>
          </div>` : "";
        const paletteHint = state.mapUnit === "settlement" ? "Размер точки — численность по переписи 2021 года." : "Автоматические границы по опубликованным значениям МО.";
        controls.insertAdjacentHTML("beforeend", `
          <div class="field"><label for="mapPalette">Палитра числовой шкалы</label>
          <select id="mapPalette">${paletteOptions}</select>
          <div class="site-map-palette-preview" aria-label="Пять цветовых классов">${paletteClassColors().map((color) => `<span style="background:${color}"></span>`).join("")}</div>
          ${customColors}<p class="site-map-palette-hint">${paletteHint}</p></div>`);
        const palette = document.getElementById("mapPalette");
        palette.value = state.mapPalette;
        palette.onchange = () => { state.mapPalette = palette.value; render(); };
        ["mapColorLow", "mapColorHigh"].forEach((key) => {
          const input = document.getElementById(key);
          if (input) input.onchange = () => { state[key] = input.value.toLowerCase(); render(); };
        });
        controls.insertAdjacentHTML("beforeend", `
          <div class="field"><label for="mapLabels">Подписи на карте</label>
          <select id="mapLabels"><option value="auto">Авто по масштабу</option><option value="centers">Только ключевые центры</option><option value="off">Без подписей</option></select></div>`);
        const labels = document.getElementById("mapLabels");
        labels.value = state.mapLabels;
        labels.onchange = () => { state.mapLabels = labels.value; render(); };

      }
      if (state.view === "dotogram" && state.dotUnit === "settlement") {
        controls.insertAdjacentHTML("beforeend", `
          <div class="field"><label for="dotLabels">Подписи точек</label>
          <select id="dotLabels"><option value="outliers">Статистические выбросы</option><option value="top">Топ-10 значений</option><option value="off">Без подписей</option></select></div>`);
        const labels = document.getElementById("dotLabels");
        labels.value = state.dotLabels;
        labels.onchange = () => { state.dotLabels = labels.value; render(); };
      }
    };

    const pastelVolumeColor = (hex, ratio) => {
      const value = String(hex || "#607d9d").replace("#", "");
      const source = value.length === 3
        ? value.split("").map((part) => parseInt(part + part, 16))
        : [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
      const intensity = Math.sqrt(Math.max(0, Math.min(1, ratio || 0)));
      /*
       * White labels are an approved part of the atlas. Mixing each class hue
       * with a graphite base preserves a quiet pastel-like palette while keeping
       * even yellow and orange classes readable.
       */
      const graphite = [28, 45, 68];
      const colorWeight = .38 + intensity * .2;
      const muted = source.map((channel, index) =>
        Math.round(channel * colorWeight + graphite[index] * (1 - colorWeight))
      );
      return `rgb(${muted.join(",")})`;
    };

    const enhanceTreemap = () => {
      if (state.view !== "treemap") return;
      const items = treeItems();
      const byCode = new Map(items.map((item) => [String(item.code), item]));
      const maximum = Math.max(...items.map((item) => item.n), 1);
      document.querySelectorAll(".tile").forEach((tile) => {
        const item = byCode.get(tile.querySelector(".tile-code")?.textContent.trim());
        if (item && state.treeColor === "count") {
          tile.style.background = pastelVolumeColor(item.color, item.n / maximum);
        }
        tile.style.setProperty("color", "#ffffff", "important");
      });
      improveTreemapContrast();
      if (state.treeColor === "count") {
        document.getElementById("methodText").textContent = "Площадь показывает выбранный показатель, а насыщенность пастельного цвета — число смертей внутри текущего уровня. Чем темнее плитка, тем больше наблюдений.";
      }
    };

    const enhanceHeatmapContrast = () => {
      if (state.view !== "heatmap") return;
      const luminance = (channels) => channels
        .map((channel) => {
          const value = channel / 255;
          return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      document.querySelectorAll(".heat-cell").forEach((cell) => {
        const channels = getComputedStyle(cell).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (!channels || channels.length !== 3) return;
        const background = luminance(channels);
        const whiteContrast = 1.05 / (background + .05);
        const inkLuminance = 0;
        const inkContrast = (Math.max(background, inkLuminance) + .05) / (Math.min(background, inkLuminance) + .05);
        cell.style.color = whiteContrast >= inkContrast ? "#ffffff" : "#000000";
        if (whiteContrast >= inkContrast) cell.style.textShadow = "0 1px 2px rgba(0,0,0,.28)";
        else cell.style.textShadow = "none";
      });
    };

    const enhanceMapPaletteLegend = () => {
      if (state.view !== "map") return;
      const ramp = document.querySelector(".legend-ramp");
      if (!ramp) return;
      const paletteName = paletteDefinitions[state.mapPalette]?.label || paletteDefinitions.teal.label;
      const context = syncActiveMapBreaks();
      const { boundaries, innerBreaks, manual, metricValues, scaleMaximum } = context;
      const colors = mapClassColors(context);
      const counts = new Array(5).fill(0);
      metricValues.forEach((value) => { counts[mapClassIndex(value, boundaries)] += 1; });
      ramp.style.background = "none";
      ramp.classList.add("site-map-discrete-ramp");
      ramp.innerHTML = colors.map((color) => `<span style="background:${color}"></span>`).join("");
      ramp.setAttribute("role", "img");
      ramp.setAttribute("aria-label", `Палитра ${paletteName}, пять интервальных классов`);
      const caption = document.createElement("div");
      caption.className = "site-map-palette-caption";
      caption.textContent = state.mapPalette === "custom"
        ? `5 классов Дженкса · ${state.mapColorLow.toUpperCase()} → ${state.mapColorHigh.toUpperCase()}`
        : `5 классов Дженкса · ${paletteName}`;
      const range = ramp.nextElementSibling;
      range?.insertAdjacentElement("afterend", caption);
      const breaks = document.createElement("div");
      breaks.className = "site-map-class-breaks";
      breaks.innerHTML = colors.map((color, index) => {
        const rawLower = boundaries[index];
        const lower = state.mapMetric === "n" && index > 0 ? Math.floor(rawLower) + 1 : rawLower;
        const upper = boundaries[index + 1];
        const input = index < 4
          ? `<input class="site-map-break-input" type="number" min="0" max="${scaleMaximum}" step="any" value="${mapBreakInputValue(innerBreaks[index])}" data-map-break="${index}" aria-label="Верхняя граница класса ${index + 1}">`
          : '<span class="site-map-break-auto">авто</span>';
        return `<div class="site-map-class-row"><i style="background:${color}"></i><span class="site-map-class-label"><span>${formatMapMetric(lower)}–${formatMapMetric(upper)}</span><small>(${counts[index]} шт.)</small></span>${input}</div>`;
      }).join("");
      const classificationSource = state.mapUnit === "settlement" ? "по НП" : "по муниципалитетам";
      breaks.insertAdjacentHTML("beforeend", `<div class="site-map-break-actions"><span>${manual ? "границы настроены вручную" : `автоматические интервалы Дженкса · ${classificationSource}`}</span><button type="button" id="mapBreaksReset"${manual ? "" : " disabled"}>Сбросить в авто</button></div>`);
      caption.insertAdjacentElement("afterend", breaks);
      if (motionDuration() && typeof breaks.animate === "function") {
        breaks.animate(
          [{ opacity: .45, transform: "translateX(4px)" }, { opacity: 1, transform: "translateX(0)" }],
          { duration: Math.min(motionDuration(), 210), easing: "ease-out" }
        );
      }
      const inputs = [...breaks.querySelectorAll(".site-map-break-input")];
      const applyBreaks = () => {
        const values = inputs.map((input) => Number(input.value));
        const valid = values.every((value, index) => Number.isFinite(value)
          && value > (index === 0 ? 0 : values[index - 1])
          && value < scaleMaximum);
        inputs.forEach((input) => {
          input.classList.toggle("invalid", !valid);
          input.setCustomValidity(valid ? "" : "Границы должны возрастать и находиться между 0 и максимумом шкалы");
        });
        if (!valid) {
          inputs.find((input) => !input.checkValidity())?.reportValidity();
          return;
        }
        state.mapBreaks = values.join(",");
        render();
      };
      inputs.forEach((input) => {
        input.addEventListener("change", applyBreaks);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") applyBreaks();
        });
      });
      breaks.querySelector("#mapBreaksReset")?.addEventListener("click", () => {
        state.mapBreaks = "";
        render();
      });
    };

    const dotMetricValue = (_, definition) => demoMetric(state.dotMetric).values[definition.id] ?? null;

    const formatDotValue = value => Number.isFinite(value) ? DF.format(value) : "Нет данных";

    const dotColor = () => "#356a9d";

    const drawDotAxis = (chart, scale, domainMin, domainMax, width, height, left, top, bottom) => {
      const rootScaled = state.dotMetric === "n" || state.dotMetric === "pgpzh" || Boolean(rateBase(state.dotMetric));
      for (let index = 0; index <= 5; index += 1) {
        const fraction = index / 5;
        const value = domainMin + (domainMax - domainMin) * (rootScaled ? fraction ** 2 : fraction);
        const x = scale(value);
        chart.appendChild(svg("line", { x1: x, y1: top, x2: x, y2: height - bottom, class: "gridline" }));
        textNode(chart, x, height - 23, formatDotValue(value), "axis-label", "middle");
        if (width <= 700) textNode(chart, x, top - 12, formatDotValue(value), "axis-label", "middle");
      }
      const median = quantile(window.__dotValuesForAxis || [], .5);
      if (median != null) {
        const x = scale(median);
        chart.appendChild(svg("line", { x1: x, y1: top, x2: x, y2: height - bottom, class: "dot-median-line" }));
        textNode(chart, width <= 700 ? Math.min(width - 150, x + 5) : x + 5, width <= 700 ? 18 : top + 12, `медиана ${formatDotValue(median)}`, "dot-median-label", "start");
      }
    };

    const drawNonOverlappingLabels = (chart, candidates, width, height, top, bottom) => {
      const boxes = [];
      candidates.forEach((candidate) => {
        const short = candidate.label.length > 22 ? `${candidate.label.slice(0, 21)}…` : candidate.label;
        const label = `${short} · ${formatDotValue(candidate.value)}`;
        const boxWidth = Math.min(168, Math.max(76, label.length * 5.5 + 14));
        const boxHeight = 17;
        const attempts = [
          [10, -19], [10, 5], [-boxWidth - 10, -19], [-boxWidth - 10, 5],
          [14, -38], [14, 24], [-boxWidth - 14, -38], [-boxWidth - 14, 24]
        ];
        let chosen = null;
        for (const [dx, dy] of attempts) {
          const box = { x: candidate.x + dx, y: candidate.y + dy, w: boxWidth, h: boxHeight };
          const inside = box.x >= 3 && box.x + box.w <= width - 3 && box.y >= top && box.y + box.h <= height - bottom;
          const overlaps = boxes.some((other) => !(box.x + box.w + 3 < other.x || other.x + other.w + 3 < box.x || box.y + box.h + 3 < other.y || other.y + other.h + 3 < box.y));
          if (inside && !overlaps) { chosen = box; break; }
        }
        if (!chosen) return;
        boxes.push(chosen);
        const edgeX = chosen.x > candidate.x ? chosen.x : chosen.x + chosen.w;
        const edgeY = chosen.y + chosen.h / 2;
        chart.appendChild(svg("line", { x1: candidate.x, y1: candidate.y, x2: edgeX, y2: edgeY, class: "dot-label-leader" }));
        chart.appendChild(svg("rect", { x: chosen.x, y: chosen.y, width: chosen.w, height: chosen.h, rx: 5, class: "dot-label-bg" }));
        textNode(chart, chosen.x + 6, chosen.y + 12, label, "dot-label", "start");
      });
    };

    const enhanceDotogram = () => {
      if (state.view !== "dotogram") return;
      if (state.dotDataset === "resources") {
        const viz = document.getElementById("viz");
        if (!viz.querySelector("[data-react-resource-comparison]")) viz.innerHTML = '<div data-react-resource-comparison></div>';
        document.getElementById("chartSubtitle").textContent = "Опубликованные медицинские показатели по муниципалитетам; год ресурсов выбирается отдельно.";
        document.getElementById("methodText").textContent = "Медицинские ресурсы: опубликованные показатели выбранного года без пересчёта на новое население. Пол, возраст и МКБ смертности не применяются. Отсутствие значения не является нулём; объединённые территории не распределяются автоматически.";
        return;
      }
      if (window.AmurDotogramAnalysis?.restoreCached?.()) return;
      const viz = document.getElementById("viz");
      const compact = matchMedia("(max-width: 700px)").matches;
      const touchSized = matchMedia("(max-width: 1023px)").matches;
      const availableWidth = Math.max(compact ? 300 : 760, Math.round(viz.clientWidth - 2));
      const availableHeight = Math.max(360, Math.round(viz.clientHeight - 36));
      const defs = DATA.municipalities;
      const map = new Map(defs.map((_, idx) => [idx, { idx, total: 0, selected: 0, classes: [], ages: [] }]));
      const values = [...map.values()].map((value) => ({ ...value, value: dotMetricValue(value, defs[value.idx]) })).filter((value) => value.value != null && Number.isFinite(value.value));
      if (!values.length) {
        document.getElementById("viz").innerHTML = `<div class="empty">${esc(rateBase(state.dotMetric) ? rateBasisText(state.dotUnit) : "Нет данных для выбранных фильтров.")}</div>`;
        return;
      }
      const rawValues = values.map((value) => value.value);
      const observedMin = Math.min(...rawValues);
      const observedMax = Math.max(...rawValues);
      const domainMin = state.dotMetric === "median" ? Math.max(0, observedMin - 5) : 0;
      const domainMax = observedMax > domainMin ? observedMax * 1.08 : domainMin + 1;
      window.__dotValuesForAxis = rawValues;
      const scaleFraction = (value) => {
        const fraction = Math.max(0, Math.min(1, (value - domainMin) / (domainMax - domainMin || 1)));
        return state.dotMetric === "n" || state.dotMetric === "pgpzh" || Boolean(rateBase(state.dotMetric)) ? Math.sqrt(fraction) : fraction;
      };

      if (state.dotUnit === "mo") {
        values.sort((left, right) => right.value - left.value || defs[left.idx].name.localeCompare(defs[right.idx].name, "ru"));
        const width = availableWidth, top = compact ? 58 : 30, bottom = 42;
        const left = compact ? 20 : Math.max(205, Math.min(270, width * .23)), right = compact ? 20 : Math.max(62, width * .065);
        const height = compact ? top + bottom + values.length * 76 : touchSized ? Math.max(availableHeight, top + bottom + values.length * 32) : availableHeight;
        const rowHeight = Math.max(8.5, (height - top - bottom) / Math.max(values.length, 1));
        const scale = (value) => left + scaleFraction(value) * (width - left - right);
        const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "svg-chart dotogram-ranked" });
        drawDotAxis(chart, scale, domainMin, domainMax, width, height, left, top, bottom);
        values.forEach((value, index) => {
          const definition = defs[value.idx];
          const y = top + index * rowHeight + (compact ? 46 : 15);
          chart.appendChild(svg("line", { x1: left, y1: y, x2: width - right, y2: y, class: "dot-row-guide" }));
          textNode(chart, compact ? 16 : left - 12, y + (compact ? -28 : 4), definition.name, "row-label", compact ? "start" : "end");
          chart.appendChild(svg("line", { x1: scale(domainMin), y1: y, x2: scale(value.value), y2: y, stroke: dotColor(value), "stroke-width": 3, opacity: .42 }));
          const point = svg("circle", { cx: scale(value.value), cy: y, r: 7, fill: dotColor(value), stroke: "#fff", "stroke-width": 1.5 });
          chart.appendChild(point);
          const anchor = scale(value.value) > width - right - 65 ? "end" : "start";
          textNode(chart, scale(value.value) + (anchor === "end" ? -10 : 10), y + 4, formatDotValue(value.value), "dot-value-label", anchor);
          addTip(point, '<b>' + esc(definition.name) + '</b><div class="tip-grid"><span>' + esc(demoMetric(state.dotMetric).unit) + '</span><strong>' + formatDotValue(value.value) + '</strong></div>');
        });
        document.getElementById("viz").innerHTML = "";
        document.getElementById("viz").appendChild(chart);
        document.getElementById("viz").insertAdjacentHTML("beforeend", '<div class="chart-note">Муниципалитеты отсортированы по значению. Линия и точка показывают одновременно ранг и величину показателя; вертикальный пунктир — медиану.</div>');
      } else {
        const groupTotals = new Map();
        values.forEach((value) => {
          const municipality = defs[value.idx].municipalityIndex;
          groupTotals.set(municipality, (groupTotals.get(municipality) || 0) + value.total);
        });
        const groups = [...groupTotals].sort((left, right) => right[1] - left[1]).map(([index]) => index);
        const groupPosition = new Map(groups.map((index, position) => [index, position]));
        const width = availableWidth, top = compact ? 58 : 34, bottom = 46;
        const left = compact ? 20 : Math.max(170, Math.min(230, width * .19)), right = compact ? 20 : Math.max(130, Math.min(180, width * .15));
        const height = compact ? top + bottom + groups.length * 80 : touchSized ? Math.max(availableHeight, top + bottom + groups.length * 32) : availableHeight;
        const rowHeight = Math.max(8.5, (height - top - bottom) / Math.max(groups.length, 1));
        const scale = (value) => left + scaleFraction(value) * (width - left - right);
        const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "svg-chart dotogram-groups" });
        drawDotAxis(chart, scale, domainMin, domainMax, width, height, left, top, bottom);
        groups.forEach((municipality, index) => {
          const y = top + index * rowHeight + (compact ? 40 : 15);
          chart.appendChild(svg("line", { x1: left, y1: y, x2: width - right, y2: y, class: "dot-row-guide" }));
          textNode(chart, compact ? 16 : left - 12, y + (compact ? -22 : 4), DATA.municipalities[municipality]?.name || "Не указан", "row-label", compact ? "start" : "end");
        });
        const points = [];
        values.forEach((value) => {
          const definition = defs[value.idx];
          const row = groupPosition.get(definition.municipalityIndex);
          const y = top + row * rowHeight + (compact ? 40 : 15) + (hashJitter(value.idx) - .5) * 10;
          const x = scale(value.value);
          const point = svg("circle", { cx: x, cy: y, r: 5.5, fill: dotColor(value), opacity: .82, stroke: "#fff", "stroke-width": 1.2 });
          chart.appendChild(point);
          points.push({ x, y, label: definition.name, value: value.value, source: value });
          addTip(point, '<b>' + esc(definition.name) + '</b><div class="tip-grid"><span>' + esc(demoMetric(state.dotMetric).unit) + '</span><strong>' + formatDotValue(value.value) + '</strong></div>');
        });
        let labelled = [];
        if (state.dotLabels === "top") labelled = [...points].sort((left, right) => right.value - left.value).slice(0, 10);
        if (state.dotLabels === "outliers") {
          const q1 = quantile(rawValues, .25), q3 = quantile(rawValues, .75), threshold = q3 + 1.5 * (q3 - q1);
          labelled = points.filter((point) => point.value > threshold).sort((left, right) => right.value - left.value).slice(0, 12);
          if (labelled.length < 5) {
            const existing = new Set(labelled.map((point) => point.source.idx));
            labelled.push(...[...points].sort((left, right) => right.value - left.value).filter((point) => !existing.has(point.source.idx)).slice(0, 5 - labelled.length));
          }
        }
        if (compact) {
          const labelledRows = new Set();
          labelled.forEach(candidate => {
            const municipality = defs[candidate.source.idx].municipalityIndex;
            if (labelledRows.has(municipality)) return;
            labelledRows.add(municipality);
            const name = candidate.label.length > 28 ? `${candidate.label.slice(0, 27)}…` : candidate.label;
            textNode(chart, 16, top + groupPosition.get(municipality) * rowHeight + 66, `${name} · ${formatDotValue(candidate.value)}`, "dot-mobile-label", "start");
          });
        } else drawNonOverlappingLabels(chart, labelled, width, height, top, bottom);
        document.getElementById("viz").innerHTML = "";
        document.getElementById("viz").appendChild(chart);
        document.getElementById("viz").insertAdjacentHTML("beforeend", `<div class="chart-note">Каждая строка — муниципальная территория, каждая точка — НП. ${state.dotLabels === "outliers" ? "Подписаны выбросы по правилу Q3 + 1,5×IQR и несколько крупнейших значений." : state.dotLabels === "top" ? "Подписаны десять крупнейших значений." : "Подписи точек отключены."} Вертикальный пунктир — медиана.</div>`);
      }
      delete window.__dotValuesForAxis;
      document.getElementById("methodText").textContent = `Dotogram показывает территориальный контекст: НП сгруппированы по муниципалитетам, а муниципалитеты отображаются ранжированным точечным графиком. Подписи выделяют только статистически необычные или крупнейшие значения.${rateBase(state.dotMetric) ? ` ${rateBasisText(state.dotUnit)}` : state.dotMetric === "n" || state.dotMetric === "pgpzh" ? " Для абсолютных значений применяется корневая шкала, чтобы крупнейший центр не сжимал остальные территории у нуля." : ""}`;
    };

    const MAP_WIDTH = 760;
    const MAP_HEIGHT = 790;
    let mapRuntime = null;
    let labelTimer = 0;
    let viewportFrame = 0;
    let mapTooltipKey = "";
    let selectedMapObject = null;
    const centerByMunicipality = new Map();
    DATA.settlements.forEach((definition, index) => {
      const municipality = definition.municipalityIndex;
      const population = populationValue(definition) || 0;
      const current = centerByMunicipality.get(municipality);
      if (!current || population > current.population) {
        centerByMunicipality.set(municipality, { index, population });
      }
    });
    const centerSettlementIndexes = new Set([...centerByMunicipality.values()].map((item) => item.index));
    const regionalCapitalIndex = DATA.settlements.reduce((best, definition, index) =>
      (populationValue(definition) || 0) > (populationValue(DATA.settlements[best]) || 0) ? index : best, 0);

    const settlementVisual = (definition) => {
      const population = populationValue(definition);
      if (!population) return { diameter: 7, ring: 0, missing: true, label: "нет данных" };
      if (population <= 1000) return { diameter: 6, ring: 0, label: "до 1 тыс." };
      if (population <= 2500) return { diameter: 8, ring: 0, label: "1–2,5 тыс." };
      if (population <= 5000) return { diameter: 12, ring: 0, label: "2,5–5 тыс." };
      if (population <= 10000) return { diameter: 17, ring: 0, label: "5–10 тыс." };
      if (population <= 20000) return { diameter: 21, ring: 0, label: "10–20 тыс." };
      if (population <= 40000) return { diameter: 26, ring: 0, label: "20–40 тыс." };
      if (population <= 200000) return { diameter: 42, ring: 8, label: "40–200 тыс." };
      return { diameter: 62, ring: 11, label: "свыше 200 тыс." };
    };

    const populationLegendHtml = () => {
      const ranges = [
        { label: "до 1 тыс.", test: (value) => value > 0 && value <= 1000, visual: { diameter: 6, ring: 0 } },
        { label: "1–2,5 тыс.", test: (value) => value > 1000 && value <= 2500, visual: { diameter: 8, ring: 0 } },
        { label: "2,5–5 тыс.", test: (value) => value > 2500 && value <= 5000, visual: { diameter: 12, ring: 0 } },
        { label: "5–10 тыс.", test: (value) => value > 5000 && value <= 10000, visual: { diameter: 17, ring: 0 } },
        { label: "10–20 тыс.", test: (value) => value > 10000 && value <= 20000, visual: { diameter: 21, ring: 0 } },
        { label: "20–40 тыс.", test: (value) => value > 20000 && value <= 40000, visual: { diameter: 26, ring: 0 } },
        { label: "40–200 тыс.", test: (value) => value > 40000 && value <= 200000, visual: { diameter: 42, ring: 8 } },
        { label: "> 200 тыс.", test: (value) => value > 200000, visual: { diameter: 62, ring: 11 } }
      ];
      const rows = ranges.map((range) => {
        const count = DATA.settlements.filter((definition) => range.test(populationValue(definition) || 0)).length;
        const kind = range.visual.ring ? " donut" : "";
        const displaySize = range.visual.diameter === 42 ? 24 : range.visual.diameter === 62 ? 30 : range.visual.diameter;
        return `<span class="site-population-size-item"><i class="site-population-symbol${kind}" style="--symbol-size:${displaySize}px;--ring-size:${Math.max(3, Math.min(range.visual.ring, 7))}px"></i><span>${range.label}</span><small>${count} шт.</small></span>`;
      }).join("");
      const missing = DATA.settlements.filter((definition) => !populationValue(definition)).length;
      return `<div class="site-population-size-legend"><b>Размер · население ${DATA.populationYear}</b><div>${rows}</div><p>Пунктир — численность не указана (${missing} шт.). Размер не меняется при выборе показателя.</p></div>`;
    };

    const settlementLabelLegendHtml = () => `
      <div class="site-settlement-label-legend">
        <b>Подписи · тип НП и масштаб</b>
        <div>
          <span class="city">Город</span>
          <span class="settlement">Остальные НП</span>
        </div>
        <p>Размер адаптируется к окну карты: города 15–18 px, остальные НП 10–13 px. При зуме подписи не раздуваются.</p>
      </div>`;

    const municipalityLabelLegendHtml = () => `
      <div class="site-settlement-label-legend">
        <b>Подписи · ключевые города</b>
        <div><span class="city">● Городской центр</span></div>
        <p>Опорные точки и названия городов сохраняются поверх полигонов; размер 15–18 px адаптируется к окну карты.</p>
      </div>`;

    const syncMapPanelHeight = () => {
      if (!mapRuntime?.root?.isConnected) return;
      /*
       * The map and side panel are grid siblings. Let grid stretching keep their
       * outer boxes identical; copying a rounded SVG height back into the panel
       * created a 3–4 px feedback error on some 16:9 viewports.
       */
      mapRuntime.side.style.removeProperty("height");
      mapRuntime.side.style.removeProperty("max-height");
    };

    const createMapRuntime = () => {
      mapRuntime?.panelResizeObserver?.disconnect();
      const root = document.createElement("div");
      root.className = "map-layout site-optimized-map";
      const stage = document.createElement("div");
      stage.className = "site-map-canvas site-map-stage";
      const mapSvg = svg("svg", {
        viewBox: mapViewport.join(" "),
        class: "svg-chart site-map-svg",
        "aria-label": "Интерактивная карта населённых пунктов и муниципальных территорий",
        preserveAspectRatio: "xMidYMid meet"
      });
      const polygonLayer = svg("g", { class: "site-map-polygon-layer" });
      const markerLayer = svg("g", { class: "site-map-marker-layer" });
      const labelLayer = svg("g", { class: "site-map-label-layer", "aria-hidden": "true" });
      const polygonEntries = DATA.municipalities.map((definition, index) => {
        const path = svg("path", {
          d: geoPath(definition.geometry, MAP_WIDTH, MAP_HEIGHT),
          fill: "#e8eff5",
          stroke: "#fff",
          "stroke-width": 1.2,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          "vector-effect": "non-scaling-stroke",
          "data-map-kind": "mo",
          "data-index": index
        });
        polygonLayer.appendChild(path);
        return { path, definition, index };
      });
      const settlementOrder = DATA.settlements
        .map((definition, index) => ({ definition, index, population: populationValue(definition) || 0 }))
        .sort((left, right) => right.population - left.population);
      const markerEntries = new Array(DATA.settlements.length);
      settlementOrder.forEach(({ definition, index }) => {
        const [x, y] = project(definition.x3857, definition.y3857, MAP_WIDTH, MAP_HEIGHT);
        const visual = settlementVisual(definition);
        const group = svg("g", {
          class: "site-map-marker",
          "data-map-kind": "settlement",
          "data-index": index,
          role: "button",
          tabindex: "0"
        });
        const halo = svg("circle", { cx: x, cy: y, fill: "none", stroke: "#f4b400", display: "none", class: "site-map-selection-wave", "pointer-events": "none" });
        group.appendChild(halo);
        let main, outer, inner;
        if (visual.ring) {
          main = svg("circle", { cx: x, cy: y, fill: "none", stroke: "#61758a", "pointer-events": "none" });
          outer = svg("circle", { cx: x, cy: y, fill: "none", stroke: "#25344a", "pointer-events": "none" });
          inner = svg("circle", { cx: x, cy: y, fill: "none", stroke: "#25344a", "pointer-events": "none" });
          group.append(main, outer, inner);
        } else {
          main = svg("circle", { cx: x, cy: y, fill: "#61758a", stroke: "#25344a", "pointer-events": "none" });
          if (visual.missing) main.setAttribute("stroke-dasharray", "2 1.5");
          group.appendChild(main);
        }
        main.classList.add("site-map-marker-main");
        const hit = svg("circle", { cx: x, cy: y, fill: "transparent", stroke: "none", class: "site-map-hit" });
        group.appendChild(hit);
        markerLayer.appendChild(group);
        markerEntries[index] = { group, main, outer, inner, halo, hit, visual, definition, x, y, index };
      });
      mapSvg.append(polygonLayer, markerLayer, labelLayer);
      stage.appendChild(mapSvg);
      stage.insertAdjacentHTML("beforeend", '<div class="map-death-summary" data-map-death-summary role="status" aria-atomic="true"></div>');
      const controls = document.createElement("div");
      controls.className = "site-map-controls";
      controls.setAttribute("aria-label", "Управление масштабом карты");
      controls.innerHTML = '<button type="button" data-map-zoom="in" aria-label="Приблизить карту">+</button><button type="button" data-map-zoom="out" aria-label="Отдалить карту">−</button><button type="button" data-map-zoom="reset">Сброс</button><output data-map-zoom-level>1×</output>';
      stage.appendChild(controls);
      const side = document.createElement("aside");
      side.className = "map-side";
      side.innerHTML = '<div class="map-legend"></div><section class="site-map-selection-card" hidden></section><div data-react-municipal-context></div><h3>Наибольшие значения</h3><div class="rank-list"></div>';
      root.append(stage, side);
      els.viz.innerHTML = "";
      els.viz.appendChild(root);
      mapRuntime = {
        root, stage, svg: mapSvg, controls, side,
        legend: side.querySelector(".map-legend"),
        selection: side.querySelector(".site-map-selection-card"),
        rank: side.querySelector(".rank-list"),
        polygonLayer, markerLayer, labelLayer, polygonEntries, markerEntries,
        defs: [], values: new Map(), unit: null, context: null, lastUpdateMs: 0,
        drag: null, dragMoved: false, panelResizeObserver: null
      };
      if (typeof ResizeObserver !== "undefined") {
        mapRuntime.panelResizeObserver = new ResizeObserver(() => {
          syncMapPanelHeight();
          syncMapSymbolSizes();
          scheduleMapLabels(20);
        });
        mapRuntime.panelResizeObserver.observe(mapSvg);
      }
      requestAnimationFrame(syncMapPanelHeight);

      controls.querySelector('[data-map-zoom="in"]').onclick = () => zoomMap(0.8);
      controls.querySelector('[data-map-zoom="out"]').onclick = () => zoomMap(1.25);
      controls.querySelector('[data-map-zoom="reset"]').onclick = () => {
        mapViewport = [0, 0, MAP_WIDTH, MAP_HEIGHT];
        applyMapViewport();
        setStatus("Охват карты сброшен.");
      };
      mapSvg.addEventListener("wheel", (event) => {
        if (event.target.closest("select")) return;
        event.preventDefault();
        const bounds = mapSvg.getBoundingClientRect();
        const metrics = mapRenderMetrics();
        const centerX = mapViewport[0] + (event.clientX - bounds.left - metrics.offsetX) / metrics.scale;
        const centerY = mapViewport[1] + (event.clientY - bounds.top - metrics.offsetY) / metrics.scale;
        zoomMap(event.deltaY > 0 ? 1.16 : 0.86, centerX, centerY);
      }, { passive: false });
      mapSvg.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        mapRuntime.dragMoved = false;
        mapRuntime.drag = { x: event.clientX, y: event.clientY, view: [...mapViewport], moved: false };
        mapSvg.setPointerCapture(event.pointerId);
        mapSvg.classList.add("is-panning");
        mapRuntime.labelLayer.classList.add("is-moving");
      });
      mapSvg.addEventListener("pointermove", (event) => {
        if (!mapRuntime.drag) {
          const target = event.target.closest("[data-map-kind]");
          if (target) showMapTooltip(event, target);
          else {
            mapTooltipKey = "";
            hideTip();
          }
          return;
        }
        const metrics = mapRenderMetrics();
        const dx = (event.clientX - mapRuntime.drag.x) / metrics.scale;
        const dy = (event.clientY - mapRuntime.drag.y) / metrics.scale;
        if (Math.abs(dx) + Math.abs(dy) > 1) mapRuntime.drag.moved = true;
        mapViewport = [mapRuntime.drag.view[0] - dx, mapRuntime.drag.view[1] - dy, mapRuntime.drag.view[2], mapRuntime.drag.view[3]];
        applyMapViewport();
      });
      const finishDrag = () => {
        mapRuntime.dragMoved = Boolean(mapRuntime.drag?.moved);
        mapRuntime.drag = null;
        mapSvg.classList.remove("is-panning");
        scheduleMapLabels(40);
      };
      mapSvg.addEventListener("pointerup", finishDrag);
      mapSvg.addEventListener("pointercancel", finishDrag);
      mapSvg.addEventListener("pointerleave", (event) => {
        if (!mapRuntime.drag) {
          mapTooltipKey = "";
          hideTip();
        }
      });
      mapSvg.addEventListener("click", (event) => {
        if (mapRuntime.dragMoved) {
          mapRuntime.dragMoved = false;
          return;
        }
        const target = event.target.closest("[data-map-kind]");
        if (!target) {
          selectedMapObject = null;
          syncMapSelection();
          return;
        }
        selectMapObject(target.dataset.mapKind, +target.dataset.index);
      });
      mapSvg.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target.closest("[data-map-kind]");
        if (!target) return;
        event.preventDefault();
        selectMapObject(target.dataset.mapKind, +target.dataset.index);
      });
      return mapRuntime;
    };

    const clampMapViewport = () => {
      const [x, y, width, height] = mapViewport;
      const marginX = width * .08, marginY = height * .08;
      const minX = -marginX, maxX = MAP_WIDTH - width + marginX;
      const minY = -marginY, maxY = MAP_HEIGHT - height + marginY;
      mapViewport = [
        Math.max(minX, Math.min(maxX, x)),
        Math.max(minY, Math.min(maxY, y)),
        width,
        height
      ];
    };

    const mapRenderMetrics = () => {
      const bounds = mapRuntime?.svg.getBoundingClientRect() || { width: MAP_WIDTH, height: MAP_HEIGHT };
      const scale = Math.min(
        bounds.width / Math.max(mapViewport[2], 1),
        bounds.height / Math.max(mapViewport[3], 1)
      );
      const contentWidth = mapViewport[2] * scale;
      const contentHeight = mapViewport[3] * scale;
      return {
        bounds,
        scale,
        unit: 1 / Math.max(scale, .0001),
        contentWidth,
        contentHeight,
        offsetX: (bounds.width - contentWidth) / 2,
        offsetY: (bounds.height - contentHeight) / 2
      };
    };

    const mapUserUnitsPerPixel = () => mapRenderMetrics().unit;

    const mapCanvasProgress = () => {
      const width = mapRuntime?.svg.getBoundingClientRect().width || 800;
      return Math.max(0, Math.min(1, (width - 800) / 1050));
    };

    const markerScreenScale = (visual) => {
      const gain = mapCanvasProgress() * .35;
      const damping = visual.diameter >= 42 ? .55 : visual.diameter >= 26 ? .8 : 1;
      return 1 + gain * damping;
    };

    const labelScreenScale = () => 1 + mapCanvasProgress() * .2;

    const syncMapSymbolSizes = () => {
      if (!mapRuntime) return;
      const unit = mapUserUnitsPerPixel();
      mapRuntime.markerEntries.forEach((entry) => {
        const displayScale = markerScreenScale(entry.visual);
        const outerRadius = entry.visual.diameter / 2;
        const ringWidth = entry.visual.ring;
        const haloRadius = outerRadius + 3.5;
        entry.group.dataset.screenScale = displayScale.toFixed(3);
        entry.group.dataset.screenDiameter = (outerRadius * 2 * displayScale).toFixed(2);
        if (!entry.baseSizeReady) {
          entry.halo.setAttribute("r", haloRadius);
          entry.halo.setAttribute("stroke-width", 2.2);
          entry.hit.setAttribute("r", Math.max(8, outerRadius + 2));
          if (entry.visual.ring) {
            const innerRadius = outerRadius - ringWidth;
            entry.main.setAttribute("r", outerRadius - ringWidth / 2);
            entry.main.setAttribute("stroke-width", ringWidth);
            entry.outer.setAttribute("r", outerRadius);
            entry.outer.setAttribute("stroke-width", .7);
            entry.inner.setAttribute("r", innerRadius);
            entry.inner.setAttribute("stroke-width", .7);
          } else {
            entry.main.setAttribute("r", outerRadius);
            entry.main.setAttribute("stroke-width", .7);
            if (entry.visual.missing) entry.main.setAttribute("stroke-dasharray", "2 1.5");
          }
          entry.baseSizeReady = true;
        }
        const markerScale = unit * displayScale;
        entry.group.setAttribute(
          "transform",
          `translate(${entry.x} ${entry.y}) scale(${markerScale}) translate(${-entry.x} ${-entry.y})`
        );
      });
      const zoom = MAP_WIDTH / mapViewport[2];
      const output = mapRuntime.controls.querySelector("[data-map-zoom-level]");
      if (output) output.textContent = `${DF.format(zoom)}×`;
    };

    const scheduleMapLabels = (delay = 110) => {
      window.clearTimeout(labelTimer);
      labelTimer = window.setTimeout(renderMapLabels, delay);
    };

    const applyMapViewport = () => {
      if (!mapRuntime) return;
      clampMapViewport();
      mapRuntime.labelLayer.classList.add("is-moving");
      if (viewportFrame) return;
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = 0;
        if (!mapRuntime) return;
        mapRuntime.svg.setAttribute("viewBox", mapViewport.join(" "));
        syncMapSymbolSizes();
        scheduleMapLabels();
      });
    };

    const zoomMap = (factor, centerX = mapViewport[0] + mapViewport[2] / 2, centerY = mapViewport[1] + mapViewport[3] / 2) => {
      const nextWidth = Math.max(MAP_WIDTH / 10, Math.min(MAP_WIDTH, mapViewport[2] * factor));
      const nextHeight = nextWidth * MAP_HEIGHT / MAP_WIDTH;
      const ratioX = (centerX - mapViewport[0]) / mapViewport[2];
      const ratioY = (centerY - mapViewport[1]) / mapViewport[3];
      mapViewport = [centerX - nextWidth * ratioX, centerY - nextHeight * ratioY, nextWidth, nextHeight];
      applyMapViewport();
    };

    const labelPopulationThreshold = (zoom) => {
      if (zoom < 1.5) return 40000;
      if (zoom < 2.2) return 20000;
      if (zoom < 3.2) return 10000;
      if (zoom < 4.8) return 5000;
      if (zoom < 6.5) return 1000;
      return 0;
    };

    const labelFontSize = (definition, zoom) => {
      const zoomProgress = Math.log2(Math.max(1, Math.min(10, zoom))) / Math.log2(10);
      const screenScale = labelScreenScale();
      if (definition.isCity) return 15 * screenScale;
      return (10 + zoomProgress) * screenScale;
    };

    const renderMapLabels = () => {
      if (!mapRuntime) return;
      const layer = mapRuntime.labelLayer;
      layer.innerHTML = "";
      layer.classList.remove("is-moving");
      const settlementMode = state.mapUnit === "settlement";
      if (!settlementMode && state.mapUnit !== "mo") return;
      if (state.mapLabels === "off") return;
      const bounds = mapRuntime.svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const renderMetrics = mapRenderMetrics();
      const zoom = MAP_WIDTH / mapViewport[2];
      const threshold = labelPopulationThreshold(zoom);
      const selectedIndex = settlementMode && selectedMapObject?.kind === "settlement" ? selectedMapObject.index : -1;
      const candidates = mapRuntime.markerEntries
        .filter((entry) => settlementMode ? entry.group.style.display !== "none" : Boolean(entry.definition.isCity))
        .filter((entry) => {
          if (!settlementMode) return true;
          if (entry.index === selectedIndex) return true;
          const center = centerSettlementIndexes.has(entry.index);
          if (state.mapLabels === "centers") return center;
          return entry.definition.isCity || center || (populationValue(entry.definition) || 0) >= threshold;
        })
        .sort((left, right) => {
          const selectedDelta = Number(right.index === selectedIndex) - Number(left.index === selectedIndex);
          if (selectedDelta) return selectedDelta;
          const capitalDelta = Number(right.index === regionalCapitalIndex) - Number(left.index === regionalCapitalIndex);
          if (capitalDelta) return capitalDelta;
          const cityDelta = Number(Boolean(right.definition.isCity)) - Number(Boolean(left.definition.isCity));
          if (cityDelta) return cityDelta;
          const centerDelta = Number(centerSettlementIndexes.has(right.index)) - Number(centerSettlementIndexes.has(left.index));
          if (centerDelta) return centerDelta;
          return (populationValue(right.definition) || 0) - (populationValue(left.definition) || 0);
        });
      const placed = [];
      const unit = renderMetrics.unit;
      const toScreen = (x, y) => [
        renderMetrics.offsetX + (x - mapViewport[0]) * renderMetrics.scale,
        renderMetrics.offsetY + (y - mapViewport[1]) * renderMetrics.scale
      ];
      const toWorld = (x, y) => [
        mapViewport[0] + (x - renderMetrics.offsetX) / renderMetrics.scale,
        mapViewport[1] + (y - renderMetrics.offsetY) / renderMetrics.scale
      ];
      const markerObstacles = (settlementMode
        ? mapRuntime.markerEntries.filter((entry) => entry.group.style.display !== "none")
        : candidates)
        .map((entry) => {
          const [x, y] = toScreen(entry.x, entry.y);
          const radius = settlementMode ? Math.max(3, entry.visual.diameter / 2 * markerScreenScale(entry.visual)) : 3.2;
          return { index: entry.index, x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 };
        });
      candidates.forEach((entry) => {
        const [screenX, screenY] = toScreen(entry.x, entry.y);
        const contentRight = renderMetrics.offsetX + renderMetrics.contentWidth;
        const contentBottom = renderMetrics.offsetY + renderMetrics.contentHeight;
        if (screenX < renderMetrics.offsetX - 40 || screenX > contentRight + 40
          || screenY < renderMetrics.offsetY - 40 || screenY > contentBottom + 40) return;
        const isCity = Boolean(entry.definition.isCity);
        const font = labelFontSize(entry.definition, zoom);
        const label = entry.definition.name.length > 28 ? `${entry.definition.name.slice(0, 27)}…` : entry.definition.name;
        const widthFactor = isCity ? .6 : .54;
        const width = Math.max(isCity ? 48 : 38, label.length * font * widthFactor + 7);
        const height = font + 5;
        const radius = settlementMode ? entry.visual.diameter / 2 * markerScreenScale(entry.visual) : 3.2;
        const gap = radius + 6;
        const attempts = [
          [gap, -height / 2], [-gap - width, -height / 2],
          [-width / 2, -gap - height], [-width / 2, gap],
          [gap * .72, -gap * .72 - height], [-gap * .72 - width, -gap * .72 - height],
          [gap * .72, gap * .72], [-gap * .72 - width, gap * .72]
        ];
        if (!settlementMode) {
          const far = gap + font + 8;
          const farther = far + font * 1.8 + 8;
          attempts.push(
            [far, -height / 2], [-far - width, -height / 2],
            [-width / 2, -far - height], [-width / 2, far],
            [far * .72, -far * .72 - height], [-far * .72 - width, -far * .72 - height],
            [far * .72, far * .72], [-far * .72 - width, far * .72],
            [farther, -height / 2], [-farther - width, -height / 2],
            [-width / 2, -farther - height], [-width / 2, farther],
            [farther * .72, -farther * .72 - height], [-farther * .72 - width, -farther * .72 - height],
            [farther * .72, farther * .72], [-farther * .72 - width, farther * .72]
          );
        }
        let box = null;
        for (const [dx, dy] of attempts) {
          const candidate = { x: screenX + dx, y: screenY + dy, w: width, h: height };
          const inside = candidate.x >= renderMetrics.offsetX + 3
            && candidate.x + candidate.w <= contentRight - 3
            && candidate.y >= renderMetrics.offsetY + 3
            && candidate.y + candidate.h <= contentBottom - 3;
          const overlaps = placed.some((other) => !(candidate.x + candidate.w + 4 < other.x
            || other.x + other.w + 4 < candidate.x
            || candidate.y + candidate.h + 3 < other.y
            || other.y + other.h + 3 < candidate.y));
          const coversMarker = markerObstacles.some((other) => other.index !== entry.index
            && !(candidate.x + candidate.w + 2 < other.x
              || other.x + other.w + 2 < candidate.x
              || candidate.y + candidate.h + 2 < other.y
              || other.y + other.h + 2 < candidate.y));
          if (inside && !overlaps && !coversMarker) {
            box = candidate;
            break;
          }
        }
        if (!box && entry.index === selectedIndex) {
          box = {
            x: Math.max(renderMetrics.offsetX + 3, Math.min(contentRight - width - 3, screenX + gap)),
            y: Math.max(renderMetrics.offsetY + 3, Math.min(contentBottom - height - 3, screenY - height / 2)),
            w: width,
            h: height
          };
        }
        if (!box) return;
        placed.push(box);
        if (!settlementMode) {
          const anchorX = Math.max(box.x, Math.min(screenX, box.x + box.w));
          const anchorY = Math.max(box.y, Math.min(screenY, box.y + box.h));
          if (Math.hypot(anchorX - screenX, anchorY - screenY) > gap + 4) {
            const [leaderX, leaderY] = toWorld(anchorX, anchorY);
            layer.appendChild(svg("line", {
              x1: entry.x,
              y1: entry.y,
              x2: leaderX,
              y2: leaderY,
              class: "map-center-leader",
              "vector-effect": "non-scaling-stroke"
            }));
          }
          const marker = svg("circle", {
            cx: entry.x,
            cy: entry.y,
            r: 3.2 * unit,
            class: "map-center-marker",
            "stroke-width": 1.25 * unit,
            "data-city-center": entry.index
          });
          layer.appendChild(marker);
        }
        const [worldX, worldY] = toWorld(box.x + 3, box.y + font);
        const text = textNode(layer, worldX, worldY, label, `map-center-label ${isCity ? "city" : "settlement"}${entry.index === selectedIndex ? " selected" : ""}`, "start");
        text.setAttribute("font-size", font * unit);
        text.setAttribute("stroke-width", 3.5 * labelScreenScale() * unit);
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("data-label-kind", isCity ? "city" : "settlement");
        text.setAttribute("data-font-px", font.toFixed(2));
      });
    };

    const syncMapSelection = () => {
      if (!mapRuntime) return;
      mapRuntime.polygonEntries.forEach((entry) => {
        const selected = selectedMapObject?.kind === "mo" && selectedMapObject.index === entry.index;
        entry.path.classList.toggle("site-atlas-highlight", selected);
      });
      mapRuntime.markerEntries.forEach((entry) => {
        const selected = selectedMapObject?.kind === "settlement" && selectedMapObject.index === entry.index;
        entry.group.classList.toggle("site-atlas-highlight", selected);
        entry.halo.setAttribute("display", selected ? "" : "none");
        if (selected) entry.group.parentNode.appendChild(entry.group);
      });
      scheduleMapLabels(0);
    };

    let mapFlightFrame = 0;
    const flyToMapObject = (kind, index) => {
      if (!mapRuntime) return;
      let centerX, centerY, nextWidth;
      if (kind === "settlement") {
        const entry = mapRuntime.markerEntries[index];
        if (!entry) return;
        centerX = entry.x;
        centerY = entry.y;
        nextWidth = Math.min(mapViewport[2], MAP_WIDTH / 2.55);
      } else {
        const entry = mapRuntime.polygonEntries[index];
        if (!entry) return;
        const bounds = entry.path.getBBox();
        centerX = bounds.x + bounds.width / 2;
        centerY = bounds.y + bounds.height / 2;
        nextWidth = Math.min(
          MAP_WIDTH,
          Math.max(118, bounds.width * 1.3, bounds.height * MAP_WIDTH / MAP_HEIGHT * 1.3)
        );
      }
      const nextHeight = nextWidth * MAP_HEIGHT / MAP_WIDTH;
      const target = [centerX - nextWidth / 2, centerY - nextHeight / 2, nextWidth, nextHeight];
      const start = [...mapViewport];
      const duration = motionMode === "full" ? 430 : motionMode === "reduced" ? 180 : 0;
      cancelAnimationFrame(mapFlightFrame);
      if (!duration) {
        mapViewport = target;
        applyMapViewport();
        return;
      }
      const started = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - (1 - progress) ** 3;
        mapViewport = start.map((value, position) => value + (target[position] - value) * eased);
        applyMapViewport();
        if (progress < 1) mapFlightFrame = requestAnimationFrame(step);
      };
      mapFlightFrame = requestAnimationFrame(step);
    };

    const selectMapObject = (kind, index) => {
      if ((kind === "mo" && state.mapUnit !== "mo") || (kind === "settlement" && state.mapUnit !== "settlement")) return;
      selectedMapObject = { kind, index };
      syncMapSelection();
      renderMapSelectionCard();
      flyToMapObject(kind, index);
      const definition = kind === "mo" ? DATA.municipalities[index] : DATA.settlements[index];
      setStatus(`Объект закреплён: ${definition?.name || "не указан"}`);
    };

    const mapTooltipHtml = (kind, index) => {
      if (!mapRuntime || kind !== (state.mapUnit === "mo" ? "mo" : "settlement")) return "";
      const definition = mapRuntime.defs[index];
      const value = mapRuntime.values.get(index);
      if (!definition || !value) return "";
      const metricValue = value.metricValue;
      return `<b>${esc(definition.name)}${kind === "settlement" ? ` · ID слоя ${definition.id}` : ""}</b><div class="tip-grid">
        ${kind === "settlement" ? `<span>Муниципалитет</span><strong>${esc(definition.municipality)}</strong>` : ""}
        <span>${mapMetricLabel()}</span><strong>${formatMapMetric(metricValue)}</strong>
        ${rateBase(state.mapMetric) ? `<span>Расчёт</span><strong>${rateFormula(value.selected, definition, state.mapMetric)}</strong>` : ""}
        <span>${esc(populationDisplay(definition,state.view==='dotogram'?state.dotMetric:state.mapMetric).label)}</span><strong>${populationDisplay(definition,state.view==='dotogram'?state.dotMetric:state.mapMetric).value==null?"н/д":fmt(populationDisplay(definition,state.view==='dotogram'?state.dotMetric:state.mapMetric).value)}</strong>
        <span>Всего смертей</span><strong>${fmt(value.total)}</strong>
        <span>Выбрано</span><strong>${fmt(value.selected)}</strong>
        <span>Доля выбранной причины</span><strong>${pct(value.total ? value.selected / value.total * 100 : 0)}</strong>
        <span>Структура</span><strong>${esc(topClasses(value))}</strong>
      </div>`;
    };

    const renderMapSelectionCard = () => {
      if (!mapRuntime?.selection) return;
      const selection = mapRuntime.selection;
      const expectedKind = state.mapUnit === "mo" ? "mo" : "settlement";
      if (!selectedMapObject || selectedMapObject.kind !== expectedKind) {
        selection.hidden = true;
        selection.innerHTML = "";
        window.dispatchEvent(new CustomEvent("atlas:mortality-selection", { detail: null }));
        return;
      }
      const html = mapTooltipHtml(selectedMapObject.kind, selectedMapObject.index);
      if (!html) {
        selection.hidden = true;
        return;
      }
      selection.hidden = false;
      selection.innerHTML = `<button type="button" class="site-map-selection-close" aria-label="Закрыть карточку выбранного объекта">×</button><span class="site-map-selection-kicker">Закреплённый объект</span>${html}`;
      const contextDefinition = selectedMapObject.kind === "mo" ? DATA.municipalities[selectedMapObject.index] : DATA.settlements[selectedMapObject.index];
      window.dispatchEvent(new CustomEvent("atlas:mortality-selection", { detail: { kind: selectedMapObject.kind, id: contextDefinition.id } }));
      selection.querySelector(".site-map-selection-close").onclick = () => {
        selectedMapObject = null;
        syncMapSelection();
        renderMapSelectionCard();
      };
      if (motionDuration() && typeof selection.animate === "function") {
        selection.animate(
          [{ opacity: .25, transform: "translateX(8px)" }, { opacity: 1, transform: "translateX(0)" }],
          { duration: Math.min(motionDuration(), 230), easing: "ease-out" }
        );
      }
    };

    const showMapTooltip = (event, target) => {
      const key = `${target.dataset.mapKind}:${target.dataset.index}`;
      if (key === mapTooltipKey) return;
      const html = mapTooltipHtml(target.dataset.mapKind, +target.dataset.index);
      if (!html) return;
      mapTooltipKey = key;
      showTip(event, html);
    };

    const updateOptimizedMap = (context) => {
      const started = performance.now();
      if (!mapRuntime || !mapRuntime.root.isConnected) createMapRuntime();
      const { defs, map } = context;
      const values = [...map.values()];
      mapRuntime.defs = defs;
      mapRuntime.values = map;
      mapRuntime.unit = state.mapUnit;
      mapRuntime.context = context;
      const summary = mapRuntime.stage.querySelector("[data-map-death-summary]");
      const summaryHtml = mapDeathSummaryHtml(context);
      if (summary.innerHTML !== summaryHtml) summary.innerHTML = summaryHtml;
      const colors = mapClassColors(context);
      const colorFor = (value) => Number.isFinite(value?.metricValue)
        ? context.fixed && value.metricValue === 0 ? context.zeroColor : colors[mapClassIndex(value.metricValue, context.boundaries)]
        : "#98a2b3";
      mapRuntime.polygonEntries.forEach((entry) => {
        const value = map.get(entry.index);
        const active = state.mapUnit === "mo" && Boolean(value);
        entry.path.style.pointerEvents = state.mapUnit === "mo" ? "" : "none";
        entry.path.setAttribute("fill", state.mapUnit === "mo" ? (active ? colorFor(value) : "#e5e7eb") : "#e8eff5");
        entry.path.setAttribute("tabindex", active ? "0" : "-1");
        if (active) {
          entry.path.setAttribute("role", "button");
          entry.path.setAttribute("aria-label", `${entry.definition.name}: ${formatMapMetric(value.metricValue)}`);
        } else {
          entry.path.removeAttribute("role");
          entry.path.removeAttribute("aria-label");
        }
        entry.path.classList.toggle("site-map-suppressed", active && suppressSmallValues && value.selected < 5);
      });
      mapRuntime.markerEntries.forEach((entry) => {
        const value = map.get(entry.index);
        const active = state.mapUnit === "settlement" && Boolean(value);
        entry.group.style.display = active ? "" : "none";
        entry.group.setAttribute("tabindex", active ? "0" : "-1");
        if (!active) return;
        const color = colorFor(value);
        if (entry.visual.ring) entry.main.setAttribute("stroke", color);
        else entry.main.setAttribute("fill", color);
        entry.group.setAttribute("aria-label", `${entry.definition.name}: ${formatMapMetric(value.metricValue)}, население ${populationValue(entry.definition) ? fmt(populationValue(entry.definition)) : "не указано"}`);
        entry.group.classList.toggle("site-map-suppressed", suppressSmallValues && value.selected < 5);
      });
      const ranked = ANALYTICS_CORE.rankItems(
        values.filter((value) => Number.isFinite(value.metricValue)),
        (value) => value.metricValue
      ).slice(0, 15);
      mapRuntime.rank.innerHTML = ranked.map((value, index) =>
        `<div class="rank-item${suppressSmallValues && value.selected < 5 ? " site-map-suppressed" : ""}"><span>${index + 1}. ${esc(defs[value.idx].name)}</span><b>${formatMapMetric(value.metricValue)}</b></div>`
      ).join("");
      const unitLabel = state.mapMetric === "share" ? "%" : rateBase(state.mapMetric) ? "" : "смертей";
      const rateNote = rateBase(state.mapMetric)
        ? `<div class="site-map-legend-note">${esc(rateBasisText(state.mapUnit))}</div>`
        : "";
      mapRuntime.legend.innerHTML = `<b>Проекция · EPSG:3857</b>
        <b>Цвет · ${context.fixed ? "смертей за год" : mapMetricLabel()}</b>
        ${context.fixed ? fixedMapLegendHtml(context) : `<div class="legend-ramp"></div><div class="legend-range"><span>0 ${unitLabel}</span><span>${formatTerritoryMetric(state.mapMetric, context.scaleMaximum)}</span></div>`}
        ${rateNote}
        ${state.mapUnit === "settlement" ? populationLegendHtml() : ""}
        ${state.mapUnit === "settlement" ? settlementLabelLegendHtml() : ""}
        ${state.mapUnit === "mo" ? municipalityLabelLegendHtml() : ""}
        ${suppressSmallValues ? '<div class="site-map-legend-note">Малые значения n &lt; 5 скрыты</div>' : ""}
        <div class="legend-range"><span>${mapScaleLabel(context)}</span><span>Web Mercator</span></div>`;
      syncMapSymbolSizes();
      syncMapSelection();
      renderMapSelectionCard();
      applyMapViewport();
      requestAnimationFrame(syncMapPanelHeight);
      mapRuntime.lastUpdateMs = performance.now() - started;
      if (debugMap) {
        let debug = mapRuntime.side.querySelector(".site-map-debug");
        if (!debug) {
          debug = document.createElement("div");
          debug.className = "site-map-debug";
          mapRuntime.side.appendChild(debug);
        }
        debug.textContent = `filter ${mapPerformance.filterMiss ? DF.format(mapPerformance.filterMs) + " мс" : "cache"} · aggregate ${mapPerformance.aggregateMiss ? DF.format(mapPerformance.aggregateMs) + " мс" : "cache"} · paint ${DF.format(mapRuntime.lastUpdateMs)} мс · ${values.length} объектов`;
      }
    };

    const mortalityMapModel = (context) => {
      const indicator = demoMetric(state.mapMetric);
      const settlements = state.mapUnit === "settlement";
      const source = "«" + DEMO.source + "», стр. " + indicator.page;
      const features = context.defs.map((definition, index) => {
        const metricValue = context.map.get(index)?.metricValue ?? null;
        const population = populationValue(definition) || null;
        const displayValue = settlements ? population : metricValue;
        const formatted = Number.isFinite(displayValue) ? DF.format(displayValue) : "Нет данных";
        const populationFormatted = population == null ? "Нет данных" : fmt(population);
        return {
          id: Number(definition.id), index, kind: state.mapUnit, name: definition.name,
          municipality: definition.municipality || "", isCity: Boolean(definition.isCity),
          metricValue, metricFormatted: formatted, populationFormatted, populationLabel: "Население · перепись 2021",
          active: true, suppressed: false,
          card: {
            id: Number(definition.id), name: definition.name, context: settlements ? "Перепись 2021" : "2025 · " + indicator.label,
            group: "", value: displayValue, formatted, unit: settlements ? "жителей" : indicator.unit,
            basis: settlements ? definition.municipality || "" : source, series: [], suppressed: false
          }
        };
      });
      const region = indicator.values.region;
      return {
        demo: true, unit: state.mapUnit, labels: state.mapLabels, metric: state.mapMetric, metricLabel: mapMetricLabel(),
        deathSummaryHtml: settlements ? "" : '<strong>' + DF.format(region) + '</strong><span> ' + esc(indicator.unit) + '</span><div>Амурская область · 2025</div><div>' + esc(indicator.label) + '</div>',
        legendMetricLabel: settlements ? "цвет точек постоянный" : indicator.label,
        populationYear: DATA.populationYear, colors: mapClassColors(context), boundaries: context.boundaries,
        fixedLegendHtml: settlements ? '<div class="site-map-legend-note">Точки показывают только население.</div>' : "",
        maximumFormatted: DF.format(context.scaleMaximum), unitLabel: settlements ? "" : indicator.unit,
        scaleLabel: settlements ? "Перепись 2021" : "Сборник · 2025",
        suppressSmallValues: false, rateNoteHtml: settlements ? "" : '<div class="site-map-legend-note">' + esc(source) + ' · серый — нет данных</div>',
        populationLegendHtml: settlements ? populationLegendHtml() : "",
        settlementLabelLegendHtml: settlements ? settlementLabelLegendHtml() : "",
        municipalityLabelLegendHtml: settlements ? "" : municipalityLabelLegendHtml(),
        features, featuresById: new Map(features.map(feature => [feature.id, feature])),
        ranks: features.filter(feature => Number.isFinite(feature.metricValue)).sort((a, b) => b.metricValue - a.metricValue).slice(0, 15)
      };
    };

    const renderOptimizedMapView = () => {
      mapPerformance.filterMiss = false;
      mapPerformance.aggregateMiss = false;
      document.body.classList.remove("infrastructure-view");
      localControls();
      renderKpis();
      els.title.textContent = VIEWS.map[0];
      els.subtitle.textContent = VIEWS.map[1];
      els.method.textContent = state.mapUnit === "settlement"
        ? "Размер знака НП определяется населением переписи 2021 года и не меняется при фильтрации. Цвет показывает выбранный показатель по пяти классам Дженкса. Города подписаны полужирным шрифтом 15 px, остальные НП — обычным шрифтом 10–11 px. Колесо масштабирует карту, перетаскивание изменяет охват."
        : "Муниципальные полигоны окрашены по выбранному показателю и пяти классам Дженкса. Поверх районов сохраняются опорные точки и подписи ключевых городов размером 15 px; переключатель подписей позволяет их скрыть. Колесо масштабирует карту, перетаскивание изменяет охват.";
      els.method.textContent += " Нажатие закрепляет карточку, а «Сведения о территории» открывает подробности. Кнопка «Выбрать территорию» открывает полный список объектов для выбора с клавиатуры.";
      els.meta.innerHTML = `<span class="chip">${state.year === "all" ? (DATA.years.length > 1 ? `${DATA.years[0]}–${DATA.years[DATA.years.length - 1]}` : DATA.years[0]) : state.year}</span><span class="chip">${state.sex === "all" ? "оба пола" : state.sex === "1" ? "мужчины" : "женщины"}</span><span class="chip">${document.querySelector(`#ageSelect option[value="${state.age}"]`)?.textContent || "все возрасты"}</span><span class="chip">EPSG:3857 · Web Mercator</span>`;
      const context = syncActiveMapBreaks();
      if (!window.AmurMortalityMap) {
        if (!ensureSpatialFallback()) return;
        updateOptimizedMap(context);
        return;
      }
      const model = mortalityMapModel(context);
      let host = els.viz.querySelector(":scope > .mortality-map-host");
      if (!host) {
        els.viz.innerHTML = '<div class="mortality-map-host"></div>';
        host = els.viz.querySelector(".mortality-map-host");
        window.AmurMortalityMap.mount(host, model);
      } else {
        window.AmurMortalityMap.update(model);
        window.AmurMortalityMap.resize();
      }
    };

    const highlightSearchTarget = () => {
      document.querySelectorAll(".site-atlas-highlight").forEach((element) => element.classList.remove("site-atlas-highlight"));
      if (!searchTarget) return;
      let target = null;
      if (searchTarget.type === "code") {
        target = [...document.querySelectorAll(".tile")].find((tile) => tile.querySelector(".tile-code")?.textContent.trim() === searchTarget.code);
      } else if (searchTarget.type === "class") {
        target = [...document.querySelectorAll(".tile")].find((tile) => tile.querySelector(".tile-code")?.textContent.trim() === DATA.classes[searchTarget.index].roman);
      } else if (searchTarget.type === "block") {
        target = [...document.querySelectorAll(".tile")].find((tile) => tile.querySelector(".tile-code")?.textContent.trim() === DATA.blocks[searchTarget.index].code);
      } else if (searchTarget.type === "municipality" && state.view === "map") {
        if (window.AmurMortalityMap) {
          window.AmurMortalityMap.select("mo", DATA.municipalities[searchTarget.index].id, { fly: true, popup: false });
          return;
        }
        target = document.querySelector(`#viz [data-map-kind="mo"][data-index="${searchTarget.index}"]`);
      } else if (searchTarget.type === "settlement" && state.view === "map") {
        if (window.AmurMortalityMap) {
          window.AmurMortalityMap.select("settlement", DATA.settlements[searchTarget.index].id, { fly: true, popup: false });
          return;
        }
        target = document.querySelector(`#viz [data-map-kind="settlement"][data-index="${searchTarget.index}"]`);
      }
      if (target) {
        target.classList.add("site-atlas-highlight");
        target.scrollIntoView({ block: "center", inline: "center" });
      }
    };

    const actionStatus = document.createElement("p");
    actionStatus.className = "atlas-action-status";
    actionStatus.setAttribute("role", "status");
    document.querySelector(".chart-head")?.appendChild(actionStatus);
    const setStatus = message => {
      actionStatus.textContent = message;
      clearTimeout(setStatus.timer);
      setStatus.timer = setTimeout(() => { actionStatus.textContent = ""; }, 3200);
    };
    const searchItems = [];
    DATA.municipalities.forEach((item, index) => searchItems.push({ type: "municipality", index, label: `МО — ${item.name}` }));
    DATA.settlements.forEach((item, index) => searchItems.push({ type: "settlement", index, label: `НП — ${item.name} · ${item.municipality}` }));
    const searchMap = new Map(searchItems.map((item) => [item.label.toLocaleLowerCase("ru-RU"), item]));

    const searchBox = document.createElement("div");
    searchBox.className = "atlas-search";
    searchBox.innerHTML = `
      <label for="atlasSearchInput">Поиск по МКБ и территории</label>
      <div class="atlas-search__row"><input id="atlasSearchInput" list="atlasSearchOptions" placeholder="Например: I21, Благовещенск"><button type="button">Найти</button></div>
      <datalist id="atlasSearchOptions"></datalist>
      <p class="atlas-search__hint">Класс, блок, трёхзначный код, муниципалитет или НП</p>`;
    document.querySelector(".filters")?.insertAdjacentElement("beforebegin", searchBox);
    const datalist = searchBox.querySelector("datalist");
    searchItems.forEach((item) => datalist.insertAdjacentHTML("beforeend", `<option value="${item.label.replace(/"/g, "&quot;")}"></option>`));

    const activateSearch = () => {
      const input = searchBox.querySelector("input");
      const query = input.value.trim().toLocaleLowerCase("ru-RU");
      const found = searchMap.get(query) || searchItems.find((item) => item.label.toLocaleLowerCase("ru-RU").includes(query));
      if (!found || !query) {
        setStatus("Совпадение не найдено. Уточните название территории.");
        return;
      }
      input.value = found.label;
      searchTarget = found;
      if (found.type === "class") {
        state.view = "treemap";
        state.treeType = "class";
        state.treeIndex = found.index;
      } else if (found.type === "block") {
        state.view = "treemap";
        state.treeType = "block";
        state.treeIndex = found.index;
      } else if (found.type === "code") {
        state.view = "treemap";
        state.treeType = "block";
        state.treeIndex = found.block;
      } else {
        state.view = "map";
        state.mapUnit = found.type === "municipality" ? "mo" : "settlement";
        mapViewport = [0, 0, 760, 790];
      }
      render();
      setStatus(`Показано: ${found.label}`);
    };
    searchBox.querySelector("button").addEventListener("click", activateSearch);
    searchBox.querySelector("input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") activateSearch();
    });

    const motionSelectors = {
      treemap: ".tile",
      heatmap: ".heat-cell",
      arrow: "svg line:not(.gridline):not(.axis), svg circle",
      pyramid: "svg rect",
      plot: "svg line:not(.gridline):not(.axis), svg circle",
      dotogram: "svg circle, svg line:not(.gridline):not(.axis)"
    };
    const changeNotice = document.createElement("div");
    changeNotice.className = "atlas-change-notice";
    changeNotice.setAttribute("role", "status");
    changeNotice.setAttribute("aria-live", "polite");
    document.querySelector(".atlas-main .chart-meta")?.insertAdjacentElement("beforebegin", changeNotice);
    let renderedFilters = { year: state.year, sex: state.sex, age: state.age };
    const filterDisplayValue = (key, value) => {
      if (key === "year") return value === "all"
        ? (DATA.years.length > 1 ? `${DATA.years[0]}–${DATA.years[DATA.years.length - 1]}` : String(DATA.years[0]))
        : String(value);
      if (key === "sex") return value === "all" ? "оба пола" : value === "1" ? "мужчины" : "женщины";
      return document.querySelector(`#ageSelect option[value="${value}"]`)?.textContent || "все возрасты";
    };
    const announceFilterChanges = () => {
      if (state.view === "dotogram" && state.dotDataset === "resources" || state.view === "infrastructure" && state.infraResources === "on") {
        changeNotice.classList.remove("is-visible"); changeNotice.textContent = "";
        renderedFilters = { year: state.year, sex: state.sex, age: state.age };
        return;
      }
      const labels = { year: "Период", sex: "Пол", age: "Возраст" };
      const selectors = { year: "#yearSelect", sex: "#sexSeg", age: "#ageSelect" };
      const changes = Object.keys(labels).filter((key) => renderedFilters[key] !== state[key]);
      if (!changes.length) return;
      changeNotice.textContent = changes.map((key) =>
        `${labels[key]}: ${filterDisplayValue(key, renderedFilters[key])} → ${filterDisplayValue(key, state[key])}`
      ).join(" · ");
      changeNotice.classList.add("is-visible");
      changeNotice.getAnimations().forEach((animation) => animation.cancel());
      changeNotice.animate(
        [{ opacity: .35, transform: "translateY(-3px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: Math.min(180, Math.max(90, motionDuration())), easing: "ease-out" }
      );
      changes.forEach((key) => {
        const control = document.querySelector(selectors[key]);
        control?.classList.add("site-filter-changed");
        control?.getAnimations().forEach((animation) => animation.cancel());
        control?.animate(
          [{ transform: "scale(.995)" }, { transform: "scale(1)" }],
          { duration: Math.min(170, Math.max(80, motionDuration())), easing: "ease-out" }
        );
        window.setTimeout(() => control?.classList.remove("site-filter-changed"), 720);
      });
      window.clearTimeout(changeNotice.hideTimer);
      changeNotice.hideTimer = window.setTimeout(() => changeNotice.classList.remove("is-visible"), 2300);
      renderedFilters = { year: state.year, sex: state.sex, age: state.age };
    };
    const motionKey = (element, index, view) => {
      if (view === "treemap") return `tile:${element.querySelector(".tile-code")?.textContent.trim() || index}`;
      return `${view}:${element.tagName.toLowerCase()}:${index}`;
    };
    const motionNodes = (view) => {
      const selector = motionSelectors[view];
      return selector ? [...els.viz.querySelectorAll(selector)] : [];
    };
    const captureMotionSnapshot = (view) => {
      if (motionDuration() === 0 || view === "map") return null;
      // Pyramid bars and hit areas must keep one coordinate system. Per-node
      // FLIP scales them around different origins and makes the chart break up.
      if (view === "pyramid") return { bulk: true };
      const nodes = motionNodes(view);
      // Per-node FLIP animation forces layout reads for every SVG mark. Beyond
      // this threshold a single canvas transition is both smoother and cheaper.
      if (!nodes.length || nodes.length > 120) return { bulk: true };
      const boxes = new Map();
      nodes.forEach((element, index) => {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) boxes.set(motionKey(element, index, view), box);
      });
      return { boxes };
    };
    const animateVizEntrance = (changedView = false) => {
      const duration = motionDuration();
      if (!duration || typeof els.viz.animate !== "function") return;
      els.viz.animate(
        [
          { opacity: changedView ? .42 : .68, transform: changedView ? "translateY(7px) scale(.992)" : "translateY(3px)" },
          { opacity: 1, transform: "translateY(0) scale(1)" }
        ],
        { duration, easing: "cubic-bezier(.2,.75,.25,1)" }
      );
    };
    const animateMotionSnapshot = (snapshot, view) => {
      const duration = motionDuration();
      if (!duration || !snapshot) return;
      if (view === "pyramid") {
        els.viz.getAnimations().forEach((animation) => animation.cancel());
        els.viz.animate([{ opacity: .9 }, { opacity: 1 }], {
          duration: Math.min(duration, 120), easing: "ease-out"
        });
        return;
      }
      if (snapshot.bulk) {
        animateVizEntrance(false);
        return;
      }
      const nodes = motionNodes(view);
      const changed = [];
      nodes.forEach((element, index) => {
        if (typeof element.animate !== "function") return;
        const current = element.getBoundingClientRect();
        const previous = snapshot.boxes.get(motionKey(element, index, view));
        if (!previous || !current.width || !current.height) {
          element.animate(
            [{ opacity: .2, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }],
            { duration: Math.min(duration, 190), easing: "ease-out" }
          );
          return;
        }
        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        const scaleX = Math.max(.35, Math.min(2.5, previous.width / current.width));
        const scaleY = Math.max(.35, Math.min(2.5, previous.height / current.height));
        if (Math.abs(deltaX) < .5 && Math.abs(deltaY) < .5 && Math.abs(scaleX - 1) < .01 && Math.abs(scaleY - 1) < .01) return;
        const changeScore = Math.abs(deltaX) / Math.max(current.width, 18)
          + Math.abs(deltaY) / Math.max(current.height, 18)
          + Math.abs(1 - scaleX)
          + Math.abs(1 - scaleY);
        if (changeScore > .12) changed.push({ element, score: changeScore });
        element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, opacity: .72 },
            { transform: "translate(0, 0) scale(1, 1)", opacity: 1 }
          ],
          { duration, easing: "cubic-bezier(.2,.78,.25,1)" }
        );
      });
      changed.sort((left, right) => right.score - left.score).slice(0, 3).forEach(({ element }) => {
        element.classList.add("site-data-changed");
        window.setTimeout(() => element.classList.remove("site-data-changed"), 1250);
      });
    };
    const kpiFrames = new WeakMap();
    const numericTextToken = (text) => String(text || "").match(/-?\d[\d\s\u00a0]*(?:[.,]\d+)?/);
    const pulseChangedKpis = (before) => {
      const duration = motionDuration();
      document.querySelectorAll(".atlas-main .kpi b").forEach((element, index) => {
        const nextText = element.textContent;
        const priorTarget = element.dataset.atlasKpiTarget;
        element.dataset.atlasKpiTarget = nextText;
        const priorFrame = kpiFrames.get(element);
        if (priorFrame) {
          cancelAnimationFrame(priorFrame);
          kpiFrames.delete(element);
        }
        if (!duration) {
          element.textContent = nextText;
          return;
        }
        if (nextText === before[index] || priorTarget === nextText) {
          element.textContent = nextText;
          return;
        }
        const fromToken = numericTextToken(before[index]);
        const toToken = numericTextToken(nextText);
        if (fromToken && toToken) {
          const fromValue = Number(fromToken[0].replace(/[\s\u00a0]/g, "").replace(",", "."));
          const toValue = Number(toToken[0].replace(/[\s\u00a0]/g, "").replace(",", "."));
          const decimals = (toToken[0].split(/[.,]/)[1] || "").length;
          if (Number.isFinite(fromValue) && Number.isFinite(toValue)) {
            const formatter = new Intl.NumberFormat("ru-RU", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals
            });
            const started = performance.now();
            const frame = (now) => {
              const progress = Math.min(1, (now - started) / Math.max(180, duration * 1.45));
              const eased = 1 - (1 - progress) ** 3;
              const current = fromValue + (toValue - fromValue) * eased;
              element.textContent = nextText.replace(toToken[0], formatter.format(current));
              if (progress < 1) kpiFrames.set(element, requestAnimationFrame(frame));
              else {
                kpiFrames.delete(element);
                element.textContent = nextText;
              }
            };
            element.textContent = before[index];
            kpiFrames.set(element, requestAnimationFrame(frame));
          }
        }
        if (typeof element.animate === "function") {
          element.animate(
            [{ opacity: .48, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: Math.min(duration, 190), easing: "ease-out" }
          );
        }
      });
    };

    const viewCacheHost = document.createElement("div");
    viewCacheHost.className = "atlas-view-cache";
    viewCacheHost.hidden = true;
    viewCacheHost.setAttribute("aria-hidden", "true");
    viewCacheHost.inert = true;
    document.body.appendChild(viewCacheHost);

    const viewCache = new Map();
    let renderedViewportWidth = innerWidth;
    const sharedViewKeys = ["year", "sex", "age"];
    const viewStateKeys = {
      treemap: ["treeType", "treeIndex", "treeMetric", "treeColor", "treeSort", "treeShowValues", "treeMinShare"],
      heatmap: ["heatUnit", "heatMetric", "heatLimit"],
      arrow: ["arrowMode", "rankView", "rankCompare", "rankLevel", "rankClass", "rankMetric", "rankTop", "rankOnlyChanges"],
      pyramid: ["pyramidView", "pyramidLevel", "pyramidCause", "pyramidParentClass", "pyramidMetric", "pyramidAgeStep", "pyramidLabels"],
      plot: ["plotView", "plotLevel", "plotClass", "plotCause", "plotInterval", "plotSort", "plotMinN", "plotTop", "plotCompare", "plotYearA", "plotYearB", "plotDistributionMetric"],
      map: ["mapUnit", "mapMetric", "mapClass", "mapCode", "mapScaleMax", "mapLabels", "mapPalette", "mapColorLow", "mapColorHigh", "mapBreaks"],
      dotogram: ["dotUnit", "dotMetric", "dotClass", "dotLabels", "dotDataset"]
    };
    const viewSignature = (view) => {
      if (view === "infrastructure") return "infrastructure-static-v1";
      const keys = [...sharedViewKeys, ...(viewStateKeys[view] || [])];
      return JSON.stringify(keys.map((key) => state[key]));
    };

    const parkView = (view) => {
      if (!view || !els.viz.firstChild) return;
      let entry = viewCache.get(view);
      if (!entry) {
        const holder = document.createElement("div");
        holder.dataset.cachedView = view;
        viewCacheHost.appendChild(holder);
        entry = { holder, signature: "", metaHtml: "", title: "", subtitle: "", method: "" };
        viewCache.set(view, entry);
      }
      entry.holder.replaceChildren(...els.viz.childNodes);
      entry.signature = viewSignature(view);
      entry.viewportWidth = renderedViewportWidth;
      entry.metaHtml = els.meta.innerHTML;
      entry.title = els.title.textContent || "";
      entry.subtitle = els.subtitle.textContent || "";
      entry.method = els.method.textContent || "";
    };

    const restoreView = (view) => {
      const entry = viewCache.get(view);
      if (!entry) return null;
      els.viz.replaceChildren(...entry.holder.childNodes);
      return entry;
    };

    const refreshCachedChrome = (entry) => {
      const infrastructureView = state.view === "infrastructure";
      document.body.classList.toggle("infrastructure-view", infrastructureView);
      localControls();
      renderKpis();
      els.title.textContent = entry?.title || VIEWS[state.view]?.[0] || "";
      els.subtitle.textContent = entry?.subtitle || VIEWS[state.view]?.[1] || "";
      els.method.textContent = entry?.method || METHOD[state.view] || "";
      els.meta.innerHTML = entry?.metaHtml || "";
    };

    // Run after the legacy enhancers so a cached view cannot retain another
    // mode's period, population basis or explanation of the color scale.
    const updateMethodDescription = () => {
      const method = document.getElementById("methodText");
      if (!method) return;
      const first = DATA.years[0], last = DATA.years.at(-1);
      const period = state.year === "all" ? DATA.period : state.year;
      const resources = state.view === "infrastructure" && state.infraResources === "on"
        || state.view === "dotogram" && state.dotDataset === "resources";
      if (resources) {
        method.textContent = `Медицинские ресурсы за ${state.resourceYear}: опубликованные значения с единицами и источником выбранного показателя. Они не пересчитываются на население портала и не фильтруются по полу, возрасту или МКБ смертности. Шкала одна для 2023–2025 годов и не является нормативом. «Нет данных» отличается от нуля; объединённые строки не распределяются по МО. Больничная летальность не равна смертности жителей.`;
      } else if (state.view === "treemap") {
        const area = { n: "число смертей", share: "долю всех записей текущего среза", pgpzh: "сумму потерянных лет до 75 лет (ПГПЖ-75)", rate: "число смертей на 100 тыс. населения в среднем за год" }[state.treeMetric];
        const previous = DATA.years.filter(year => year < Number(state.year)).at(-1);
        const comparison = state.year === "all" ? `${last} к ${first}` : previous ? `${state.year} к ${previous}` : "для первого года нет предыдущего среза";
        const color = state.treeColor === "age" ? "Цвет показывает медианный возраст умерших."
          : state.treeColor === "change" ? `Цвет показывает изменение ${state.treeMetric === "pgpzh" ? "ПГПЖ-75" : "числа смертей"}: ${comparison}.`
          : "Основной цвет обозначает класс МКБ-10 и наследуется его блоками и кодами; небольшое осветление внутри цвета соответствует меньшему числу наблюдений. Разные оттенки классов не образуют общую числовую шкалу.";
        method.textContent = `Площадь плитки показывает ${area}. ${color} Категории меньше выбранного порога объединяются в «Прочие»; они не исключаются. Доли рассчитываются от всех записей текущего среза, в том числе записей без сопоставленной причины.${state.treeMetric === "rate" ? ` ${rateBasisText("region")}` : ""}`;
      } else if (state.view === "heatmap") {
        method.textContent = `Строки — территории, столбцы — классы МКБ-10. Для МО перечень и порядок фиксированы; НП упорядочены по выбранному показателю, число строк задаётся отдельно. Матрица учитывает только записи с сопоставленным классом МКБ-10. Доля класса рассчитывается от этих смертей внутри территории; общий счётчик может быть больше. Ноль означает отсутствие наблюдений, «н/д» — отсутствие населения для расчёта.${rateBase(state.heatMetric) ? ` ${rateBasisText(state.heatUnit)}` : ""}`;
      } else if (state.view === "arrow") {
        const slices = state.rankView === "trend" ? `все годы ${DATA.period}` : state.rankCompare === "sex" ? `мужчины и женщины за ${period}` : `${first} и ${last} годы`;
        method.textContent = `Сравниваются ${slices}. Ранг рассчитывается отдельно в каждом срезе среди всех причин выбранного уровня МКБ-10; топ ограничивает показанные строки, а не основу ранжирования. Доля — доля причины внутри своего среза. Число смертей и ПГПЖ-75 не делятся на население и не являются коэффициентами риска.`;
      } else if (state.view === "pyramid") {
        method.textContent = `Мужчины слева, женщины справа; возрастные группы по ${state.pyramidAgeStep} лет. ${state.pyramidView === "trend" ? `Светлый контур — ${first}, насыщенная полоса — ${last}; общий фильтр периода не применяется.` : `Период — ${period}.`} Показаны число смертей, доля внутри каждого пола или сумма ПГПЖ-75. Общие фильтры пола и возраста не применяются; записи без известного возраста не входят в возрастные группы. Население не используется: пирамида описывает умерших, а не риск смерти.`;
      } else if (state.view === "plot") {
        const comparison = state.plotView === "compare" ? state.plotCompare === "time" ? `Сравниваются ${state.plotYearA} и ${state.plotYearB} годы; общий фильтр периода не применяется.` : `Сравниваются мужчины и женщины за ${period}; общий фильтр пола не применяется.` : `Период — ${period}.`;
        method.textContent = `${comparison} ${state.plotView === "distribution" ? "Распределение относится к одной выбранной причине; столбцы показывают пятилетние группы, линия — сглаженную форму распределения. Доля рассчитывается внутри этой причины." : `Точка — медиана, толстый интервал — Q1–Q3, внешний — ${state.plotInterval === "range" ? "полный наблюдаемый диапазон" : "P10–P90"}. Сначала применяется минимум наблюдений, затем ограничение числа строк.`} Используются известные возрасты 0–110 лет. Это описательная статистика возраста умерших, а не коэффициент риска; интервалы разброса не являются доверительными интервалами.`;
      } else if (state.view === "map") {
        const share = mapCauseKey() === "all" ? "При выборе всех причин доля показывает вклад территории во все записи текущего среза." : "Доля выбранной причины рассчитывается от всех смертей текущего среза внутри территории.";
        const scale = fixedMunicipalityCount()
          ? `Границы цвета рассчитаны по годовым значениям МО за ${mapPeriodLabel()} для выбранной причины, пола и возраста. Пороги кратны 5 или 10. При выборе «3 года» число смертей делится на ${DATA.years.length}.`
          : "Автоматические границы цвета рассчитываются методом Дженкса для текущего среза. Их можно изменить вручную.";
        method.textContent = `Полигоны — МО, точки — НП. ${scale} Размер знака НП определяется населением переписи 2021 года, независимо от выбранного года смертей. ${share}${rateBase(state.mapMetric) ? ` ${rateBasisText(state.mapUnit)}` : ""} Сводка на карте показывает число смертей за выбранный период по территориям с рассчитанным значением. При скрытии малых значений случаи этих территорий исключаются из сводки. Записи без территориальной привязки остаются в общем счётчике.`;
      } else if (state.view === "dotogram") {
        const share = state.dotClass === "all" ? "Доля при всех классах — вклад территории во все записи текущего среза." : "Доля выбранного класса — его доля в смертях внутри территории.";
        method.textContent = `Одна точка — ${state.dotUnit === "mo" ? "муниципалитет в ранжированном списке" : "НП, сгруппированный по муниципалитету"}. ${state.dotMetric === "median" || state.dotMetric === "pgpzh" ? "Медианный возраст и ПГПЖ-75 относятся ко всей выборке территории при текущих периоде, поле и возрасте; выбор класса меняет контекст причины, но не эти показатели." : share}${rateBase(state.dotMetric) ? ` ${rateBasisText(state.dotUnit)}` : ""} Выбросы определяются правилом Q3 + 1,5×IQR; это не статистически значимые пространственные кластеры.${state.dotMetric === "n" || state.dotMetric === "pgpzh" ? " Для абсолютных значений используется корневая шкала." : ""}`;
      } else if (state.view === "infrastructure") {
        method.textContent = "Медицинские учреждения показаны по типам. Изохроны 20 и 60 минут построены от больниц, а не от всех учреждений или станций СМП. Охват оценён по населению НП переписи 2021: если точка НП попала в зону, учитывается вся его численность; 60-минутная зона включает 20-минутную. Это оценка охвата населения, а не доля смертей в зоне. Дороги служат пространственным контекстом. Общие фильтры смертности не изменяют сеть учреждений и готовые изохроны.";
      }
    };

    const baseRender = render;
    let renderedView = state.view;
    render = () => {
      Object.assign(state, {year: "2025", sex: "all", age: "all", mapClass: "all", mapCode: "all", treeType: "root", treeIndex: -1, treeMetric: "share", treeColor: "count", heatUnit: "mo", heatMetric: "share", rankLevel: "class", rankMetric: "share", rankCompare: "time", pyramidLevel: "class", pyramidMetric: "share", dotUnit: "mo", dotClass: "all"});
      if (state.view === "plot") state.view = "map";
      const previousView = renderedView;
      const nextView = state.view;
      const snapshot = previousView === nextView ? captureMotionSnapshot(previousView) : null;
      const previousKpis = [...document.querySelectorAll(".atlas-main .kpi b")].map((element) => element.textContent);
      announceFilterChanges();
      els.viz.classList.add("is-updating");
      const changedView = previousView !== nextView;
      // Keep updates synchronous so the original interaction modules see the active chart.
      const nativeViewTransition = false;
      const updateDom = () => {
        // Analysis modules temporarily suspend global filters in comparison modes.
        // Always clear the previous view's state first; the active module can then
        // reapply only the restrictions it actually needs.
        resetTransientGlobalControlState();
        if (changedView) parkView(previousView);
        els.viz.dataset.view = state.view;
        const cached = changedView ? restoreView(nextView) : null;
        const cacheFresh = cached && cached.signature === viewSignature(nextView)
          && (!["arrow", "pyramid", "plot", "dotogram"].includes(nextView) || cached.viewportWidth === innerWidth);
        if (state.view === "map") {
          renderOptimizedMapView();
        } else if (state.view === "infrastructure" && cached) {
          refreshCachedChrome(cached);
          requestAnimationFrame(() => window.AmurInfrastructureMap?.resize?.());
        } else if (changedView && cacheFresh) {
          refreshCachedChrome(cached);
        } else {
          if (cached) els.viz.replaceChildren();
          baseRender();
        }
        if (atlasDrawer) atlasDrawer.dataset.view = state.view;
        if (drawerTitle) drawerTitle.textContent = VIEWS[state.view]?.[0] || "Параметры";
        if (changedView) {
          const drawerScroll = atlasDrawer?.querySelector(".drawer-scroll");
          if (drawerScroll) drawerScroll.scrollTop = 0;
        }
        syncGlobalControls();
        writeUrlState();
        addSupplementalControls();
        enhanceTreemap();
        enhanceHeatmapContrast();
        enhanceDotogram();
        enhanceMapPaletteLegend();
        updateMethodDescription();
        if (state.view === "map") {
          const indicator = demoMetric(state.mapMetric);
          els.subtitle.textContent = state.mapUnit === "settlement" ? "Численность населения НП · перепись 2021" : indicator.label + " · " + indicator.unit + " · 2025";
          els.method.textContent = state.mapUnit === "settlement" ? "Размер точки отражает население по переписи 2021 года. Смертность на уровне НП в сборнике не опубликована." : "Источник: «" + DEMO.source + "», стр. " + indicator.page + ". Показатель приведён как опубликован. Серый цвет означает пропуск. Фильтры пола, возраста и причин не меняют карту.";
        } else if (state.view === "dotogram" && state.dotDataset !== "resources") {
          const indicator = demoMetric(state.dotMetric);
          const available = DATA.municipalities.filter(item => Number.isFinite(indicator.values[item.id])).length;
          els.subtitle.textContent = indicator.label + " · " + indicator.unit + " · 2025 · " + available + " из " + DATA.municipalities.length + " МО";
          els.method.textContent = "Источник: «" + DEMO.source + "», стр. " + indicator.page + ". Показаны МО с опубликованным значением; пропуски не заменяются нулями.";
        } else if (["treemap","heatmap","arrow","pyramid"].includes(state.view)) {
          els.subtitle.textContent = demoMissing;
          els.method.textContent = demoMissing + " Исходные записи и детализация по кодам отсутствуют в демонстрационной сборке.";
        }
        renderedView = nextView;
        renderedViewportWidth = innerWidth;
        requestAnimationFrame(() => {
          els.viz.classList.remove("is-updating");
          if (changedView && !nativeViewTransition) animateVizEntrance(true);
          else if (!changedView) animateMotionSnapshot(snapshot, nextView);
          pulseChangedKpis(previousKpis);
          highlightSearchTarget();
        });
      };
      if (nativeViewTransition) {
        document.querySelector(".atlas-main .card")?.style.setProperty("view-transition-name", "atlas-visual");
        document.startViewTransition(updateDom);
      } else {
        updateDom();
      }
    };

    document.querySelectorAll(".viz-btn").forEach((button) => {
      button.onclick = () => {
        if (state.view === button.dataset.view) return;
        state.view = button.dataset.view;
        render();
      };
    });
    const yearSelect = document.getElementById("yearSelect");
    if (yearSelect) yearSelect.onchange = () => {
      state.year = yearSelect.value;
      render();
    };
    const ageSelect = document.getElementById("ageSelect");
    if (ageSelect) ageSelect.onchange = () => {
      state.age = ageSelect.value;
      render();
    };
    document.querySelectorAll("#sexSeg button").forEach((button) => {
      button.onclick = () => {
        state.sex = button.dataset.value;
        render();
      };
    });

    window.addEventListener("popstate", () => {
      restoringHistory = true;
      Object.assign(state, defaults);
      readUrlState();
      render();
      restoringHistory = false;
    });

    readUrlState();
    render();
  };

  enhanceAtlas();
})();
