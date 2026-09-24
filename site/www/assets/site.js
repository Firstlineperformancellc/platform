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

  // Prices: the settings row is public and is what the app charges from. Static numbers stay if the fetch fails.
  var SUPABASE = "https://uspbmbvoxotbelribjgo.supabase.co";
  var ANON = document.documentElement.getAttribute("data-anon");
  var money = function (cents) { return "$" + Math.round(cents / 100).toLocaleString("en-US"); };
  if (ANON && document.querySelector("[data-price]")) {
    fetch(SUPABASE + "/rest/v1/settings?select=breakdown_prices,session_prices,rules&id=eq.1", { headers: { apikey: ANON, authorization: "Bearer " + ANON } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var s = rows && rows[0]; if (!s) return;
        document.querySelectorAll("[data-price]").forEach(function (el) {
          var path = el.getAttribute("data-price").split("."); // e.g. breakdown.pro or film_room_30.ncaa
          var v = path[0] === "breakdown" ? s.breakdown_prices[path[1]] : (s.session_prices[path[0]] || {})[path[1]];
          if (typeof v === "number") el.textContent = money(v);
        });
        document.querySelectorAll("[data-rule]").forEach(function (el) {
          var v = s.rules[el.getAttribute("data-rule")]; if (v != null) el.textContent = v;
        });
      })
      .catch(function () {});
  }
})();
