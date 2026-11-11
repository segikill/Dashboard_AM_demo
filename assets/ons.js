(() => {
  "use strict";

  const data = window.atlasOnsData;
  const get = id => document.getElementById(id);
  const chart = get("onsChart");
  const controls = get("onsFilters");
  const dialog = get("onsDetailsDialog");
  const mobile = matchMedia("(max-width: 1023px)");
  const integer = new Intl.NumberFormat("ru-RU");
  const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  const num = value => value == null ? "Нет данных" : integer.format(value);
  const percent = value => value == null ? "Нет данных" : decimal.format(value) + " %";
  const colours = ["#236084", "#79528d", "#9d4d40", "#327566", "#835d23", "#425eb3", "#286d72", "#924f69", "#55677f", "#584871"];
  const regions = data.regions.slice(1);
  const regionById = new Map(data.regions.map(region => [region.id, region.name]));
  const byCause = new Map(data.causes.map(cause => [cause.id, cause]));
  const children = id => data.causes.filter(cause => cause.parent === id);
  const classes = children("0");
  const blocks = classes.flatMap(cause => children(cause.id));
  const codes = blocks.flatMap(cause => children(cause.id));
  const yearOptions = data.years.map(year => [String(year), String(year)]);
  const years = [["all", "2023–2025 (всего)"], ...yearOptions];
  const sexes = [["0", "Оба пола"], ["1", "Мужчины"], ["2", "Женщины"]];
  const sexLabels = new Map(sexes);
  const ageOptions = data.ages.map((age, i) => [String(i), age]);
  const regionOptions = [...regionById];
  const levels = [["class", "Классы"], ["block", "Блоки"], ["code", "Коды"]];
  const measures = [["count", "Число смертей"], ["share", "Доля всех смертей"]];
  const rateOption = ["rate", "На 100 000, с поправкой на возраст"];
  const renderValue = { count: num, share: percent, rate: value => value == null ? "Нет данных" : decimal.format(value) };
  const ageNotice = "ONS публикует данные о смертях в первые 28 дней жизни без разбивки по причинам.";
  const treeDefaults = { scope: "0", measure: "count", colour: "count", sort: "value", labels: true, threshold: "0" };
  const local = {
    treemap: { ...treeDefaults },
    heatmap: { measure: "share", level: "class", parent: "0" },
    arrow: { mode: "compare", compare: "time", measure: "count", level: "class", parent: "0", top: "10", changed: false },
    pyramid: { mode: "profile", measure: "count", cause: "0", level: "class", parent: "0", step: "native", labels: "all" },
    plot: { mode: "profile", compare: "time", level: "class", parent: "0", cause: "0", min: "5", top: "15", sort: "count", interval: "p10p90", first: "2023", last: "2025" },
    dotogram: { measure: "rate", other: regions.at(-1).id, cause: "0", level: "class", parent: "0" }
  };
  const filters = { year: "2025", region: data.regions[0].id, sex: "0", age: "0" };
  const selections = new Map();
  const items = new Map();
  let view = "treemap";

  const causeLabel = cause => [cause.code, cause.name].filter(Boolean).join(" · ");
  const causeOptions = causes => causes.map(cause => [cause.id, causeLabel(cause)]);
  const sum = values => values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null;
  const ratio = (n, d) => n == null || !(d > 0) ? null : 100 * n / d;
  const signed = (value, format) => value == null ? "Нет данных" : (value > 0 ? "+" : "") + format(value);
  const pick = (changes = {}) => ({ ...filters, ...changes });
  const comparisonSlice = () => local.dotogram.measure === "rate" ?
    pick({ year: filters.year === "all" ? "2025" : filters.year, age: "0" }) : pick();
  const rowKey = (year, region, cause, sex) => [year, region, cause, sex].join("|");
  const count = (slice, cause, age = Number(slice.age)) => {
    const periods = slice.year === "all" ? data.years : [slice.year];
    return sum(periods.map(year => data.counts[rowKey(year, slice.region, cause, slice.sex)]?.[age] ?? null));
  };
  const value = (slice, cause, metric) => {
    if (metric === "rate") return data.rates[rowKey(slice.year, slice.region, cause, slice.sex)] ?? null;
    const n = count(slice, cause);
    return metric === "share" ? ratio(n, count(slice, "0")) : n;
  };
  const periodLabel = year => year === "all" ? "2023–2025 (всего)" : year;
  const summary = (slice, { region = true, year = true, sex = true, age = true } = {}) =>
    [year && periodLabel(slice.year), region && regionById.get(slice.region), sex && sexLabels.get(slice.sex), age && data.ages[slice.age]].filter(Boolean).join(" · ");
  const levelCauses = settings => {
    if (settings.level === "class") return classes;
    const candidates = settings.level === "block" ? blocks : codes;
    const parent = cause => settings.level === "code" ? byCause.get(cause.parent).parent : cause.parent;
    return settings.parent === "0" ? candidates : candidates.filter(cause => parent(cause) === settings.parent);
  };

  function node(tag, content, className) {
    const result = document.createElement(tag);
    if (content != null) result.textContent = content;
    if (className) result.className = className;
    return result;
  }

  function button(label, action, className) {
    const result = node("button", label, className);
    result.type = "button";
    result.addEventListener("click", action);
    return result;
  }

  function field(key, label, options, current) {
    const wrapper = node("label", label);
    const select = node("select");
    select.id = "ons-" + key;
    select.dataset.field = key;
    for (const [value, name] of options) select.add(new Option(name, value));
    select.value = current;
    wrapper.append(select);
    return wrapper;
  }

  function checkbox(key, label, checked) {
    const input = node("input");
    input.type = "checkbox";
    input.dataset.field = key;
    input.checked = checked;
    const wrapper = node("label", null, "ons-check");
    wrapper.append(input, label);
    return wrapper;
  }

  function renderControls(focusField) {
    const s = local[view];
    const rank = view === "arrow";
    const pyramid = view === "pyramid";
    const profile = view === "plot";
    const comparison = view === "dotogram";
    const sexCompare = (rank || profile) && s.mode === "compare" && s.compare === "sex";
    const yearsCompare = rank && !sexCompare || pyramid && s.mode === "trend" ||
      profile && s.mode === "compare" && !sexCompare;
    const ageAvailable = !pyramid && !profile && !(comparison && s.measure === "rate");
    const options = [];
    if (!yearsCompare) options.push(field("year", "Период регистрации", comparison && s.measure === "rate" ? yearOptions : years,
      comparison ? comparisonSlice().year : filters.year));
    if (view !== "heatmap") options.push(field("region", comparison ? "Опорная территория" : "Территория", regionOptions, filters.region));
    if (!pyramid && !sexCompare) options.push(field("sex", "Пол", sexes, filters.sex));
    if (ageAvailable) options.push(field("age", "Возраст", ageOptions, filters.age));
    if (options.length) options.push(button("Сбросить общие фильтры", () => {
      Object.assign(filters, { year: "2025", region: data.regions[0].id, sex: "0", age: "0" });
      renderControls();
      render();
      controls.querySelector(".ons-filter-reset").focus();
    }, "ons-filter-reset"));
    options.push(node("h3", "Настройки визуализации", "ons-settings-title"));

    const add = (key, label, choices) => options.push(field(key, label, choices, s[key]));
    if (view === "treemap") {
      add("measure", "Размер плитки", measures);
      add("colour", "Цвет плитки", [["count", "Объём наблюдений"], ["change", "Изменение числа смертей"], ["age", "Медианная группа"]]);
      add("sort", "Порядок категорий", [["value", "По убыванию значения"], ["name", "По коду"], ["change", "По изменению"]]);
      add("threshold", "Объединить категории с долей меньше", [["0", "Не объединять"], ["0.5", "0,5 %"], ["1", "1 %"], ["2", "2 %"], ["3", "3 %"]]);
      options.push(checkbox("labels", "Показывать значения на плитках", s.labels));
      options.push(button("Сбросить настройки структуры", () => {
        Object.assign(s, treeDefaults);
        selections.delete(view);
        renderControls();
        render();
        controls.querySelector(".ons-tree-reset").focus();
      }, "ons-tree-reset"));
    } else {
      if (rank) add("mode", "Форма сравнения", [["compare", "Два среза"], ["trend", "По годам"]]);
      if (pyramid) add("mode", "Режим анализа", [["profile", "Пирамида"], ["trend", "Динамика 2023 → 2025"]]);
      if (profile) add("mode", "Режим анализа", [["profile", "Профиль"], ["compare", "Сравнение"], ["distribution", "Одна причина"]]);
      if ((rank || profile) && s.mode === "compare") {
        add("compare", "Сравниваемые срезы", [["time", rank ? "2023 → 2025" : "Два года"], ["sex", "Мужчины → женщины"]]);
        if (profile && s.compare === "time") {
          add("first", "Первый год", yearOptions);
          add("last", "Второй год", yearOptions);
        }
      }
      add("level", "Уровень причин МКБ‑10", levels);
      if (s.level !== "class") {
        const available = s.level === "block" ? blocks : codes;
        const parents = new Set(available.map(cause => s.level === "code" ? byCause.get(cause.parent).parent : cause.parent));
        add("parent", "Класс для детализации", [["0", "Все доступные классы"], ...causeOptions(classes.filter(cause => parents.has(cause.id)))]);
      }
      if (pyramid || comparison || profile && s.mode === "distribution") {
        const totalOption = s.parent === "0" ? ["0", "Все причины"] : [s.parent, causeLabel(byCause.get(s.parent))];
        add("cause", "Причина смерти", [totalOption, ...causeOptions(levelCauses(s))]);
      }
      if (!profile) {
        const choices = pyramid ? [["count", "Число смертей"], ["share", "Доля внутри каждого пола"]] :
          comparison ? [...measures, rateOption] : measures;
        add("measure", view === "heatmap" ? "Показатель в ячейке" : "Показатель", choices);
      }
      if (rank) {
        add("top", "Число позиций", [["5", "Топ-5"], ["10", "Топ-10"]]);
        options.push(checkbox("changed", "Только изменившие позицию", s.changed));
      }
      if (pyramid) {
        add("step", "Возрастные группы", [["native", "Группы ONS"], ["decade", "По 10 лет"]]);
        add("labels", "Подписи значений", [["all", "Показывать"], ["off", "Скрыть"]]);
      }
      if (profile) {
        add("min", "Минимум наблюдений", [["5", "5"], ["10", "10"], ["20", "20"], ["50", "50"]]);
        if (s.mode !== "distribution") {
          add("top", "Число строк", [["5", "Топ-5"], ["10", "Топ-10"], ["15", "Топ-15"]]);
          add("sort", "Порядок строк", [["count", "По числу наблюдений"], ["median", "По медианной группе"], ["spread", "По ширине Q1–Q3"]]);
          add("interval", "Внешний интервал", [["p10p90", "P10–P90"], ["range", "Все наблюдаемые группы"]]);
        }
      }
      if (comparison) add("other", "Территория сравнения", regionOptions.filter(([id]) => id !== filters.region));
    }
    controls.replaceChildren(...options);
    if (focusField) controls.querySelector('[data-field="' + focusField + '"]')?.focus({ preventScroll: true });
  }

  function normalize() {
    const s = local[view];
    if (view === "dotogram") {
      if (s.other === filters.region) s.other = regions.find(region => region.id !== filters.region).id;
    }
    if (s.cause != null && s.cause !== s.parent && !levelCauses(s).some(cause => cause.id === s.cause)) s.cause = s.parent;
  }

  controls.addEventListener("change", event => {
    const input = event.target;
    const key = input.dataset.field;
    if (!key) return;
    const s = local[view];
    const previous = Object.hasOwn(filters, key) ? filters[key] : s[key];
    const target = Object.hasOwn(filters, key) ? filters : s;
    target[key] = input.type === "checkbox" ? input.checked : input.value;
    if (key === "level") s.parent = "0";
    if (key === "level" || key === "parent") {
      if (s.cause != null) s.cause = s.parent;
    }
    if (key === "first" && s.first === s.last) s.last = previous;
    if (key === "last" && s.first === s.last) s.first = previous;
    if (key === "step") selections.delete(view);
    if (key === "mode" && view === "plot" && (s.mode === "distribution" || previous === "distribution")) selections.delete(view);
    normalize();
    renderControls(key);
    render();
  });

  function table(label, headings, rows, className = "") {
    const frame = node("div", null, "ons-table-frame");
    frame.tabIndex = 0;
    frame.setAttribute("role", "region");
    frame.setAttribute("aria-label", label);
    const grid = node("table", null, "ons-table " + className);
    const head = grid.createTHead().insertRow();
    for (const title of headings) {
      const th = node("th", title);
      th.scope = "col";
      head.append(th);
    }
    const body = grid.createTBody();
    for (const [name, ...values] of rows) {
      const row = body.insertRow();
      const th = node("th");
      th.scope = "row";
      th.append(name);
      row.append(th);
      for (const cell of values) row.insertCell().append(cell);
    }
    frame.append(grid);
    return frame;
  }

  const note = text => node("p", text, "ons-note");
  const touch = () => window.AtlasInteraction.touchLayout();
  const closeDetails = () => { if (dialog.open) dialog.close(); };
  const openDetails = () => { if (!dialog.open) dialog.showModal(); };
  get("onsOpenDetails").addEventListener("click", openDetails);
  mobile.addEventListener("change", event => { if (!event.matches) closeDetails(); });

  function detailContent(target, item) {
    const header = node("h3", target.id === "onsInspector" ? "Аналитический контекст" : null);
    const selection = node("h4", item?.title ?? "Выберите элемент");
    const detail = node("div", null, "ons-detail");
    if (header.textContent) detail.append(header);
    detail.append(selection);
    if (item) {
      if (item.context) detail.append(note(item.context));
      const list = node("dl");
      for (const [label, text] of item.fields) list.append(node("dt", label), node("dd", text));
      detail.append(list);
      if (item.note) detail.append(note(item.note));
      if (item.next) detail.append(button("Открыть следующий уровень", () => drill(item.next), "ons-action"));
      if (item.related?.length) {
        detail.append(node("h5", "Лидеры по этой причине"));
        const ordered = node("ol");
        for (const label of item.related) ordered.append(node("li", label));
        detail.append(ordered);
      }
    }
    target.replaceChildren(detail);
  }

  function updateSelection() {
    const selected = selections.get(view);
    for (const control of chart.querySelectorAll("[data-pick]")) {
      control.setAttribute("aria-pressed", String(control.dataset.pick === selected));
    }
    const item = items.get(selected);
    detailContent(get("onsInspector"), item);
    detailContent(get("onsDetailsBody"), item);
  }

  function select(key, show = touch()) {
    selections.set(view, key);
    updateSelection();
    if (show) openDetails();
  }

  function register(key, details) {
    items.set(key, details);
  }

  function pickButton(key, label, className, action = () => select(key)) {
    const control = button(label, action, className);
    control.dataset.pick = key;
    return control;
  }

  function drill(id) {
    const s = local.treemap;
    closeDetails();
    s.scope = id;
    selections.delete("treemap");
    render();
    chart.querySelector(".ons-tree-heading h3")?.focus({ preventScroll: true });
  }

  function partition(entries, x, y, width, height, output) {
    if (entries.length === 1) {
      output.push({ item: entries[0], x, y, width, height });
      return;
    }
    const total = entries.reduce((result, item) => result + item.weight, 0);
    let subtotal = 0;
    let split = 1;
    let distance = Infinity;
    let weight = 0;
    for (let i = 1; i < entries.length; i++) {
      subtotal += entries[i - 1].weight;
      const difference = Math.abs(total / 2 - subtotal);
      if (difference < distance) {
        split = i;
        distance = difference;
        weight = subtotal / total;
      }
    }
    const left = entries.slice(0, split);
    const right = entries.slice(split);
    if (width >= height) {
      const first = width * weight;
      partition(left, x, y, first, height, output);
      partition(right, x + first, y, width - first, height, output);
    } else {
      const first = height * weight;
      partition(left, x, y, width, first, output);
      partition(right, x, y + first, width, height - first, output);
    }
  }

  function bindTreemapTile(tile, item) {
    let press;
    let lastClick = -Infinity;
    const cancel = () => { if (press) clearTimeout(press.timer); };
    tile.addEventListener("pointerdown", event => {
      cancel();
      press = null;
      if (!event.isPrimary || !["touch", "pen"].includes(event.pointerType)) return;
      press = { x: event.clientX, y: event.clientY, consumed: false, timer: setTimeout(() => {
        if (!tile.isConnected || view !== "treemap") return;
        press.consumed = true;
        select(item.id, true);
      }, 500) };
    });
    tile.addEventListener("pointermove", event => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
        cancel();
        press.consumed = true;
      }
    });
    for (const name of ["pointerup", "pointerleave", "pointercancel"]) tile.addEventListener(name, cancel);
    tile.addEventListener("contextmenu", event => { if (press) event.preventDefault(); });
    tile.addEventListener("click", event => {
      if (press?.consumed && event.detail) return;
      const now = performance.now();
      if (item.next && event.detail && (touch() || now - lastClick <= 950 && selections.get(view) === item.id)) {
        drill(item.next);
      } else {
        select(item.id);
        lastClick = now;
      }
    });
  }

  function treemap() {
    const s = local.treemap;
    const slice = pick();
    const scope = byCause.get(s.scope);
    const total = count(slice, scope.id);
    const descendants = children(scope.id);
    const ancestry = [];
    for (let cause = scope; cause; cause = byCause.get(cause.parent)) ancestry.unshift(cause);
    const heading = node("div", null, "ons-tree-heading");
    const path = node("nav");
    path.setAttribute("aria-label", "Путь по иерархии МКБ‑10");
    for (const cause of ancestry) {
      if (cause === scope) path.append(node("span", cause.code || "Все причины"));
      else path.append(button(cause.code || "Все причины", () => drill(cause.id)));
    }
    const title = node("h3", causeLabel(scope) + " · " + num(total));
    title.tabIndex = -1;
    heading.append(path, title);
    chart.append(heading, note(touch() ? "Коснитесь плитки, чтобы открыть группу. Удерживайте плитку для сведений." :
      "Первый клик показывает сведения. Повторный клик открывает следующий уровень."));
    const entries = descendants.map((cause, index) => {
      const n = count(slice, cause.id);
      const previous = count(pick({ year: "2023" }), cause.id);
      const latest = count(pick({ year: "2025" }), cause.id);
      return {
        ...cause, n, share: ratio(n, total), change: previous == null || latest == null ? null : latest - previous,
        median: filters.age === "0" ? ageStats(slice, cause.id)?.median : null,
        colour: colours[index % colours.length], next: children(cause.id).length ? cause.id : null
      };
    });
    const listed = sum(entries.map(item => item.n));
    if (descendants.length && total != null && listed != null && total > listed) {
      entries.push({ id: "remainder", name: "Остальные причины в группе", n: total - listed,
        share: ratio(total - listed, total), colour: "#586b79" });
    }
    const grouped = entries.filter(item => item.share > 0 && item.share < Number(s.threshold));
    let visible = entries.filter(item => !grouped.includes(item));
    if (grouped.length) {
      const n = sum(grouped.map(item => item.n));
      visible.push({ id: "other", name: "Прочие", n, share: ratio(n, total), colour: "#586b79", grouped });
    }
    const sorting = {
      value: (a, b) => (b.n ?? -1) - (a.n ?? -1),
      name: (a, b) => (a.code || "~").localeCompare(b.code || "~", "ru", { numeric: true }),
      change: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity)
    };
    visible.sort(sorting[s.sort]);
    const max = Math.max(1, ...visible.map(item => item.n ?? 0));
    for (const item of visible) {
      item.weight = s.measure === "share" ? item.share : item.n;
      if (s.colour === "change") item.colour = item.change == null ? "#586b79" : item.change > 0 ? "#994b40" : item.change < 0 ? "#28678d" : "#586b79";
      if (s.colour === "age") item.colour = item.median == null ? "#586b79" : "hsl(" + (205 + 60 * item.median / (data.ages.length - 1)) + " 38% 37%)";
      if (s.colour === "count") item.colour = "color-mix(in srgb, " + item.colour + " " + (72 + 28 * (item.n ?? 0) / max) + "%, #405462)";
      const fields = [["Смертей", num(item.n)], ["Доля в группе", percent(item.share)], ["Изменение 2023 → 2025", signed(item.change, num)]];
      if (filters.age === "0") fields.push(["Медианная группа", data.ages[item.median] ?? "Нет данных"]);
      if (item.grouped) for (const cause of item.grouped) fields.push([causeLabel(cause), num(cause.n)]);
      if (byCause.has(item.id)) for (const year of data.years) fields.push([String(year), num(count(pick({ year }), item.id))]);
      register(item.id, { title: causeLabel(item), context: summary(slice), fields, next: item.next });
    }
    if (s.colour === "change") chart.append(note("Терракотовый цвет — рост, синий — снижение числа смертей между 2023 и 2025 годами."));
    if (s.colour === "age") chart.append(note(filters.age === "0" ?
      "Цвет меняется от синего к фиолетовому по мере увеличения медианной возрастной группы." : "Медианная группа доступна при выборе всех возрастов."));
    const plotted = visible.filter(item => item.weight > 0);
    if (plotted.length) {
      const canvas = node("div", null, "ons-treemap");
      const width = Math.max(280, chart.clientWidth - 28);
      const height = Math.min(420, Math.max(280, width * .6));
      const boxes = [];
      partition(plotted, 0, 0, width, height, boxes);
      for (const { item, x, y, width: w, height: h } of boxes) {
        const tile = node("button", null, "ons-tree-tile");
        tile.type = "button";
        tile.dataset.pick = item.id;
        const displayed = renderValue[s.measure](item.weight);
        tile.setAttribute("aria-label", causeLabel(item) + " · " + displayed);
        tile.style.cssText = "left:" + 100*x/width + "%;top:" + 100*y/height + "%;width:" + 100*w/width + "%;height:" + 100*h/height + "%;background:" + item.colour;
        tile.append(node("span", causeLabel(item)));
        if (s.labels) tile.append(node("strong", displayed));
        bindTreemapTile(tile, item);
        canvas.append(tile);
      }
      chart.append(canvas);
    }
    if (visible.length) chart.append(table("Причины внутри группы", ["Причина смерти", "Смертей", "Доля"], visible.map(item => [
      pickButton(item.id, causeLabel(item), "ons-row-button"), num(item.n), percent(item.share)
    ])));
    else {
      register(scope.id, { title: causeLabel(scope), context: summary(slice), fields: data.years.map(year => [String(year), num(count(pick({ year }), scope.id))]) });
      chart.append(button("Сведения о причине", () => select(scope.id, true), "ons-action"));
    }
  }

  function matrix() {
    const s = local.heatmap;
    const causes = levelCauses(s);
    const raw = regions.map(region => causes.map(cause => value(pick({ region: region.id }), cause.id, s.measure)));
    const max = Math.max(1, ...raw.flat().filter(Number.isFinite));
    const format = renderValue[s.measure];
    const rows = raw.map((values, row) => [regions[row].name, ...values.map((amount, column) => {
      const region = regions[row], cause = causes[column], slice = pick({ region: region.id });
      const key = region.id + ":" + cause.id;
      const across = regions.map((item, i) => ({ ...item, value: raw[i][column] })).filter(item => item.value != null)
        .sort((a, b) => b.value - a.value);
      const rank = amount == null ? null : 1 + across.filter(item => item.value > amount).length;
      const causeRank = amount == null ? null : 1 + values.filter(value => value != null && value > amount).length;
      register(key, { title: region.name + " · " + cause.code, context: causeLabel(cause) + " · " + summary(slice, { region: false }),
        fields: [["Значение", format(amount)], ["Смертей по причине", num(count(slice, cause.id))],
          ["Всего смертей", num(count(slice, "0"))], ["Место территории", rank == null ? "Нет данных" : rank + " из " + across.length],
          ["Место среди причин матрицы", causeRank == null ? "Нет данных" : causeRank + " из " + values.filter(Number.isFinite).length]],
        related: across.slice(0, 4).map(item => item.name + " · " + format(item.value)) });
      const cell = pickButton(key, format(amount), "ons-heat-cell");
      cell.setAttribute("aria-label", region.name + " · " + causeLabel(cause) + " · " + format(amount));
      const intensity = amount == null ? 0 : amount / max;
      cell.style.background = "rgba(28, 93, 128, " + intensity * .9 + ")";
      if (intensity > .75) cell.style.color = "#fff";
      return cell;
    })]);
    const legend = node("details", null, "ons-cause-key");
    legend.append(node("summary", "Названия причин"));
    const list = node("ul");
    causes.forEach(cause => list.append(node("li", causeLabel(cause))));
    legend.append(list);
    const matrixTable = table("Территории и причины смерти", ["Территория", ...causes.map(cause => cause.code)], rows, "ons-matrix");
    matrixTable.style.setProperty("--matrix-columns", causes.length);
    chart.append(note(s.measure === "share" ? "Доля причины среди всех зарегистрированных смертей на территории." :
      "Цвет показывает число зарегистрированных смертей по общей шкале."), matrixTable, legend);
  }

  function svg(tag, attributes) {
    const result = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    return result;
  }

  function slices(settings, rank = false) {
    if (settings.mode === "trend") return (rank ? data.years : [2023, 2025]).map(year => [String(year), pick({ year })]);
    if (settings.compare === "sex") return sexes.slice(1).map(([sex, label]) => [label, pick({ sex })]);
    return (rank ? ["2023", "2025"] : [settings.first, settings.last]).map(year => [year, pick({ year })]);
  }

  function ranks() {
    const s = local.arrow;
    const causes = levelCauses(s);
    const groups = slices(s, true);
    const ranked = groups.map(([, slice]) => {
      const values = causes.map(cause => ({ id: cause.id, amount: value(slice, cause.id, s.measure) }))
        .filter(item => item.amount != null).sort((a, b) => b.amount - a.amount);
      let rank = 0;
      return new Map(values.map((item, i) => {
        if (!i || item.amount !== values[i - 1].amount) rank = i + 1;
        return [item.id, { ...item, rank }];
      }));
    });
    const rows = causes.map((cause, index) => ({ cause, series: ranked.map(group => group.get(cause.id)), colour: colours[index % colours.length] }))
      .filter(item => item.series.some(point => point?.rank <= Number(s.top)) &&
        (!s.changed || new Set(item.series.filter(Boolean).map(point => point.rank)).size > 1))
      .sort((a, b) => (a.series.at(-1)?.rank ?? Infinity) - (b.series.at(-1)?.rank ?? Infinity));
    if (!rows.length) { chart.append(note("Нет причин, подходящих под выбранные настройки рангов.")); return; }
    const plot = svg("svg", { viewBox: "0 0 440 290", class: "ons-rank", "aria-label": "Изменение рангов причин" });
    const xs = groups.length === 3 ? [74, 220, 366] : [96, 344];
    const maxRank = Math.max(2, ...rows.flatMap(row => row.series.map(point => point?.rank ?? 1)));
    const y = rank => 35 + 232 * (rank - 1) / (maxRank - 1);
    for (let rank = 1; rank <= maxRank; rank++) {
      plot.append(svg("line", { x1: 38, y1: y(rank), x2: 402, y2: y(rank), stroke: "#dbe4eb" }));
      const label = svg("text", { x: 26, y: y(rank) + 4, "text-anchor": "end" });
      label.textContent = rank;
      plot.append(label);
    }
    for (const [i, [label]] of groups.entries()) {
      const title = svg("text", { x: xs[i], y: 16, "text-anchor": "middle" });
      title.textContent = label;
      plot.append(title);
    }
    const format = renderValue[s.measure];
    const body = rows.map(({ cause, series, colour }) => {
      const entries = series.map(item => item ? item.rank + " место · " + format(item.amount) : "Нет данных");
      const delta = series[0] && series.at(-1) ? series[0].rank - series.at(-1).rank : null;
      const first = series[0]?.amount;
      const last = series.at(-1)?.amount;
      const difference = first == null || last == null ? null : last - first;
      const deltaFormat = s.measure === "share" ? n => decimal.format(n) + " п.п." : num;
      const sexCompare = s.mode === "compare" && s.compare === "sex";
      register(cause.id, { title: causeLabel(cause), context: summary(filters, { year: sexCompare, sex: !sexCompare }),
        fields: [...groups.map(([label], i) => [label, entries[i]]), ["Изменение позиции", signed(delta, num)],
          ["Изменение показателя", signed(difference, deltaFormat)]] });
      const line = svg("g", { "data-pick": cause.id, class: "ons-rank-series", role: "button", tabindex: "0", "aria-label": causeLabel(cause) });
      line.addEventListener("click", () => select(cause.id));
      line.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(cause.id); }
      });
      series.forEach((point, i) => {
        if (!point) return;
        const prev = series[i - 1];
        if (prev) {
          const coords = { x1: xs[i - 1], y1: y(prev.rank), x2: xs[i], y2: y(point.rank) };
          line.append(svg("line", { ...coords, stroke: colour, "stroke-width": 2 }));
          line.append(svg("line", { ...coords, stroke: "transparent", "stroke-width": 14 }));
        }
        line.append(svg("circle", { cx: xs[i], cy: y(point.rank), r: 5, fill: colour }));
      });
      plot.append(line);
      const label = pickButton(cause.id, causeLabel(cause), "ons-row-button ons-rank-label");
      label.style.borderColor = colour;
      return [label, ...entries];
    });
    chart.append(note("Ранг рассчитывается среди причин выбранного уровня до отбора топа. При равных значениях ранг совпадает."),
      plot, table("Ранги причин", ["Причина", ...groups.map(([name]) => name)], body, "ons-rank-table"));
  }

  function bar(amount, scale, side, label) {
    const item = node("span", null, "ons-bar " + side);
    if (amount != null) {
      const fill = node("span", null, "ons-bar-fill");
      fill.style.width = 100 * Math.abs(amount) / scale + "%";
      fill.setAttribute("aria-hidden", "true");
      item.append(fill);
    }
    if (label) item.append(node("strong", label));
    return item;
  }

  function pyramidAges(step) {
    if (step === "native") return ageOptions.slice(1).map(([key, label]) => ({ key, label, ages: [Number(key)] }));
    const decades = Array.from({ length: 9 }, (_, decade) => {
      const first = 2 * decade + 2;
      return { key: "decade-" + decade, label: 10 * decade + "–" + (10 * decade + 9), ages: [first, first + 1] };
    });
    decades[0].ages.unshift(1);
    const [key, label] = ageOptions.at(-1);
    return [...decades, { key, label, ages: [Number(key)] }];
  }

  function pyramid() {
    const s = local.pyramid;
    const trend = s.mode === "trend";
    const groups = sexes.slice(1).map(([sex, label]) => {
      const first = pick({ year: trend ? "2023" : filters.year, sex });
      const last = pick({ year: "2025", sex });
      return { first, last, label, side: sex === "1" ? "ons-bar-men" : "ons-bar-women" };
    });
    const ages = pyramidAges(s.step).reverse();
    const format = renderValue[s.measure];
    const deathsInGroup = (slice, group) => sum(group.ages.map(age => count(slice, s.cause, age)));
    const forAge = (slice, group) => {
      const amount = deathsInGroup(slice, group);
      return s.measure === "count" ? amount : ratio(amount, count(slice, s.cause, 0));
    };
    const values = ages.map(group => groups.map(({ first, last }) => {
      const a = forAge(first, group);
      const b = trend ? forAge(last, group) : null;
      return { a, b, amount: trend ? a == null || b == null ? null : b - a : a };
    }));
    const max = Math.max(1, ...values.flat().map(item => Math.abs(item.amount ?? 0)));
    const formatChange = amount => signed(amount, s.measure === "share" ? n => decimal.format(n) + " п.п." : num);
    const rows = ages.map((group, row) => {
      const { key, label } = group;
      const fields = groups.flatMap(({ label }, i) => {
        const { a, b, amount } = values[row][i];
        return trend ? [[label + " · 2023", format(a)], [label + " · 2025", format(b)], [label + " · изменение", formatChange(amount)]] :
          [[label, format(a)], ...(s.measure === "share" ? [[label + " · смертей", num(deathsInGroup(groups[i].first, group))]] : [])];
      });
      const context = [causeLabel(byCause.get(s.cause)), regionById.get(filters.region), trend ? "2023 → 2025" : periodLabel(filters.year)].join(" · ");
      register(key, { title: "Возраст " + label, context, fields });
      return [pickButton(key, label, "ons-row-button"), ...groups.map((group, i) => {
        const { amount } = values[row][i];
        const formatted = trend ? formatChange(amount) : format(amount);
        const control = pickButton(key, null, "ons-bar-button");
        control.setAttribute("aria-label", label + " · " + group.label + " · " + formatted);
        control.append(bar(amount, max, group.side + (amount < 0 ? " ons-bar-negative" : ""), s.labels === "all" || amount == null ? formatted : ""));
        return control;
      })];
    });
    chart.append(note(trend ? "Изменение между 2023 и 2025 годами в каждой возрастной группе. Длина полосы показывает величину изменения." :
      "Мужчины слева, женщины справа. У обеих сторон один масштаб."), table("Возрастно-половое распределение", ["Возраст", "Мужчины", "Женщины"], rows, "ons-pyramid"));
    if (s.cause !== "0") chart.append(note(ageNotice));
  }

  function ageStats(slice, cause) {
    const buckets = ageOptions.slice(1).map(([age]) => count(slice, cause, Number(age)));
    const total = sum(buckets);
    if (!(total > 0)) return null;
    const quantile = fraction => {
      let cumulative = 0;
      return 1 + buckets.findIndex(amount => (cumulative += amount) >= fraction * total);
    };
    return { total, min: 1 + buckets.findIndex(amount => amount > 0), low: quantile(.1), q1: quantile(.25),
      median: quantile(.5), q3: quantile(.75), high: quantile(.9), max: 1 + buckets.findLastIndex(amount => amount > 0) };
  }

  function distribution(s) {
    const slice = pick({ age: "0" });
    const cause = byCause.get(s.cause);
    const ages = ageOptions.slice(1);
    const raw = ages.map(([age]) => count(slice, cause.id, Number(age)));
    const total = sum(raw);
    if (total != null && total < Number(s.min)) { chart.append(note("Для выбранной причины меньше наблюдений, чем задано в фильтре.")); return; }
    const max = Math.max(1, ...raw.filter(Number.isFinite));
    chart.append(node("h3", causeLabel(cause)), table("Распределение по возрастным группам", ["Возраст", "Смертей", "Доля"], ages.map(([age, label], i) => {
      const amount = raw[i];
      const share = ratio(amount, total);
      register(age, { title: "Возраст " + label, context: causeLabel(cause) + " · " + summary(slice, { age: false }),
        fields: [["Смертей", num(amount)], ["Доля в распределении", percent(share)]] });
      return [pickButton(age, label, "ons-row-button"), bar(amount, max, "ons-bar-age", num(amount)), percent(share)];
    }), "ons-age"));
    if (cause.id !== "0") chart.append(note(ageNotice));
  }

  function interval(stat, range) {
    const track = node("span", null, "ons-interval");
    const pos = index => 100 * (index - 1) / (data.ages.length - 2);
    for (const [start, end, cls] of [[range ? stat.min : stat.low, range ? stat.max : stat.high, "outer"],
      [stat.q1, stat.q3, "middle"], [stat.median, stat.median, "median"]]) {
      const mark = node("i", null, "ons-interval-" + cls);
      mark.style.left = pos(start) + "%";
      mark.style.width = pos(end) - pos(start) + "%";
      track.append(mark);
    }
    track.setAttribute("aria-hidden", "true");
    return track;
  }

  function ageProfile() {
    const s = local.plot;
    if (s.mode === "distribution") { distribution(s); return; }
    const range = s.interval === "range";
    const intervalLabel = range ? "Все наблюдаемые группы" : "P10–P90";
    const groups = s.mode === "compare" ? slices(s) : [["Выбранный срез", pick()]];
    const sorted = levelCauses(s).map(cause => ({ cause, series: groups.map(([, slice]) => ageStats(slice, cause.id)) }))
      .filter(row => row.series.every(item => item && item.total >= Number(s.min)));
    const order = {
      count: (a, b) => b.series[0].total - a.series[0].total,
      median: (a, b) => a.series[0].median - b.series[0].median,
      spread: (a, b) => b.series[0].q3 - b.series[0].q1 - (a.series[0].q3 - a.series[0].q1)
    };
    sorted.sort(order[s.sort]);
    const rows = sorted.slice(0, Number(s.top)).map(({ cause, series }) => {
      const comparison = s.mode === "compare";
      const context = summary(filters, { year: !comparison || s.compare === "sex", sex: !comparison || s.compare === "time", age: false });
      register(cause.id, { title: causeLabel(cause), context, fields: series.flatMap((stat, i) => {
        const prefix = series.length > 1 ? groups[i][0] + " · " : "";
        return [[prefix + "Смертей в возрастных группах", num(stat.total)], [prefix + "Медианная группа", data.ages[stat.median]],
          [prefix + "Q1–Q3", data.ages[stat.q1] + " / " + data.ages[stat.q3]],
          [prefix + intervalLabel, data.ages[range ? stat.min : stat.low] + " / " + data.ages[range ? stat.max : stat.high]]];
      }) });
      return [pickButton(cause.id, causeLabel(cause), "ons-row-button"), ...series.map(stat => {
        const profile = pickButton(cause.id, null, "ons-profile-button");
        profile.setAttribute("aria-label", causeLabel(cause) + " · Медианная группа " + data.ages[stat.median]);
        profile.append(node("strong", data.ages[stat.median]), interval(stat, range));
        return profile;
      })];
    });
    chart.append(note("Точка — медианная группа, толстая линия — Q1–Q3, тонкая — " + (range ? "все наблюдаемые группы" : "P10–P90") +
      ". Границы показаны возрастными группами ONS."));
    if (rows.length) chart.append(table("Возрастные профили причин", ["Причина", ...groups.map(([name]) => name)], rows, "ons-profile"));
    else chart.append(note("Нет причин с достаточным числом наблюдений во всех выбранных срезах."));
  }

  function comparison() {
    const s = local.dotogram;
    const cause = byCause.get(s.cause);
    const measure = s.measure;
    const format = renderValue[measure];
    const slice = comparisonSlice();
    const rows = data.regions.map(region => ({ ...region, amount: value({ ...slice, region: region.id }, cause.id, measure) }))
      .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    const regionalRows = rows.filter(row => row.id !== data.regions[0].id);
    const maximum = Math.max(1, ...regionalRows.map(row => row.amount ?? 0));
    const reference = rows.find(row => row.id === filters.region);
    const other = rows.find(row => row.id === s.other);
    chart.append(node("h3", causeLabel(cause)), note(measure === "rate" ?
      "Стандартизованный по возрасту коэффициент ONS на 100 000 жителей за один год и для всех возрастов. Стандарт — европейское население 2013 года." +
        (filters.year === "all" ? " Для периода 2023–2025 показан коэффициент за 2025 год." : "") :
      measure === "share" ? "Доля причины среди всех зарегистрированных смертей на каждой территории." : "Число зарегистрированных смертей."));
    chart.append(table("Выбранные территории", ["Территория", "Значение"], [reference, other].map(row => [
      pickButton(row.id, row.name, "ons-row-button"), format(row.amount)
    ])));
    for (const row of rows) {
      const territorySlice = { ...slice, region: row.id };
      const difference = row.amount == null || reference.amount == null ? null : row.amount - reference.amount;
      const changeFormat = measure === "share" ? n => decimal.format(n) + " п.п." : format;
      register(row.id, { title: row.name, context: causeLabel(cause) + " · " + summary(territorySlice, { region: false }),
        fields: [[measure === "rate" ? "На 100 000 жителей" : "Значение", format(row.amount)], ["Смертей по причине", num(count(territorySlice, cause.id))],
          ["Всего смертей", num(count(territorySlice, "0"))], ["Опорная территория", reference.name], ["Разница с опорной", signed(difference, changeFormat)],
          ...data.years.map(year => [String(year), format(value({ ...territorySlice, year }, cause.id, measure))])] });
    }
    const output = regionalRows.map(row => {
      const dot = pickButton(row.id, null, "ons-dot-track");
      dot.setAttribute("aria-label", row.name + " · " + format(row.amount));
      if (row.amount != null) {
        const point = node("i");
        point.style.left = 100 * row.amount / maximum + "%";
        dot.append(point);
      } else {
        dot.classList.add("ons-dot-missing");
      }
      return [pickButton(row.id, row.name, "ons-row-button"), format(row.amount), dot];
    });
    chart.append(table("Ранжированный профиль территорий", ["Территория", "Значение", "Положение"], output, "ons-dotogram"));
  }

  const renderers = { treemap, heatmap: matrix, arrow: ranks, pyramid, plot: ageProfile, dotogram: comparison };

  function render() {
    const s = local[view];
    const compare = s.mode === "compare" && (view === "arrow" || view === "plot");
    const period = view === "arrow" && (!compare || s.compare === "time") || view === "pyramid" && s.mode === "trend" ||
      view === "plot" && compare && s.compare === "time";
    get("onsContext").textContent = summary(view === "dotogram" ? comparisonSlice() : filters, {
      year: !period, region: view !== "heatmap", sex: view !== "pyramid" && !(compare && s.compare === "sex"),
      age: view !== "pyramid" && view !== "plot"
    }) + (period ? " · " + (view === "plot" ? s.first + " → " + s.last : view === "arrow" && s.mode === "trend" ? "2023–2025" : "2023 → 2025") :
      compare && s.compare === "sex" ? " · Мужчины → женщины" : "");
    const frame = chart.querySelector(".ons-matrix")?.parentElement;
    const scrollLeft = frame?.scrollLeft ?? 0;
    chart.replaceChildren();
    items.clear();
    renderers[view]();
    if (filters.age === "1" && ["treemap", "heatmap", "arrow", "dotogram"].includes(view) &&
        (view !== "dotogram" || s.measure !== "rate" && s.cause !== "0")) chart.prepend(note(ageNotice));
    if (!items.has(selections.get(view))) selections.set(view, view === "dotogram" ? filters.region : items.keys().next().value);
    updateSelection();
    const next = chart.querySelector(".ons-matrix")?.parentElement;
    if (next) next.scrollLeft = scrollLeft;
  }

  function show(next) {
    closeDetails();
    view = next;
    normalize();
    renderControls();
    render();
    get("onsStage").scrollTop = 0;
  }

  window.atlasOns = { show, closeDetails };
})();
