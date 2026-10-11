// Marketing site behaviour: mobile menu, app links, and live prices from the same settings the app uses.
(function () {
  // Dev preview (dev.firstlineperform.com/site/) links to the dev app; every production host links to the real app.
  var APP = /^(dev\.|localhost)/.test(location.hostname) ? "https://dev.firstlineperform.com" : "https://app.firstlineperform.com";
  document.querySelectorAll("a[data-app]").forEach(function (a) { a.href = APP + (a.getAttribute("data-app") || "/"); });

  // Contact form -> the support desk (same API the app uses). Host-based like the app links.
  var API = /^(dev\.|localhost)/.test(location.hostname) ? "https://api-dev.firstlineperform.com" : "https://api.firstlineperform.com";
  var form = document.getElementById("contact");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = document.getElementById("c-status"); status.textContent = "Sending…";
    var f = new FormData(form); var payload = {};
    f.forEach(function (v, k) { payload[k] = v; });
    fetch(API + "/support/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) { if (x.ok) { status.textContent = "Sent. Your ticket number is " + x.b.number + "; a confirmation is on its way to your inbox."; form.reset(); } else { status.textContent = x.b.error || "That didn't send. Email support@firstlineperform.com instead."; } })
      .catch(function () { status.textContent = "That didn't send. Email support@firstlineperform.com instead."; });
  });

  var btn = document.querySelector(".menu"), nav = document.querySelector(".nav");
  if (btn && nav) btn.addEventListener("click", function () { nav.classList.toggle("open"); });

  // Prices and rules come from the same tables the app charges from, read through the public view the
  // marketplace uses, so a change in the admin control center shows here at once. Per host, like the
  // app links: the dev preview reads the dev project, every production host reads production.
  var DEV = /^(dev\.|localhost)/.test(location.hostname);
  var SUPABASE = DEV ? "https://uspbmbvoxotbelribjgo.supabase.co" : "https://sbvojmprxienxacwrsfp.supabase.co";
  var ANON = document.documentElement.getAttribute(DEV ? "data-anon" : "data-anon-prod");
  var headers = { apikey: ANON, authorization: "Bearer " + ANON };
  var money = function (cents) { return "$" + Math.round(cents / 100).toLocaleString("en-US"); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var get = function (path) { return fetch(SUPABASE + "/rest/v1/" + path, { headers: headers }).then(function (r) { return r.ok ? r.json() : []; }); };
  var ASK = "Please contact for pricing";
  var FORMATS = [["film_room_30_cents", 0], ["film_room_60_cents", 1], ["addon_30_cents", 2], ["season_arc_cents", 3]];

  var levelsBox = document.getElementById("levels"), table = document.getElementById("level-prices");
  var names = document.querySelectorAll("[data-level-names]"), rules = document.querySelectorAll("[data-rule]");
  if (ANON && (levelsBox || table || names.length || rules.length)) {
    Promise.all([
      (levelsBox || table || names.length) ? get("mentor_tiers_public?select=key,name,description,sort,price_visible,breakdown_price_cents,film_room_30_cents,film_room_60_cents,addon_30_cents,season_arc_cents,color,turnaround_hours&visible=eq.true&order=sort.asc") : [],
      get("settings?select=rules&id=eq.1")
    ]).then(function (res) {
      var levels = res[0] || [], r = (res[1] && res[1][0] && res[1][0].rules) || {};
      rules.forEach(function (el) { var v = r[el.getAttribute("data-rule")]; if (v != null) el.textContent = v; });
      if (!levels.length) return; // the static fallback stays
      if (levelsBox) levelsBox.innerHTML = levels.map(function (l, i) {
        var hours = l.turnaround_hours || r.turnaround_hours || 72;
        var price = l.price_visible && typeof l.breakdown_price_cents === "number" ? money(l.breakdown_price_cents) + "<small>per game</small>" : '<span class="ask">' + ASK + "</span>";
        return '<div class="tier' + (i === 0 ? " top" : "") + '"' + (l.color ? ' style="--lc:' + esc(l.color) + '"' : "") + ">" +
          (i === 0 ? '<span class="badge">Highest level</span>' : "") + "<h3>" + esc(l.name) + "</h3>" +
          '<p class="who">' + esc(l.description || "") + "</p>" + '<div class="price">' + price + "</div>" +
          "<ul><li>Recorded breakdown</li><li>Player Development Worksheet PDF</li><li>" + esc(hours) + " hour turnaround from acceptance</li></ul></div>";
      }).join("");
      if (table) {
        var head = table.querySelector("thead tr"), rows = table.querySelectorAll("tbody tr");
        head.innerHTML = "<th>Session</th>" + levels.map(function (l) { return "<th>" + esc(l.name) + "</th>"; }).join("");
        FORMATS.forEach(function (f) {
          var row = rows[f[1]]; if (!row) return;
          row.querySelectorAll("td.num").forEach(function (td) { td.remove(); });
          row.insertAdjacentHTML("beforeend", levels.map(function (l) {
            var v = l[f[0]];
            return '<td class="num">' + (l.price_visible && typeof v === "number" ? money(v) : '<span class="ask">' + ASK + "</span>") + "</td>";
          }).join(""));
        });
      }
      if (names.length) {
        var list = levels.map(function (l) { return l.name; });
        var text = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list.join("");
        names.forEach(function (el) { el.textContent = text; });
      }
    }).catch(function () {});
  }
})();
