(() => {
  "use strict";

  const data = window.atlasOnsData;
  const element = id => document.getElementById(id);
  const chart = element("onsChart");
  const number = new Intl.NumberFormat("ru-RU");
  const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  const showNumber = value => value == null ? "—" : number.format(value);
  const showPercent = value => value == null ? "—" : decimal.format(value) + " %";
  const colours = ["#236084", "#79528d", "#9d4d40", "#327566", "#835d23", "#425eb3", "#286d72", "#924f69", "#55677f", "#584871"];
  const regions = data.regions.slice(1);
  const classes = data.causes.filter(cause => cause.parent === "0");
  const byCause = new Map(data.causes.map(cause => [cause.id, cause]));
  const state = { view: "treemap", year: 2025, region: data.regions[0].id, other: regions.at(-1).id,
    sex: "0", cause: "0", tree: "0", matrixMeasure: "share", comparisonMeasure: "rate" };
  const controls = {
    year: element("onsYear"), region: element("onsRegion"), other: element("onsOther"),
    sex: element("onsSex"), cause: element("onsCause"), measure: element("onsMeasure")
  };
  const filters = {
    treemap: ["year", "region", "sex"],
    heatmap: ["year", "sex", "measure"],
    arrow: ["region", "sex"],
    pyramid: ["year", "region", "cause"],
    plot: ["year", "region", "sex", "cause"],
    dotogram: ["year", "region", "other", "sex", "measure"]
  };

  const causeLabel = cause => [cause.code, cause.name].filter(Boolean).join(" · ");
  const key = (year, region, cause, sex) => [year, region, cause, sex].join("|");
  const counts = (year, region, cause, sex) => data.counts[key(year, region, cause, sex)];
  const count = (year, region, cause, sex) => counts(year, region, cause, sex)[0];
  const rate = (year, region, cause, sex) => data.rates[key(year, region, cause, sex)];
  const share = (year, region, cause, sex) => {
    const numerator = count(year, region, cause, sex);
    const denominator = count(year, region, "0", sex);
    return numerator == null || !denominator ? null : 100 * numerator / denominator;
  };

  function node(tag, content, className) {
    const result = document.createElement(tag);
    if (content != null) result.textContent = content;
    if (className) result.className = className;
    return result;
  }

  function addOptions(select, items) {
    for (const { id, name } of items) select.add(new Option(name, id));
  }

  addOptions(controls.year, data.years.map(year => ({ id: year, name: year })));
  addOptions(controls.region, data.regions);
  addOptions(controls.other, data.regions);
  addOptions(controls.cause, data.causes.map(cause => ({ id: cause.id, name: causeLabel(cause) })));

  function makeTable(label, headings, rows, className = "") {
    const frame = node("div", null, "ons-table-frame");
    frame.tabIndex = 0;
    frame.setAttribute("role", "region");
    frame.setAttribute("aria-label", label);
    const table = node("table", null, "ons-table " + className);
    const heading = table.createTHead().insertRow();
    for (const title of headings) {
      const th = node("th", title);
      th.scope = "col";
      heading.append(th);
    }
    const body = table.createTBody();
    for (const [name, ...values] of rows) {
      const row = body.insertRow();
      const th = node("th");
      th.scope = "row";
      th.append(name);
      row.append(th);
      for (const value of values) row.insertCell().append(value);
    }
    frame.append(table);
    return frame;
  }

  function note(text) {
    return node("p", text, "ons-note");
  }

  // Binary split from the atlas treemap, applied only to published aggregate counts.
  function partition(items, x, y, width, height, output) {
    if (items.length === 1) {
      output.push({ item: items[0], x, y, width, height });
      return;
    }
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let subtotal = 0;
    let split = 1;
    let distance = Infinity;
    let weight = 0;
    for (let i = 1; i < items.length; i++) {
      subtotal += items[i - 1].value;
      const difference = Math.abs(total / 2 - subtotal);
      if (difference < distance) {
        split = i;
        distance = difference;
        weight = subtotal / total;
      }
    }
    const left = items.slice(0, split);
    const right = items.slice(split);
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

  function changeTree(id) {
    state.tree = id;
    render();
    chart.querySelector(".ons-tree-heading h3").focus();
  }

  function tree() {
    const parent = byCause.get(state.tree);
    const total = count(state.year, state.region, parent.id, state.sex);
    const heading = node("div", null, "ons-tree-heading");
    const title = node("h3", causeLabel(parent) + " · " + showNumber(total));
    title.tabIndex = -1;
    heading.append(title);
    if (parent.parent !== null) {
      const back = node("button", "Назад к родительской группе");
      back.type = "button";
      back.addEventListener("click", () => changeTree(parent.parent));
      heading.prepend(back);
    }
    chart.append(heading);
    const children = data.causes.filter(cause => cause.parent === parent.id);
    if (!children.length) return;
    const entries = children.map((cause, index) => ({
      ...cause, value: count(state.year, state.region, cause.id, state.sex), colour: colours[index % colours.length]
    }));
    if (total != null && entries.every(entry => entry.value != null)) {
      const remainder = total - entries.reduce((sum, entry) => sum + entry.value, 0);
      if (remainder > 0) entries.push({ name: "Остальные причины в группе", value: remainder, colour: "#667381" });
    }
    const plotted = entries.filter(item => item.value > 0).sort((a, b) => b.value - a.value);
    const positions = [];
    if (plotted.length) {
      const treemap = node("div", null, "ons-treemap");
      const width = chart.clientWidth || 600;
      const height = Math.min(420, Math.max(280, width * 0.65));
      partition(plotted, 0, 0, width, height, positions);
      for (const box of positions) {
        const { item } = box;
        const interactive = item.id != null;
        const tile = node(interactive ? "button" : "div", null, "ons-tree-tile");
        const label = causeLabel(item);
        tile.title = label + " · " + showNumber(item.value);
        tile.style.left = 100 * box.x / width + "%";
        tile.style.top = 100 * box.y / height + "%";
        tile.style.width = 100 * box.width / width + "%";
        tile.style.height = 100 * box.height / height + "%";
        tile.style.background = item.colour;
        tile.append(node("span", label), node("strong", showNumber(item.value)));
        if (interactive) {
          tile.type = "button";
          tile.addEventListener("click", () => changeTree(item.id));
        }
        treemap.append(tile);
      }
      chart.append(treemap);
    }
    chart.append(makeTable("Причины внутри группы", ["Причина смерти", "Смертей"],
      entries.map(entry => [causeLabel(entry), showNumber(entry.value)])));
  }

  function matrix() {
    const useShare = state.matrixMeasure === "share";
    const value = useShare ? share : count;
    const renderValue = useShare ? showPercent : showNumber;
    const raw = regions.map(region => classes.map(cause => value(state.year, region.id, cause.id, state.sex)));
    const max = Math.max(1, ...raw.flat().filter(Number.isFinite));
    const rows = raw.map((values, index) => [regions[index].name, ...values.map((amount, column) => {
      const cell = node("span", renderValue(amount), "ons-heat-cell");
      const intensity = amount == null ? 0 : amount / max;
      cell.style.background = "rgba(28, 93, 128, " + (intensity * 0.88) + ")";
      if (intensity > 0.78) cell.style.color = "#fff";
      cell.title = classes[column].name;
      return cell;
    })]);
    const headings = classes.map(cause => cause.code);
    const table = makeTable("Территории и причины смерти", ["Территория", ...headings], rows, "ons-matrix");
    [...table.querySelectorAll("thead th")].slice(1).forEach((th, index) => { th.title = classes[index].name; });
    const legend = node("details", null, "ons-cause-key");
    legend.append(node("summary", "Названия классов"));
    const list = node("ul");
    classes.forEach(cause => list.append(node("li", causeLabel(cause))));
    legend.append(list);
    chart.append(note(useShare ? "Доля причины среди всех зарегистрированных смертей на территории." :
      "Цвет показывает число зарегистрированных смертей по общей шкале."), table, legend);
  }

  function svg(tag, attributes) {
    const result = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    return result;
  }

  function ranks() {
    const groups = data.years.map(year => {
      const items = classes.map(cause => ({ id: cause.id, value: count(year, state.region, cause.id, state.sex) }))
        .filter(item => item.value != null)
        .sort((a, b) => b.value - a.value);
      const positions = new Map();
      let rank = 0;
      items.forEach((item, index) => {
        if (!index || item.value !== items[index - 1].value) rank = index + 1;
        positions.set(item.id, { rank, value: item.value });
      });
      return positions;
    });
    const rows = [...classes].sort((a, b) => (groups.at(-1).get(a.id)?.rank ?? Infinity) -
      (groups.at(-1).get(b.id)?.rank ?? Infinity));
    const plot = svg("svg", { viewBox: "0 0 440 285", class: "ons-rank", "aria-hidden": "true" });
    const xs = [68, 220, 372];
    const toY = rank => 36 + (rank - 1) * 25;
    for (let rank = 1; rank <= classes.length; rank++) {
      const y = toY(rank);
      plot.append(svg("line", { x1: 38, y1: y, x2: 402, y2: y, stroke: "#dbe4eb" }));
      const label = svg("text", { x: 25, y: y + 4, "text-anchor": "end" });
      label.textContent = rank;
      plot.append(label);
    }
    for (const [index, year] of data.years.entries()) {
      const label = svg("text", { x: xs[index], y: 17, "text-anchor": "middle" });
      label.textContent = year;
      plot.append(label);
    }
    for (const cause of rows) {
      const colour = colours[classes.indexOf(cause)];
      const points = groups.map((group, index) => {
        const row = group.get(cause.id);
        return row ? [xs[index], toY(row.rank)] : null;
      });
      points.forEach((point, index) => {
        if (!point) return;
        const [x, y] = point;
        const previous = points[index - 1];
        if (previous) plot.append(svg("line", { x1: previous[0], y1: previous[1], x2: x, y2: y, stroke: colour, "stroke-width": 2 }));
        plot.append(svg("circle", { cx: x, cy: y, r: 4, fill: colour }));
      });
    }
    const table = makeTable("Ранги выбранных классов причин", ["Причина", ...data.years.map(String)], rows.map(cause => {
      const label = node("span", causeLabel(cause), "ons-rank-label");
      label.style.borderColor = colours[classes.indexOf(cause)];
      return [label, ...groups.map(group => {
        const item = group.get(cause.id);
        return item ? item.rank + " место · " + showNumber(item.value) : "—";
      })];
    }));
    chart.append(note("Места среди показанных классов по числу зарегистрированных смертей. При равном числе смертей место совпадает."), plot, table);
  }

  function bar(value, scale, side) {
    const item = node("div", null, "ons-bar " + side);
    if (value != null) {
      const fill = node("span", null, "ons-bar-fill");
      fill.style.width = 100 * value / scale + "%";
      fill.setAttribute("aria-hidden", "true");
      item.append(fill);
    }
    item.append(node("strong", showNumber(value)));
    return item;
  }

  function pyramid() {
    const men = counts(state.year, state.region, state.cause, "1");
    const women = counts(state.year, state.region, state.cause, "2");
    const scale = Math.max(1, ...men.slice(1), ...women.slice(1));
    const rows = data.ages.slice(1).map((age, index) => {
      const ageIndex = index + 1;
      return [age, bar(men[ageIndex], scale, "ons-bar-men"), bar(women[ageIndex], scale, "ons-bar-women")];
    }).reverse();
    chart.append(note("Зарегистрированные смерти по возрасту и полу. Обе стороны показаны в одном масштабе."),
      makeTable("Возрастно-половое распределение", ["Возраст", "Мужчины", "Женщины"], rows, "ons-pyramid"));
    if (state.cause !== "0") chart.append(note("ONS публикует смерти в первые 28 дней жизни отдельной группой без разбивки по причинам."));
  }

  function ageProfile() {
    const byAge = counts(state.year, state.region, state.cause, state.sex).slice(1);
    const total = byAge.reduce((sum, value) => sum + (value ?? 0), 0);
    let running = 0;
    const median = total > 0 && byAge.every(Number.isFinite) ? byAge.findIndex(value => {
      running += value;
      return running >= total / 2;
    }) : -1;
    const scale = Math.max(1, ...byAge);
    const rows = byAge.map((value, index) => [
      data.ages[index + 1], bar(value, scale, "ons-bar-age"), showPercent(value == null || !total ? null : 100 * value / total)
    ]);
    const table = makeTable("Распределение по возрастным группам", ["Возраст", "Смертей", "Доля по возрасту"], rows, "ons-age");
    if (median >= 0) table.querySelectorAll("tbody tr")[median].classList.add("ons-median");
    chart.append(node("h3", median < 0 ? "Медианная группа недоступна" : "Медианная группа · " + data.ages[median + 1]),
      note("Доли и медианная группа рассчитаны по опубликованным возрастным интервалам."), table);
    if (state.cause !== "0") chart.append(note("ONS публикует смерти в первые 28 дней жизни отдельной группой без разбивки по причинам."));
  }

  function comparison() {
    const measure = state.comparisonMeasure;
    const accessor = { count, share, rate }[measure];
    const renderValue = { count: showNumber, share: showPercent, rate: value => value == null ? "—" : decimal.format(value) }[measure];
    const context = {
      count: "Число зарегистрированных смертей.",
      share: "Доля причины среди всех зарегистрированных смертей в каждой территории.",
      rate: "Коэффициент ONS на 100 000 жителей, стандартизованный по возрасту к европейскому стандартному населению 2013 года."
    }[measure];
    const selected = [state.region, state.other];
    const table = makeTable("Сравнение показателей территорий",
      ["Причина", ...selected.map(id => data.regions.find(region => region.id === id).name)],
      [byCause.get("0"), ...classes].map(cause => [
        causeLabel(cause), ...selected.map(id => renderValue(accessor(state.year, id, cause.id, state.sex)))
      ]));
    chart.append(note(context), table);
  }

  const renderers = { treemap: tree, heatmap: matrix, arrow: ranks, pyramid, plot: ageProfile, dotogram: comparison };

  function render() {
    chart.replaceChildren();
    renderers[state.view]();
  }

  function show(view) {
    state.view = view;
    for (const label of element("onsFilters").querySelectorAll("[data-filter]")) {
      label.hidden = !filters[view].includes(label.dataset.filter);
    }
    controls.measure.querySelector('[value="rate"]').disabled = view !== "dotogram";
    for (const field of ["year", "region", "other", "sex", "cause"]) controls[field].value = state[field];
    controls.measure.value = view === "heatmap" ? state.matrixMeasure : state.comparisonMeasure;
    render();
    element("onsStage").scrollTop = 0;
  }

  for (const [field, select] of Object.entries(controls)) {
    select.addEventListener("change", () => {
      if (field === "measure") {
        const measureField = state.view === "heatmap" ? "matrixMeasure" : "comparisonMeasure";
        state[measureField] = select.value;
      } else {
        state[field] = select.value;
      }
      render();
    });
  }

  window.atlasOns = { show };
})();
