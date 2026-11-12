(() => {
  "use strict";

  if (typeof state === "undefined" || typeof render !== "function" || typeof DATA === "undefined") return;

  const body = document.body;
  const content = document.querySelector(".atlas-main .content");
  const card = content?.querySelector(":scope > .card");
  const chartHead = card?.querySelector(".chart-head");
  const viz = document.getElementById("viz");
  if (!content || !card || !chartHead || !viz) return;

  const MAP_VIEWS = new Set(["map", "infrastructure"]);
  const OWN_INSPECTOR_VIEWS = new Set(["map", "infrastructure", "treemap", "heatmap"]);
  let selectedContext = null;
  let renderedView = state.view;
  let fullscreenFallback = false;

  body.classList.add("hybrid-ui");
  card.classList.add("hybrid-fullscreen-target");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);

  const formatNumber = (value, digits = 0) => new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(Number(value) || 0);

  const filteredRows = (options) => {
    try { return filtered(options); } catch { return []; }
  };

  const classCountsFor = (rows) => {
    const counts = new Array(DATA.classes.length).fill(0);
    rows.forEach((row) => {
      const classIndex = classOf(row);
      if (classIndex >= 0) counts[classIndex] += 1;
    });
    return counts;
  };

  const selectionMetricPreference = () => ({
    heatmap: ["Количество смертей", "Доля класса", "На 1 000", "На 10 000", "На 100 000"],
    arrow: ["Сдвиг", "2025", "Женщины", "Мужчины"],
    pyramid: ["Количество", "Доля"],
    plot: ["Медиана", "Q1–Q3", "n"],
    dotogram: ["Значение", "Выбранная причина", "Всего"]
  })[state.view] || [];

  const parseTooltip = () => {
    const tooltip = document.getElementById("tooltip");
    if (!tooltip?.innerHTML.trim()) return null;
    const frame = document.createElement("div");
    frame.innerHTML = tooltip.innerHTML;
    const title = frame.querySelector("b")?.textContent?.trim();
    if (!title) return null;
    const labels = [...frame.querySelectorAll(".tip-grid > span")];
    const values = [...frame.querySelectorAll(".tip-grid > strong")];
    const details = labels.map((label, index) => ({
      label: label.textContent.trim(),
      value: values[index]?.textContent?.trim() || "—"
    }));
    const preferences = selectionMetricPreference();
    const primary = preferences
      .map((needle) => details.find((item) => item.label.toLowerCase().includes(needle.toLowerCase())))
      .find(Boolean) || details[0];
    const change = details.find((item) => /измен|сдвиг|динамик/i.test(item.label));
    return { title, details, primary, change };
  };

  const defaultSummary = () => {
    const rows = filteredRows();
    const ages = rows.filter((row) => row[2] >= 0).map((row) => row[2]).sort((left, right) => left - right);
    const median = ages.length ? ages[Math.floor((ages.length - 1) / 2)] : null;
    const counts = classCountsFor(rows);
    const ranking = counts.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value);
    const leader = ranking[0];
    const leaderDefinition = leader ? DATA.classes[leader.index] : null;
    const firstYear = DATA.years[0];
    const lastYear = DATA.years[DATA.years.length - 1];
    const firstCount = filteredRows({ years: [firstYear] }).length;
    const lastCount = filteredRows({ years: [lastYear] }).length;
    const change = firstCount > 0 ? (lastCount - firstCount) / firstCount * 100 : null;
    const leaderShare = rows.length && leader ? leader.value / rows.length * 100 : 0;
    const period = state.year === "all" ? `${firstYear}–${lastYear}` : String(state.year);
    const sex = state.sex === "all" ? "оба пола" : state.sex === "1" ? "мужчины" : "женщины";
    const age = document.querySelector(`#ageSelect option[value="${state.age}"]`)?.textContent || "все возрасты";
    const viewTitle = typeof VIEWS !== "undefined" ? VIEWS[state.view]?.[0] : "Текущая визуализация";
    return {
      title: "Текущий аналитический срез",
      subtitle: `${period} · ${sex} · ${age}`,
      primaryLabel: "смертей в фильтре",
      primaryValue: formatNumber(rows.length),
      change,
      rank: leaderDefinition ? `1 из ${DATA.classes.length}` : "н/д",
      leader: leaderDefinition ? `${leaderDefinition.roman}. ${leaderDefinition.short}` : "нет данных",
      median: median == null ? "н/д" : `${formatNumber(median, 0)} лет`,
      insight: leaderDefinition
        ? `${leaderDefinition.roman}. ${leaderDefinition.short} — ведущий класс в текущем срезе (${formatNumber(leaderShare, 1)}%). ${change == null ? "Для оценки динамики недостаточно данных." : change > 0 ? `Общее число наблюдений выросло на ${formatNumber(Math.abs(change), 1)}% между ${firstYear} и ${lastYear}.` : change < 0 ? `Общее число наблюдений снизилось на ${formatNumber(Math.abs(change), 1)}% между ${firstYear} и ${lastYear}.` : "Общее число наблюдений между крайними годами не изменилось."}`
        : "Для выбранных фильтров нет наблюдений.",
      viewTitle
    };
  };

  const inspector = document.createElement("aside");
  inspector.className = "hybrid-inspector";
  inspector.id = "hybridInspector";
  inspector.setAttribute("aria-label", "Контекст и выводы по текущей визуализации");
  inspector.innerHTML = `
    <header class="hybrid-inspector__head">
      <div><span>Аналитический контекст</span><h3 id="hybridInspectorTitle">Текущий срез</h3></div>
      <button class="hybrid-inspector__close" type="button" aria-label="Закрыть аналитическую панель"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
    </header>
    <div class="hybrid-inspector__body"><div class="react-rank-inspector-host" data-react-rank-inspector hidden></div><div class="react-pyramid-inspector-host" data-react-pyramid-inspector hidden></div><div class="react-plot-inspector-host" data-react-plot-inspector hidden></div><div class="react-dotogram-inspector-host" data-react-dotogram-inspector hidden></div><div class="hybrid-inspector__content" data-legacy-hybrid-inspector-content></div></div>`;
  content.insertBefore(inspector, content.querySelector(":scope > .method"));

  const inspectorContent = inspector.querySelector(".hybrid-inspector__content");
  const inspectorTitle = inspector.querySelector("#hybridInspectorTitle");

  const renderInspector = () => {
    if (OWN_INSPECTOR_VIEWS.has(state.view)) return;
    if (["arrow", "pyramid"].includes(state.view) || state.view === "dotogram") {
      inspectorTitle.textContent = document.getElementById("chartTitle")?.textContent || "Аналитический контекст";
      inspectorContent.innerHTML = state.view === "dotogram" ? "" : '<section class="hybrid-inspector__section"><p>Нет данных в сборнике для этого среза.</p></section>';
      return;
    }
    const summary = defaultSummary();
    const selected = selectedContext;
    const changeText = selected?.change?.value || (summary.change == null
      ? "н/д"
      : `${summary.change > 0 ? "+" : ""}${formatNumber(summary.change, 1)}%`);
    const changeClass = /(^|\s)-/.test(changeText)
      ? "is-negative"
      : /(^|\s)\+/.test(changeText) ? "is-positive" : "";
    const primaryValue = selected?.primary?.value || summary.primaryValue;
    const primaryLabel = selected?.primary?.label || summary.primaryLabel;
    const details = selected?.details?.slice(0, 7) || [];
    const selectionTitle = selected?.title || summary.title;
    const selectionSubtitle = selected?.subtitle || (selected ? "Выбранный элемент визуализации" : summary.subtitle);
    const selectedInsight = selected?.insight || (selected
      ? `${selectionTitle}: ${primaryLabel.toLowerCase()} — ${primaryValue}. ${selected.change ? `Зафиксировано изменение ${selected.change.value}.` : "Сравните значение с рейтингом и текущим фильтром."}`
      : summary.insight);
    const metrics = selected?.metrics || [
      { label: "Изменение", value: changeText, className: changeClass },
      { label: "Место ведущего класса", value: summary.rank },
      { label: "Ведущий класс", value: summary.leader, title: summary.leader },
      { label: "Медианный возраст", value: summary.median }
    ];
    inspectorTitle.textContent = summary.viewTitle;
    inspectorContent.innerHTML = `
      <section class="hybrid-inspector__section">
        <span class="hybrid-inspector__kicker">${selected ? "Выбранный объект" : "Текущий срез"}</span>
        <div class="hybrid-inspector__selection"><div><h4>${escapeHtml(selectionTitle)}</h4><p>${escapeHtml(selectionSubtitle)}</p></div></div>
        <div class="hybrid-inspector__primary"><strong>${escapeHtml(primaryValue)}</strong><span>${escapeHtml(primaryLabel)}</span></div>
      </section>
      <div class="hybrid-inspector__metrics">${metrics.map((item) => `<div class="hybrid-inspector__metric"><span>${escapeHtml(item.label)}</span><b class="${escapeHtml(item.className || "")}"${item.title ? ` title="${escapeHtml(item.title)}"` : ""}>${escapeHtml(item.value)}</b></div>`).join("")}</div>
      <section class="hybrid-inspector__section"><span class="hybrid-inspector__kicker">Автоматический вывод</span><p class="hybrid-inspector__insight">${escapeHtml(selectedInsight)}</p></section>
      ${details.length ? `<section class="hybrid-inspector__section"><span class="hybrid-inspector__kicker">Детали выбранного элемента</span><dl class="hybrid-inspector__details">${details.map((item) => `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`).join("")}</dl></section>` : ""}
      ${selected?.action ? `<button type="button" class="hybrid-inspector__action" data-inspector-action="${escapeHtml(selected.action.id)}" data-cause="${escapeHtml(selected.action.cause || "")}" data-level="${escapeHtml(selected.action.level || "")}">${escapeHtml(selected.action.label || "Открыть")}</button>` : ""}`;
  };

  inspectorContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-inspector-action]");
    if (!button) return;
    window.dispatchEvent(new CustomEvent("atlas:inspector-action", { detail: {
      id: button.dataset.inspectorAction,
      cause: button.dataset.cause,
      level: button.dataset.level
    } }));
  });

  const actionIcon = (expanded = false) => expanded
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/><path d="m4 9 5-5m6 0 5 5M4 15l5 5m6 0 5-5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>';

  const fullscreenButton = (mapButton = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `hybrid-action-button ${mapButton ? "hybrid-map-fullscreen" : ""}`.trim();
    button.dataset.hybridFullscreen = "true";
    button.title = "Открыть визуализацию на весь экран";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `${actionIcon(false)}<span>На весь экран</span>`;
    button.addEventListener("click", () => toggleFullscreen());
    return button;
  };

  const actions = document.createElement("div");
  actions.className = "hybrid-chart-actions";
  const inspectorToggle = document.createElement("button");
  inspectorToggle.type = "button";
  inspectorToggle.className = "hybrid-action-button hybrid-inspector-toggle";
  inspectorToggle.textContent = "Аналитика";
  inspectorToggle.setAttribute("aria-controls", inspector.id);
  inspectorToggle.setAttribute("aria-expanded", "false");
  inspectorToggle.addEventListener("click", () => {
    const open = body.classList.toggle("hybrid-inspector-open");
    inspectorToggle.setAttribute("aria-expanded", String(open));
  });
  actions.append(inspectorToggle, fullscreenButton(false));
  chartHead.appendChild(actions);

  inspector.querySelector(".hybrid-inspector__close")?.addEventListener("click", () => {
    body.classList.remove("hybrid-inspector-open");
    inspectorToggle.setAttribute("aria-expanded", "false");
    inspectorToggle.focus({ preventScroll: true });
  });

  const fullscreenActive = () => document.fullscreenElement === card || card.classList.contains("is-fallback-fullscreen");

  const syncFullscreenButtons = () => {
    const active = fullscreenActive();
    document.querySelectorAll("[data-hybrid-fullscreen]").forEach((button) => {
      const nextState = active ? "active" : "idle";
      if (button.dataset.fullscreenState === nextState) return;
      button.dataset.fullscreenState = nextState;
      button.title = active ? "Выйти из полноэкранного режима" : "Открыть визуализацию на весь экран";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(active));
      button.innerHTML = `${actionIcon(active)}<span>${active ? "Свернуть" : "На весь экран"}</span>`;
    });
  };

  async function toggleFullscreen() {
    if (fullscreenActive()) {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      card.classList.remove("is-fallback-fullscreen");
      fullscreenFallback = false;
      syncFullscreenButtons();
      window.dispatchEvent(new Event("resize"));
      return;
    }
    try {
      if (!card.requestFullscreen) throw new Error("Fullscreen API unavailable");
      await card.requestFullscreen();
    } catch {
      fullscreenFallback = true;
      card.classList.add("is-fallback-fullscreen");
    }
    syncFullscreenButtons();
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 40);
  }

  const ensureMapFullscreen = () => {
    [viz.querySelector(".mortality-map-toolbar"), viz.querySelector(".infra-map-toolbar")].forEach((toolbar) => {
      if (!toolbar || toolbar.querySelector("[data-hybrid-fullscreen]")) return;
      toolbar.appendChild(fullscreenButton(true));
    });
    syncFullscreenButtons();
  };

  const syncWorkspace = (animate = false) => {
    const mode = MAP_VIEWS.has(state.view) ? "map" : "analytics";
    body.dataset.workspaceMode = mode;
    body.classList.toggle("hybrid-map-workspace", mode === "map");
    body.classList.toggle("hybrid-analytics-workspace", mode === "analytics");
    if (OWN_INSPECTOR_VIEWS.has(state.view)) body.classList.remove("hybrid-inspector-open");
    inspector.setAttribute("aria-hidden", String(OWN_INSPECTOR_VIEWS.has(state.view)));
    if (animate && document.documentElement.dataset.motionMode !== "off") {
      body.classList.remove("hybrid-view-enter");
      requestAnimationFrame(() => {
        body.classList.add("hybrid-view-enter");
        window.setTimeout(() => body.classList.remove("hybrid-view-enter"), 230);
      });
    }
    ensureMapFullscreen();
    renderInspector();
  };

  viz.addEventListener("click", (event) => {
    if (OWN_INSPECTOR_VIEWS.has(state.view)) return;
    const target = event.target instanceof Element
      ? event.target.closest(".heat-cell, .rank-item, svg circle, svg line, svg rect, svg path, .tile")
      : null;
    if (!target) return;
    if (target.closest('[data-inspector-managed="true"]')) return;
    const parsed = parseTooltip();
    if (!parsed) return;
    selectedContext = parsed;
    renderInspector();
    if (window.innerWidth <= 1180) {
      body.classList.add("hybrid-inspector-open");
      inspectorToggle.setAttribute("aria-expanded", "true");
    }
  });

  window.addEventListener("atlas:inspector-context", (event) => {
    if (!new Set(["arrow", "pyramid", "plot"]).has(state.view)) return;
    selectedContext = event.detail || null;
    renderInspector();
    if (event.detail && window.innerWidth > 1023 && window.innerWidth <= 1180) {
      body.classList.add("hybrid-inspector-open");
      inspectorToggle.setAttribute("aria-expanded", "true");
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && fullscreenFallback) card.classList.add("is-fallback-fullscreen");
    syncFullscreenButtons();
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 40);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (card.classList.contains("is-fallback-fullscreen")) {
      card.classList.remove("is-fallback-fullscreen");
      fullscreenFallback = false;
      syncFullscreenButtons();
      window.dispatchEvent(new Event("resize"));
    } else if (body.classList.contains("hybrid-inspector-open")) {
      body.classList.remove("hybrid-inspector-open");
      inspectorToggle.setAttribute("aria-expanded", "false");
    }
  });

  const baseRender = render;
  render = () => {
    const previousView = renderedView;
    baseRender();
    const changedView = previousView !== state.view;
    if (changedView) selectedContext = null;
    renderedView = state.view;
    syncWorkspace(changedView);
    requestAnimationFrame(() => {
      ensureMapFullscreen();
      renderInspector();
    });
  };

  new MutationObserver(() => ensureMapFullscreen()).observe(viz, { childList: true, subtree: true });

  // The URL owns the saved slice. A bare URL starts with the release defaults,
  // rather than silently restoring an old session's period or comparison mode.
  syncWorkspace(false);

  window.AtlasHybridUI = {
    version: "2026.08.10",
    refresh: () => syncWorkspace(false),
    fullscreen: toggleFullscreen,
    debug: () => ({
      view: state.view,
      mode: body.dataset.workspaceMode,
      inspectorVisible: !OWN_INSPECTOR_VIEWS.has(state.view),
      fullscreen: fullscreenActive()
    })
  };
})();
