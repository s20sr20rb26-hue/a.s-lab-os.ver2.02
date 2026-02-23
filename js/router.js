// js/router.js
(function () {
  function parseHash() {
    const raw = location.hash || "#/protocol";
    const h = raw.replace(/^#/, "");
    const [path, qs] = h.split("?");
    const parts = path.split("/").filter(Boolean);

    const query = {};
    if (qs) {
      const sp = new URLSearchParams(qs);
      for (const [k, v] of sp.entries()) query[k] = v;
    }

    return { parts, query };
  }

  window.Router = { parseHash };
})();
