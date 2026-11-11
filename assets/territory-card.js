/* Territory previews and pinned cards. Visual direction informed by unslop,
 * Damir Sokolovsky / @heydamir, CC BY 4.0: https://github.com/heydamir/unslop */
(() => {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : "Нет данных";
  const closeIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
  let instance = 0;

  const seriesHtml = data => {
    const series = data.series || [];
    const available = series.filter(point => Number.isFinite(point.value));
    if (available.length < 2 || data.suppressed) return "";
    const max = Math.max(1, ...available.map(point => point.value));
    const x = index => 18 + index * 244 / Math.max(1, series.length - 1);
    const y = value => 72 - value / max * 48;
    // Missing observations break the path. The baseline represents zero.
    const paths = series.map((point, index) => Number.isFinite(point.value)
      ? `${index && Number.isFinite(series[index - 1].value) ? "L" : "M"}${x(index)},${y(point.value)}` : "").join("");
    const description = series.map(point => `${point.year}: ${Number.isFinite(point.value) ? (point.formatted || fmt(point.value)) : "нет данных"}`).join("; ");
    return `<div class="territory-card__series"><p>${esc(data.seriesLabel || "По годам")}</p>
      <svg viewBox="0 0 280 102" role="img" aria-label="${esc(description)}. Шкала от нуля">
        <path class="territory-card__baseline" d="M12 72H268"/>
        <path class="territory-card__line" d="${paths}"/>
        ${series.map((point, index) => `<text x="${x(index)}" y="96" text-anchor="middle">${esc(point.year)}</text>${Number.isFinite(point.value)
          ? `<circle cx="${x(index)}" cy="${y(point.value)}" r="3" class="${String(point.year) === String(data.year) ? "is-current" : ""}"/><text class="territory-card__point-value" x="${x(index)}" y="${Math.max(12, y(point.value) - 10)}" text-anchor="middle">${esc(point.formatted || fmt(point.value))}</text>`
          : `<text x="${x(index)}" y="60" text-anchor="middle">—</text>`}`).join("")}
      </svg></div>`;
  };

  const render = (data, pinned = false) => {
    if (!data) return "";
    const missing = !Number.isFinite(data.value);
    const displayed = data.suppressed ? "Менее 5" : missing ? "Нет данных" : data.formatted || fmt(data.value);
    const chart = pinned && data.pinnedContext !== "comparison" ? seriesHtml(data) : "";
    return `<article class="territory-card${pinned ? " territory-card--pinned" : ""}${missing || data.suppressed ? " territory-card--empty" : ""}" aria-label="${esc(data.name)}">
      ${pinned ? `<span class="territory-card__handle" aria-hidden="true"></span><button type="button" class="territory-card__close" data-card-action="close" aria-label="Закрыть карточку территории">${closeIcon}</button>` : ""}
      <h3>${esc(data.name)}</h3>
      <p class="territory-card__context">${esc(data.context)}</p>
      ${data.group ? `<p class="territory-card__group">${esc(data.group)}</p>` : ""}
      <div class="territory-card__primary"><div class="territory-card__stat"><strong data-card-value>${esc(displayed)}</strong>${!missing && !data.suppressed && data.unit ? `<span>${esc(data.unit)}</span>` : ""}</div>
      ${data.label ? `<p class="territory-card__label">${esc(data.label)}</p>` : ""}</div>
      ${data.basis ? `<p class="territory-card__basis">${esc(data.basis)}</p>` : ""}
      ${data.suppressed ? '<p class="territory-card__basis">Малые значения приглушены текущей настройкой</p>' : ""}
      ${!data.suppressed && data.footer && !chart ? `<div class="territory-card__footer"><span>${esc(data.footer.label)}</span><strong>${esc(data.footer.value)}</strong></div>` : ""}
      ${chart}
      ${pinned ? '<button type="button" class="territory-card__details" data-card-action="details">Сведения о территории<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14m-5-5 5 5-5 5"/></svg></button>' : ""}
    </article>`;
  };

  const createDock = ({ container, map, getData, getItems, onSelect, onClear, onDetails, isHidden = () => false, onEscape = () => false }) => {
    const id = `territory-picker-${++instance}`;
    const dock = document.createElement("div");
    dock.className = "territory-card-dock";
    dock.hidden = true;
    const picker = document.createElement("details");
    picker.className = "territory-picker";
    picker.innerHTML = `<summary aria-label="Выбрать территорию" title="Выбрать территорию"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10M3 5h.1M3 10h.1M3 15h.1"/></svg></summary><form><label for="${id}">Территория</label><select id="${id}" aria-label="Территория на карте"></select><button type="submit">Закрепить карточку</button></form>`;
    const status = document.createElement("div");
    status.className = "territory-card-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-atomic", "true");
    container.append(dock, picker, status);
    const select = picker.querySelector("select");
    let signature = "", html = "", announcement = "", returnFocus = null;
    const controller = new AbortController();
    const { signal } = controller;
    const focusMap = () => (returnFocus?.isConnected && !returnFocus.closest("[inert]") ? returnFocus : picker.querySelector("summary")).focus({ preventScroll: true });
    const clear = () => {
      const restore = dock.contains(document.activeElement);
      onClear();
      if (restore) focusMap();
    };
    const update = ({ focus = false } = {}) => {
      const data = getData();
      const items = getItems();
      picker.hidden = items.length === 0;
      const nextSignature = items.map(item => `${item.id}:${item.name}`).join("|");
      if (signature !== nextSignature) {
        signature = nextSignature;
        select.innerHTML = items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
      }
      if (data?.id != null && !picker.open) select.value = String(data.id);
      const next = render(data, true);
      if (next !== html) {
        const action = dock.contains(document.activeElement) ? document.activeElement.dataset.cardAction : null;
        html = next;
        dock.innerHTML = next;
        if (action) dock.querySelector(`[data-card-action="${action}"]`)?.focus({ preventScroll: true });
      }
      dock.hidden = !data || isHidden();
      const message = data ? `${data.name}. ${data.context}. ${data.group || ""}. ${data.suppressed ? "Менее 5" : data.formatted || fmt(data.value)} ${data.unit || ""}` : "";
      if (message !== announcement) { status.textContent = announcement = message; }
      if (focus && !dock.hidden) dock.querySelector("[data-card-action=close]")?.focus({ preventScroll: true });
    };
    for (const element of [dock, picker]) {
      for (const name of ["click", "dblclick", "pointerdown", "mousedown", "touchstart", "wheel"]) {
        element.addEventListener(name, event => event.stopPropagation(), { signal });
      }
    }
    picker.addEventListener("toggle", () => {
      if (picker.open) { update(); select.focus({ preventScroll: true }); }
    }, { signal });
    picker.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      returnFocus = picker.querySelector("summary");
      picker.open = false;
      onSelect(Number(select.value), { fly: true, focus: true });
    }, { signal });
    dock.addEventListener("click", event => {
      const action = event.target.closest("[data-card-action]")?.dataset.cardAction;
      if (action === "close") clear();
      if (action === "details") onDetails();
    }, { signal });
    const keydown = event => {
      if (!container.isConnected || event.key !== "Escape" || document.querySelector(".method.is-open")) return;
      if (picker.open) { picker.open = false; picker.querySelector("summary").focus(); event.stopImmediatePropagation(); return; }
      if (onEscape()) { event.stopImmediatePropagation(); return; }
      if (getData() && !isHidden()) { clear(); event.stopImmediatePropagation(); }
    };
    document.addEventListener("keydown", keydown, { signal, capture: true });
    document.addEventListener("pointerdown", event => {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    }, { signal });
    window.addEventListener("atlas:legacy-state", () => { if (container.isConnected) update(); }, { signal });
    window.addEventListener("resize", () => { if (container.isConnected) update(); }, { signal });
    update();
    return { update, clear, destroy() { controller.abort(); dock.remove(); picker.remove(); status.remove(); } };
  };
  window.AmurTerritoryCard = { render, createDock };
})();
