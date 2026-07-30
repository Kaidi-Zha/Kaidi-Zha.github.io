// Privacy-friendly, self-owned analytics beacon.
// Sends page-view events to your own Cloudflare Worker; nothing is rendered on the page.
(function () {
  // TODO: replace YOUR_SUBDOMAIN after `wrangler deploy` (see analytics/README.md)
  var ENDPOINT = 'https://kaidi-analytics.githubio.workers.dev/collect';
  if (ENDPOINT.indexOf('YOUR_SUBDOMAIN') !== -1) return; // not deployed yet: stay silent
  try {
    var payload = JSON.stringify({
      p: location.pathname + location.search,
      r: document.referrer || ''
    });
    var blob = new Blob([payload], { type: 'text/plain' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true }).catch(function () {});
    }
  } catch (e) { /* never break the page */ }
})();
