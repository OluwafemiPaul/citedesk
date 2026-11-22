/*! CiteDesk chat bubble. AGPL 3.0. https://github.com/OluwafemiPaul/citedesk */
(function () {
  var script = document.currentScript;
  if (!script || window.__citedeskLoaded) return;
  var botId = script.getAttribute("data-bot");
  if (!botId) return;
  window.__citedeskLoaded = true;
  var base = new URL(script.src).origin;

  function el(tag, styles, attrs) {
    var e = document.createElement(tag);
    for (var k in styles) e.style[k] = styles[k];
    for (var a in attrs || {}) e.setAttribute(a, attrs[a]);
    return e;
  }

  function build(cfg) {
    var side = cfg.position === "left" ? "left" : "right";
    var open = false;
    var frame = null;
    var small = window.matchMedia("(max-width: 480px)");

    var button = el(
      "button",
      { position: "fixed", bottom: "20px", width: "56px", height: "56px", borderRadius: "50%", border: "none", cursor: "pointer", background: cfg.color, color: "#fff", boxShadow: "0 6px 20px rgba(0,0,0,.25)", zIndex: "2147483646", display: "flex", alignItems: "center", justifyContent: "center", padding: "0" },
      { type: "button", "aria-label": "Open chat with " + cfg.name, "aria-expanded": "false" }
    );
    button.style[side] = "20px";
    var chatIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';
    var closeIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    button.innerHTML = chatIcon;

    var box = el("div", { position: "fixed", zIndex: "2147483647", display: "none", overflow: "hidden", background: "#fff", boxShadow: "0 12px 40px rgba(0,0,0,.25)" });

    function layout() {
      if (small.matches) {
        box.style.inset = "0";
        box.style.width = "100%";
        box.style.height = "100%";
        box.style.borderRadius = "0";
      } else {
        box.style.inset = "auto";
        box.style.bottom = "88px";
        box.style[side] = "20px";
        box.style.width = "380px";
        box.style.height = "min(620px, calc(100vh - 120px))";
        box.style.borderRadius = "16px";
      }
    }

    function setOpen(next) {
      open = next;
      if (open && !frame) {
        frame = el("iframe", { width: "100%", height: "100%", border: "0", display: "block" }, {
          title: "Chat with " + cfg.name,
          src: base + "/embed/" + encodeURIComponent(botId) + "?host=" + encodeURIComponent(location.hostname) + "&page=" + encodeURIComponent(location.href.slice(0, 400)),
          allow: "clipboard-write",
        });
        box.appendChild(frame);
      }
      layout();
      box.style.display = open ? "block" : "none";
      button.innerHTML = open ? closeIcon : chatIcon;
      button.setAttribute("aria-label", (open ? "Close" : "Open") + " chat with " + cfg.name);
      button.setAttribute("aria-expanded", String(open));
      button.style.display = open && small.matches ? "none" : "flex";
      if (!open) button.focus();
    }

    button.addEventListener("click", function () { setOpen(!open); });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") setOpen(false); });
    window.addEventListener("message", function (e) { if (e.origin === base && e.data === "citedesk:close") setOpen(false); });
    if (small.addEventListener) small.addEventListener("change", function () { if (open) setOpen(true); });

    document.body.appendChild(box);
    document.body.appendChild(button);
  }

  function start() {
    fetch(base + "/api/widget/" + encodeURIComponent(botId) + "/config", { mode: "cors", credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { if (cfg) build(cfg); })
      .catch(function () {});
  }

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
