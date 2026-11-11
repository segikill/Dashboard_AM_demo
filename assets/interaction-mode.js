/* Keep transient mouse previews separate from touch activation and scrolling. */
(() => {
  "use strict";
  const compact = matchMedia("(max-width: 1023px)");
  const noHover = matchMedia("(hover: none)");
  let input = noHover.matches ? "touch" : "mouse";
  let gesture = null;
  let cancelledTapAt = -Infinity;
  const tooltip = () => document.getElementById("tooltip");
  const dismiss = () => {
    const element = tooltip();
    if (!element) return;
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
  };
  const setInput = value => {
    input = value;
    document.documentElement.dataset.atlasInput = value;
    if (value === "touch") dismiss();
  };
  const canHover = event => !compact.matches && !noHover.matches && input !== "touch"
    && event?.pointerType !== "touch" && event?.pointerType !== "pen"
    && !event?.sourceCapabilities?.firesTouchEvents;
  setInput(input);

  const install = () => {
    if (typeof showTip !== "function" || typeof moveTip !== "function" || typeof addTip !== "function") return;
    const originalShow = showTip, originalMove = moveTip, originalAdd = addTip;
    showTip = (event, html) => {
      // Legacy click inspectors may read this payload. Keep it fresh without
      // displaying a hover layer on touch devices.
      if (!canHover(event)) {
        const element = tooltip();
        if (element) element.innerHTML = html;
        dismiss();
        return;
      }
      originalShow(event, html);
      tooltip()?.setAttribute("aria-hidden", "false");
    };
    moveTip = event => { if (canHover(event)) originalMove(event); else dismiss(); };
    addTip = (element, html) => {
      originalAdd(element, html);
      element.dataset.tooltipSource = "true";
      element.addEventListener("click", event => {
        // Capture precedes selection, even when a touch generated no mouseenter.
        const content = typeof html === "function" ? html() : html;
        if (tooltip()) tooltip().innerHTML = content;
        dismiss();
      }, { capture: true });
    };
  };
  install();

  document.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      setInput("touch");
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      cancelledTapAt = -Infinity;
    } else if (event.pointerType === "mouse" && !event.sourceCapabilities?.firesTouchEvents) {
      setInput("mouse");
      gesture = null;
      cancelledTapAt = -Infinity;
    }
    dismiss();
  }, { capture: true, passive: true });
  document.addEventListener("pointermove", event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) {
      gesture.moved = true;
      dismiss();
    }
    if (event.pointerType === "mouse" && !event.sourceCapabilities?.firesTouchEvents) setInput("mouse");
  }, { capture: true, passive: true });
  const finish = event => {
    if (gesture?.id !== event.pointerId) return;
    if (gesture.moved || event.type === "pointercancel") cancelledTapAt = performance.now();
    gesture = null;
  };
  document.addEventListener("pointerup", finish, { capture: true, passive: true });
  document.addEventListener("pointercancel", finish, { capture: true, passive: true });
  if (!("PointerEvent" in window)) {
    document.addEventListener("touchstart", () => { setInput("touch"); dismiss(); }, { capture: true, passive: true });
  }
  document.addEventListener("click", event => {
    if (input === "touch" && performance.now() - cancelledTapAt < 700 && event.target.closest?.("#viz")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss();
    }
  }, { capture: true });
  document.addEventListener("scroll", dismiss, { capture: true, passive: true });
  document.addEventListener("wheel", dismiss, { passive: true });
  document.addEventListener("visibilitychange", dismiss);
  window.addEventListener("blur", dismiss);
  window.addEventListener("resize", dismiss);
  window.addEventListener("atlas:legacy-state", dismiss);
  window.AtlasInteraction = { canHover, dismiss, touchLayout: () => compact.matches || noHover.matches || input === "touch" };
})();
