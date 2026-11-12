(() => {
  "use strict";

  if (typeof state === "undefined" || typeof DATA === "undefined" || typeof renderArrow !== "function") return;

  if (state.rankView === undefined) state.rankView = "compare";
  if (state.rankCompare === undefined) state.rankCompare = state.arrowMode === "sex" ? "sex" : "time";
  if (state.rankLevel === undefined) state.rankLevel = "class";
  if (state.rankClass === undefined) state.rankClass = "all";
  if (state.rankMetric === undefined) state.rankMetric = "n";
  if (state.rankTop === undefined) state.rankTop = "15";
  if (state.rankOnlyChanges === undefined) state.rankOnlyChanges = "0";

  VIEWS.arrow = [
    "Анализ рангов причин смерти",
    "Два среза показывают изменение позиции и реального значения; режим по годам — траекторию ранга в 2023–2025 годах."
  ];
  METHOD.arrow = "Ранг рассчитывается отдельно внутри каждого среза по выбранному показателю. Подъём к первому месту обозначен коралловым, снижение — синим, неизменная позиция — серым. Абсолютное и относительное изменение приведены в правой аналитической панели.";

  const baseLocalControls = localControls;
  let selectedKey = "";
  let selectedPayload = null;
  let activeRankModel = null;
  let rankViewport = { signature: "", top: 0, selectionVisible: false };
  let rankScrollAnchor = null;

  const revealSelected = (canvas) => {
    const point = canvas?.querySelector(".is-selected .rank-point:last-of-type");
    if (!canvas || !point || !matchMedia("(min-width: 1024px)").matches) return;
    const visible = canvas.getBoundingClientRect();
    const selected = point.getBoundingClientRect();
    if (selected.top < visible.top + 24) canvas.scrollTop += selected.top - visible.top - 24;
    else if (selected.bottom > visible.bottom - 24) canvas.scrollTop += selected.bottom - visible.bottom + 24;
  };

  const rememberViewport = (canvas) => {
    if (!canvas?.isConnected) return;
    const bounds = canvas.getBoundingClientRect();
    const point = canvas.querySelector(".is-selected .rank-point:last-of-type")?.getBoundingClientRect();
    rankViewport.top = canvas.scrollTop;
    rankViewport.selectionVisible = Boolean(point && point.top >= bounds.top && point.bottom <= bounds.bottom);
  };

  // Inspector/chrome layout can settle after renderArrow and change the scroll
  // viewport without a window resize. Keep an explicit list selection visible
  // until the user starts scrolling or interacting with the diagram themselves.
  const rankResizeObserver = new ResizeObserver(entries => {
    for (const { target: canvas } of entries) {
      if (state.view !== "arrow" || !els.viz.contains(canvas)) continue;
      if (rankScrollAnchor === selectedKey) revealSelected(canvas);
      rememberViewport(canvas);
    }
  });

  const number = (value, digits = 0) => new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(Number(value) || 0);

  const signed = (value, suffix = "") => {
    if (value == null || !Number.isFinite(value)) return "н/д";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${number(Math.abs(value), 1)}${suffix}`;
  };

  const shortLabel = (value, maximum = 36) => {
    const text = String(value || "");
    return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
  };

  const metricLabel = () => ({
    n: "количество смертей",
    share: "доля внутри среза",
    pgpzh: "ПГПЖ-75"
  })[state.rankMetric] || "значение";

  const formatMetric = (value) => state.rankMetric === "share"
    ? `${number(value, 1)}%`
    : state.rankMetric === "pgpzh"
      ? number(value, 0)
      : number(value, 0);

  const rankReference = Object.freeze({
    classes: DATA.classes,
    blocks: DATA.blocks,
    codes: DATA.codes
  });

  const rankOptions = () => ({
    level: state.rankLevel,
    classIndex: state.rankClass === "all" ? "all" : +state.rankClass,
    metric: state.rankMetric,
    top: Math.max(5, Number(state.rankTop) || 15),
    onlyChanges: state.rankOnlyChanges === "1"
  });

  const buildRankModel = (slices) => ANALYTICS_CORE.buildRankModel(slices, rankReference, rankOptions());

  const causeDefinitions = () => ANALYTICS_CORE.rankDefinitions(rankReference, rankOptions());

  const rowsForYear = (year) => filtered({ years: [year] });

  const comparisonSlices = () => {
    if (state.rankCompare === "sex") {
      const base = filtered({ ignoreSex: true });
      return [
        { key: "male", label: "Мужчины", note: state.year === "all" ? "2023–2025" : String(state.year), rows: base.filter((row) => row[1] === 1) },
        { key: "female", label: "Женщины", note: state.year === "all" ? "2023–2025" : String(state.year), rows: base.filter((row) => row[1] === 2) }
      ];
    }
    return [
      { key: "2023", label: "2023", note: state.sex === "all" ? "оба пола" : state.sex === "1" ? "мужчины" : "женщины", rows: rowsForYear(2023) },
      { key: "2025", label: "2025", note: state.sex === "all" ? "оба пола" : state.sex === "1" ? "мужчины" : "женщины", rows: rowsForYear(2025) }
    ];
  };

  const movementTone = (rankDelta) => rankDelta > 0
    ? { color: "#dc6a5f", className: "is-rise", word: "поднялась" }
    : rankDelta < 0
      ? { color: "#4b84bd", className: "is-fall", word: "снизилась" }
      : { color: "#9ca8b7", className: "is-stable", word: "сохранила позицию" };

  const emitContext = (payload) => {
    selectedPayload = payload;
    window.dispatchEvent(new CustomEvent("atlas:inspector-context", { detail: payload }));
    window.dispatchEvent(new CustomEvent("atlas:rank-state"));
  };

  const tooltipHtml = (definition, series, labels) => {
    const first = series[0];
    const last = series[series.length - 1];
    const rankDelta = first.rank - last.rank;
    const valueDelta = first.value > 0 ? (last.value - first.value) / first.value * 100 : null;
    return `<b>${esc(definition.code)} · ${esc(definition.label)}</b><div class="tip-grid">`
      + series.map((item, index) => `<span>${esc(labels[index])}</span><strong>${item.rank} место · ${esc(formatMetric(item.value))}</strong>`).join("")
      + `<span>Изменение ранга</span><strong>${rankDelta > 0 ? "↑" : rankDelta < 0 ? "↓" : "—"} ${Math.abs(rankDelta)}</strong>`
      + `<span>Изменение значения</span><strong>${esc(signed(valueDelta, "%"))}</strong></div>`;
  };

  const setTrajectoryState = (root, group, active) => {
    root.classList.toggle("has-focus", active);
    group.classList.toggle("is-active", active);
  };

  const attachTrajectoryInteraction = (root, group, definition, series, labels, context) => {
    group.dataset.inspectorManaged = "true";
    group.dataset.rankKey = definition.key;
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${definition.code}. ${definition.label}. ${labels[0]}: ${series[0].rank} место. ${labels[labels.length - 1]}: ${series[series.length - 1].rank} место.`);
    const payload = context;
    const select = () => {
      selectedKey = definition.key;
      root.querySelectorAll(".rank-trajectory").forEach((item) => {
        item.classList.toggle("is-selected", item === group);
        item.setAttribute("aria-pressed", String(item === group));
      });
      emitContext(payload);
    };
    group.addEventListener("mouseenter", () => setTrajectoryState(root, group, true));
    group.addEventListener("mouseleave", () => setTrajectoryState(root, group, false));
    group.addEventListener("focus", () => setTrajectoryState(root, group, true));
    group.addEventListener("blur", () => setTrajectoryState(root, group, false));
    group.addEventListener("click", select);
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select();
    });
    addTip(group, tooltipHtml(definition, series, labels));
    if (selectedKey === definition.key) {
      group.classList.add("is-selected");
      selectedPayload = payload;
    }
    group.setAttribute("aria-pressed", String(selectedKey === definition.key));
    return payload;
  };

  const rootShell = (title, subtitle, footnote) => {
    const root = document.createElement("section");
    root.className = "rank-analysis";
    root.innerHTML = `<header class="rank-analysis__toolbar"><div class="rank-analysis__summary"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div><div class="rank-analysis__legend"><span><i class="is-rise"></i>подъём к 1 месту</span><span><i class="is-fall"></i>снижение</span><span><i class="is-stable"></i>без изменения</span></div></header><div class="rank-analysis__canvas"></div><footer class="rank-analysis__footnote">${esc(footnote)}</footer>`;
    return root;
  };

  // Keep SVG units equal to screen pixels: fitting a tall ranking into a short
  // viewport makes the labels unreadable. The canvas scrolls independently.
  const desktopFrame = (count, label) => {
    const width = Math.min(1320, Math.max(600, Math.round(els.viz.clientWidth - 40)));
    const height = 82 + Math.max(0, count - 1) * 42;
    return { width, height, graphic: svg("svg", {
      viewBox: `0 0 ${width} ${height}`, width, height,
      class: "rank-analysis-svg rank-analysis-svg--desktop",
      "aria-label": label
    }) };
  };

  const labelHit = (group, x, y, width) => group.appendChild(svg("rect", {
    x, y: y - 19, width, height: 36, fill: "transparent", class: "rank-label-hit"
  }));

  const labelMeasure = document.createElement("canvas").getContext("2d");
  const desktopLabel = (definition, prefix, available) => {
    const full = `${prefix}${definition.code} ${definition.label}`;
    if (!labelMeasure) return shortLabel(full, Math.floor(available / 8));
    labelMeasure.font = `600 13px ${getComputedStyle(els.viz).fontFamily}`;
    let length = full.length;
    while (length > 1 && labelMeasure.measureText(length === full.length ? full : `${full.slice(0, length)}…`).width > available) length--;
    return length === full.length ? full : `${full.slice(0, length).trimEnd()}…`;
  };

  const compactRanks = (root, model) => {
    const width = Math.max(300, Math.round(els.viz.clientWidth));
    const labels = model.labels;
    const height = 48 + model.items.length * 100;
    const graphic = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "rank-analysis-svg rank-analysis-svg--compact", "aria-label": "Места и значения причин смерти по срезам" });
    const x = index => 66 + index * (width - 132) / Math.max(labels.length - 1, 1);
    labels.forEach((label, index) => textNode(graphic, x(index), 25, label, "rank-column-title", "middle"));
    const contexts = [];
    [...model.items].sort((a, b) => a.series.at(-1).rank - b.series.at(-1).rank).forEach(({ definition, series, context }, index) => {
      const y = 48 + index * 100;
      const tone = movementTone(series[0].rank - series.at(-1).rank);
      const group = svg("g", { class: `rank-trajectory ${tone.className}` });
      group.appendChild(svg("rect", { x: 8, y, width: width - 16, height: 96, rx: 8, class: "rank-mobile-hit" }));
      textNode(group, 16, y + 20, `${definition.code} · ${shortLabel(definition.label, Math.max(16, Math.floor((width - 46) / 6.7) - definition.code.length))}`, "rank-label", "start");
      group.appendChild(svg("line", { x1: x(0), x2: x(series.length - 1), y1: y + 51, y2: y + 51, stroke: tone.color, class: "rank-line" }));
      series.forEach((slice, column) => {
        group.appendChild(svg("circle", { cx: x(column), cy: y + 51, r: 14, fill: tone.color, class: "rank-point rank-point--numbered" }));
        textNode(group, x(column), y + 55, slice.rank, "rank-delta-text rank-rank-number", "middle");
        textNode(group, x(column), y + 80, formatMetric(slice.value), "rank-label-value", "middle");
      });
      if (series.length === 2) {
        const delta = series[0].rank - series[1].rank;
        group.appendChild(svg("rect", { x: width / 2 - 22, y: y + 39, width: 44, height: 24, rx: 12, class: "rank-delta-pill" }));
        textNode(group, width / 2, y + 55, delta ? `${delta > 0 ? "↑" : "↓"}${Math.abs(delta)}` : "—", "rank-delta-text", "middle");
      }
      graphic.appendChild(group);
      contexts.push(attachTrajectoryInteraction(graphic, group, definition, series, labels, context));
    });
    root.classList.add("rank-analysis--compact");
    root.querySelector(".rank-analysis__canvas").appendChild(graphic);
    root.querySelector(".rank-analysis__footnote").textContent = "В каждой строке — причина: число в круге показывает место, подпись под ним — значение в соответствующем срезе. Нажмите строку для сведений.";
    activeRankModel = Object.freeze({ labels: Object.freeze([...labels]), items: Object.freeze(contexts) });
    return { root, firstPayload: contexts[0] || null };
  };

  const compareChart = () => {
    const slices = comparisonSlices();
    const model = buildRankModel(slices);
    const rankedItems = model.items;
    if (!rankedItems.length) return null;
    if (!rankedItems.some((item) => item.definition.key === selectedKey)) selectedKey = rankedItems[0].definition.key;
    const leftOrder = [...rankedItems].sort((a, b) => a.series[0].rank - b.series[0].rank);
    const rightOrder = [...rankedItems].sort((a, b) => a.series[1].rank - b.series[1].rank);
    const leftPosition = new Map(leftOrder.map((item, index) => [item.definition.key, index]));
    const rightPosition = new Map(rightOrder.map((item, index) => [item.definition.key, index]));
    const root = rootShell(
      `${slices[0].label} → ${slices[1].label}`,
      `${metricLabel()} · ${state.rankLevel === "class" ? "классы" : state.rankLevel === "block" ? "крупные блоки" : "трёхзначные коды"} · топ-${state.rankTop}`,
      state.rankCompare === "sex"
        ? "Сравнение показывает структуру причин у мужчин и женщин. Это не половозрастной коэффициент смертности, поскольку численность населения по полу здесь не используется."
        : "Показаны причины, вошедшие в топ хотя бы одного среза. Место рассчитано среди всех причин выбранного уровня, а не только среди видимых линий."
    );
    const canvas = root.querySelector(".rank-analysis__canvas");
    if (matchMedia("(max-width: 700px)").matches) return compactRanks(root, model);
    const { width, height, graphic } = desktopFrame(rankedItems.length, `Изменение рангов: ${slices[0].label} и ${slices[1].label}`);
    const x1 = Math.min(310, width * .34);
    const x2 = width - x1;
    const top = 62;
    const rowStep = 42;
    const y = (position) => top + position * rowStep;
    textNode(graphic, x1, 20, slices[0].label, "rank-column-title", "middle");
    textNode(graphic, x1, 34, slices[0].note, "rank-column-subtitle", "middle");
    textNode(graphic, x2, 20, slices[1].label, "rank-column-title", "middle");
    textNode(graphic, x2, 34, slices[1].note, "rank-column-subtitle", "middle");
    [x1, x2].forEach((x) => graphic.appendChild(svg("line", { x1: x, y1: 43, x2: x, y2: height - 10, class: "rank-guide" })));
    let firstPayload = null;
    const contexts = [];
    rankedItems.forEach(({ definition, series, context }) => {
      const y1 = y(leftPosition.get(definition.key));
      const y2 = y(rightPosition.get(definition.key));
      const delta = series[0].rank - series[1].rank;
      const tone = movementTone(delta);
      const group = svg("g", { class: `rank-trajectory ${tone.className}` });
      labelHit(group, 8, y1, x1 - 18);
      labelHit(group, x2 + 10, y2, width - x2 - 18);
      const line = svg("line", { x1, y1, x2, y2, class: "rank-line", stroke: tone.color, "stroke-width": delta === 0 ? 1.8 : 2.4, opacity: .88 });
      const hit = svg("line", { x1, y1, x2, y2, class: "rank-hit" });
      group.append(line, hit);
      group.appendChild(svg("circle", { cx: x1, cy: y1, r: 4, fill: tone.color, class: "rank-point" }));
      group.appendChild(svg("circle", { cx: x2, cy: y2, r: 4, fill: tone.color, class: "rank-point" }));
      const leftText = textNode(group, x1 - 12, y1 - 3, desktopLabel(definition, `${series[0].rank}. `, x1 - 28), "rank-label", "end");
      const leftValue = textNode(group, x1 - 12, y1 + 13, formatMetric(series[0].value), "rank-label-value", "end");
      const rightText = textNode(group, x2 + 12, y2 - 3, desktopLabel(definition, `${series[1].rank}. `, x1 - 28), "rank-label", "start");
      const rightValue = textNode(group, x2 + 12, y2 + 13, formatMetric(series[1].value), "rank-label-value", "start");
      [leftText, leftValue, rightText, rightValue].forEach((node) => { node.style.pointerEvents = "none"; });
      if (delta !== 0) {
        const middleX = x2 - 32;
        const middleY = y2;
        group.appendChild(svg("rect", { x: middleX - 17, y: middleY - 11, width: 34, height: 22, rx: 11, class: "rank-delta-pill", stroke: tone.color }));
        const deltaText = textNode(group, middleX, middleY + 3.5, `${delta > 0 ? "↑" : "↓"}${Math.abs(delta)}`, "rank-delta-text", "middle");
        deltaText.setAttribute("fill", tone.color);
      }
      graphic.appendChild(group);
      const payload = attachTrajectoryInteraction(graphic, group, definition, series, model.labels, context);
      contexts.push(payload);
      if (!firstPayload) firstPayload = payload;
    });
    canvas.appendChild(graphic);
    activeRankModel = Object.freeze({ labels: Object.freeze(slices.map((slice) => slice.label)), items: Object.freeze(contexts) });
    return { root, firstPayload };
  };

  const bumpChart = () => {
    const years = DATA.years.slice().sort((a, b) => a - b);
    const slices = years.map((year) => ({ key: String(year), label: String(year), note: "", rows: rowsForYear(year) }));
    const model = buildRankModel(slices);
    const rankedItems = model.items;
    if (!rankedItems.length) return null;
    if (!rankedItems.some((item) => item.definition.key === selectedKey)) selectedKey = rankedItems[0].definition.key;
    const displayPositions = years.map((_, yearIndex) => new Map(
      [...rankedItems]
        .sort((a, b) => a.series[yearIndex].rank - b.series[yearIndex].rank)
        .map((item, index) => [item.definition.key, index])
    ));
    const root = rootShell(
      "Траектории 2023–2025",
      `${metricLabel()} · ${state.rankLevel === "class" ? "классы" : state.rankLevel === "block" ? "крупные блоки" : "трёхзначные коды"} · топ-${state.rankTop}`,
      "Линия показывает ежегодное положение причины. Место рассчитано среди всех причин выбранного уровня; подписи даны на концах траектории. Глобальный фильтр года в этом режиме не применяется."
    );
    const canvas = root.querySelector(".rank-analysis__canvas");
    if (matchMedia("(max-width: 700px)").matches) return compactRanks(root, model);
    const { width, height, graphic } = desktopFrame(rankedItems.length, "Траектории рангов причин смерти по годам");
    const left = Math.min(310, width * .34);
    const right = width - left;
    const top = 62;
    const x = (index) => left + (right - left) * index / Math.max(years.length - 1, 1);
    const rowStep = 42;
    const y = (yearIndex, key) => top + displayPositions[yearIndex].get(key) * rowStep;
    years.forEach((year, index) => {
      const xpos = x(index);
      graphic.appendChild(svg("line", { x1: xpos, y1: 38, x2: xpos, y2: height - 10, class: "rank-guide" }));
      textNode(graphic, xpos, 22, year, "rank-year-label", "middle");
    });
    let firstPayload = null;
    const contexts = [];
    rankedItems.forEach(({ definition, series, context }) => {
      const delta = series[0].rank - series[series.length - 1].rank;
      const tone = movementTone(delta);
      const points = series.map((_, index) => [x(index), y(index, definition.key)]);
      const pathD = points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
      const group = svg("g", { class: `rank-trajectory ${tone.className}` });
      labelHit(group, 8, points[0][1], left - 18);
      labelHit(group, right + 10, points[points.length - 1][1], width - right - 18);
      group.appendChild(svg("path", { d: pathD, class: "rank-line", fill: "none", stroke: tone.color, "stroke-width": delta === 0 ? 1.8 : 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: .88 }));
      group.appendChild(svg("path", { d: pathD, class: "rank-hit" }));
      points.forEach((point, index) => {
        group.appendChild(svg("circle", { cx: point[0], cy: point[1], r: 8, fill: tone.color, class: "rank-point rank-point--numbered" }));
        const rankText = textNode(group, point[0], point[1] + 3.2, series[index].rank, "rank-delta-text rank-rank-number", "middle");
        rankText.setAttribute("fill", "#fff");
        rankText.style.pointerEvents = "none";
      });
      textNode(group, points[0][0] - 12, points[0][1] - 3, desktopLabel(definition, "", left - 28), "rank-label", "end");
      textNode(group, points[0][0] - 12, points[0][1] + 13, formatMetric(series[0].value), "rank-label-value", "end");
      textNode(group, points[points.length - 1][0] + 12, points[points.length - 1][1] - 3, desktopLabel(definition, "", left - 28), "rank-label", "start");
      textNode(group, points[points.length - 1][0] + 12, points[points.length - 1][1] + 13, formatMetric(series[series.length - 1].value), "rank-label-value", "start");
      graphic.appendChild(group);
      const payload = attachTrajectoryInteraction(graphic, group, definition, series, model.labels, context);
      contexts.push(payload);
      if (!firstPayload) firstPayload = payload;
    });
    canvas.appendChild(graphic);
    activeRankModel = Object.freeze({ labels: Object.freeze(years.map(String)), items: Object.freeze(contexts) });
    return { root, firstPayload };
  };

  const rankControls = () => {
    const classSelector = state.rankLevel === "class" ? "" : selectField(
      "rankClass",
      "Класс для детализации",
      classOptions("Все классы"),
      state.rankClass
    );
    els.local.innerHTML = `
      <span class="rank-controls__label">Режим анализа</span>
      <div class="rank-mode-switch" role="group" aria-label="Режим анализа рангов">
        <button type="button" data-rank-view="compare" aria-pressed="${state.rankView === "compare"}">Два среза</button>
        <button type="button" data-rank-view="trend" aria-pressed="${state.rankView === "trend"}">По годам</button>
      </div>
      ${state.rankView === "compare" ? selectField("rankCompare", "Сравнивать", [["time", "2023 → 2025"], ["sex", "Мужчины → женщины"]], state.rankCompare) : ""}
      ${selectField("rankLevel", "Уровень МКБ-10", [["class", "Классы"], ["block", "Крупные блоки"], ["code", "Трёхзначные коды"]], state.rankLevel)}
      ${classSelector}
      <div class="rank-control-row">
        ${selectField("rankMetric", "Показатель", [["n", "Количество смертей"], ["share", "Доля внутри среза"], ["pgpzh", "ПГПЖ-75"]], state.rankMetric)}
        ${selectField("rankTop", "Показать", [["10", "Топ-10"], ["15", "Топ-15"], ["20", "Топ-20"]], state.rankTop)}
      </div>
      <label class="rank-inline-check"><input id="rankOnlyChanges" type="checkbox" ${state.rankOnlyChanges === "1" ? "checked" : ""}><span>Показывать только причины, изменившие позицию</span></label>`;
    els.local.querySelectorAll("[data-rank-view]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.rankView === button.dataset.rankView) return;
        state.rankView = button.dataset.rankView;
        selectedKey = "";
        render();
      });
    });
    ["rankCompare", "rankLevel", "rankClass", "rankMetric", "rankTop"].forEach((id) => {
      const control = document.getElementById(id);
      if (!control) return;
      control.addEventListener("change", () => {
        state[id] = control.value;
        if (id === "rankLevel" && control.value === "class") state.rankClass = "all";
        selectedKey = "";
        render();
      });
    });
    document.getElementById("rankOnlyChanges")?.addEventListener("change", (event) => {
      state.rankOnlyChanges = event.target.checked ? "1" : "0";
      selectedKey = "";
      render();
    });
  };

  const publicContext = (payload) => payload ? Object.freeze({
    key: payload.key,
    code: payload.code,
    label: payload.label,
    color: payload.color,
    title: payload.title,
    subtitle: payload.subtitle,
    primaryLabel: payload.primary.label,
    primaryValue: payload.primary.value,
    changeValue: payload.change.value,
    rankDelta: payload.rankDelta,
    relativeDelta: payload.relativeDelta,
    valueDelta: payload.valueDelta,
    shareDelta: payload.shareDelta,
    rankBefore: payload.rankBefore,
    rankAfter: payload.rankAfter,
    valueBefore: payload.valueBefore,
    valueAfter: payload.valueAfter,
    valueBeforeText: payload.valueBeforeText,
    valueAfterText: payload.valueAfterText,
    shareBefore: payload.shareBefore,
    shareAfter: payload.shareAfter,
    medianAge: payload.medianAge,
    pgpzh75: payload.pgpzh75,
    insight: payload.insight
  }) : null;

  const getPublicSummary = () => {
    const items = activeRankModel?.items || [];
    const selected = items.find((item) => item.key === selectedKey) || selectedPayload || items[0] || null;
    const movers = [...items]
      .sort((left, right) => Math.abs(right.rankDelta) - Math.abs(left.rankDelta)
        || Math.abs(right.relativeDelta || 0) - Math.abs(left.relativeDelta || 0)
        || left.rankAfter - right.rankAfter)
      .slice(0, 6)
      .map(publicContext);
    return Object.freeze({
      active: state.view === "arrow",
      view: state.rankView,
      compare: state.rankCompare,
      level: state.rankLevel,
      classIndex: String(state.rankClass),
      metric: state.rankMetric,
      top: String(state.rankTop),
      onlyChanges: state.rankOnlyChanges === "1",
      itemCount: items.length,
      slices: Object.freeze([...(activeRankModel?.labels || [])]),
      classOptions: Object.freeze(DATA.classes.map((definition, index) => Object.freeze({
        value: String(index),
        label: `${definition.roman}. ${definition.short}`
      }))),
      selected: publicContext(selected),
      movers: Object.freeze(movers)
    });
  };

  const setPublicOption = (option, value) => {
    if (state.view !== "arrow") return;
    const next = String(value);
    const valid = {
      view: new Set(["compare", "trend"]),
      compare: new Set(["time", "sex"]),
      level: new Set(["class", "block", "code"]),
      metric: new Set(["n", "share", "pgpzh"]),
      top: new Set(["10", "15", "20"]),
      onlyChanges: new Set(["0", "1"])
    };
    if (option === "classIndex") {
      if (next !== "all" && !DATA.classes[Number(next)]) return;
      state.rankClass = next;
    } else {
      const stateKey = {
        view: "rankView",
        compare: "rankCompare",
        level: "rankLevel",
        metric: "rankMetric",
        top: "rankTop",
        onlyChanges: "rankOnlyChanges"
      }[option];
      if (!stateKey || !valid[option]?.has(next)) return;
      state[stateKey] = next;
      if (option === "level" && next === "class") state.rankClass = "all";
    }
    selectedKey = "";
    selectedPayload = null;
    render();
  };

  const selectPublicItem = (key) => {
    if (state.view !== "arrow") return;
    const target = [...document.querySelectorAll(".rank-trajectory")]
      .find((item) => item.dataset.rankKey === String(key));
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const canvas = target?.closest(".rank-analysis__canvas");
    rankScrollAnchor = target ? selectedKey : null;
    revealSelected(canvas);
    rememberViewport(canvas);
  };

  window.AmurRankAnalysis = Object.freeze({
    getSummary: getPublicSummary,
    setOption: setPublicOption,
    selectItem: selectPublicItem
  });

  localControls = () => {
    els.viz.classList.toggle("rank-analysis-host", state.view === "arrow");
    if (state.view !== "arrow") {
      baseLocalControls();
      return;
    }
    rankControls();
  };

  renderArrow = () => {
    rankResizeObserver.disconnect();
    const year = document.getElementById("yearSelect");
    if (year) year.disabled = state.rankView === "trend" || state.rankCompare === "time";
    document.querySelectorAll("#sexSeg button").forEach(button => {
      button.disabled = state.rankView === "compare" && state.rankCompare === "sex";
    });
    state.arrowMode = state.rankCompare;
    const result = state.rankView === "trend" ? bumpChart() : compareChart();
    if (!result) {
      activeRankModel = null;
      selectedPayload = null;
      els.viz.innerHTML = '<div class="rank-analysis__empty">Нет сопоставимых долей в сборнике для построения рангов.</div>';
      window.dispatchEvent(new CustomEvent("atlas:inspector-context", { detail: null }));
      window.dispatchEvent(new CustomEvent("atlas:rank-state"));
      return;
    }
    els.viz.appendChild(result.root);
    const canvas = result.root.querySelector(".rank-analysis__canvas");
    const signature = JSON.stringify([state.rankView, state.rankMetric, activeRankModel?.labels,
      activeRankModel?.items.map(item => [item.key, item.valueBefore, item.valueAfter])]);
    if (canvas && matchMedia("(min-width: 1024px)").matches) {
      if (rankViewport.signature === signature) {
        canvas.scrollTop = rankViewport.top;
        if (rankViewport.selectionVisible) revealSelected(canvas);
      } else {
        rankViewport = { signature, top: 0, selectionVisible: false };
        rankScrollAnchor = null;
      }
      canvas.addEventListener("scroll", () => rememberViewport(canvas), { passive: true });
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
        canvas.addEventListener(event, () => { rankScrollAnchor = null; }, { passive: true });
      }
      rankResizeObserver.observe(canvas);
      rememberViewport(canvas);
    }
    const chips = els.meta.querySelectorAll(".chip");
    if (chips[0] && (state.rankView === "trend" || state.rankCompare === "time")) {
      chips[0].textContent = state.rankView === "trend" ? "2023–2025" : "2023 → 2025";
    }
    if (chips[1] && state.rankView === "compare" && state.rankCompare === "sex") chips[1].textContent = "мужчины и женщины";
    const payload = selectedPayload || result.firstPayload;
    requestAnimationFrame(() => emitContext(payload));
    els.meta.insertAdjacentHTML("beforeend", `<span class="chip">${state.rankView === "trend" ? "траектория 3 лет" : "2 сравниваемых среза"}</span><span class="chip">${esc(metricLabel())}</span>`);
  };
})();
