(function () {
  function trackDownloadClick(link) {
    const payload = JSON.stringify({
      type: "download_click",
      path: new URL(link.href, window.location.href).pathname
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/event", new Blob([payload], { type: "application/json" }));
      return;
    }

    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }

  document.addEventListener("click", function (event) {
    const link = event.target.closest("a[data-analytics='download_click']");
    if (link) {
      trackDownloadClick(link);
    }
  });
})();
