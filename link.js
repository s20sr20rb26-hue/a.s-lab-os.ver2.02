// js/link.js（[[リンク]] 変換 + クリックでページへ）
(function () {
  function wikiToHtml(text) {
    const esc = (s) => (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const safe = esc(text);

    return safe
      .replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
        const n = name.trim();
        return `<span class="link" data-wiki="${esc(n)}">[[${esc(n)}]]</span>`;
      })
      .replace(/\n/g, "<br>");
  }

  function bindWikiLinks(containerEl, opts) {
    const defaultNewType = opts?.defaultNewType || "protocol";
    if (!containerEl) return;

    containerEl.querySelectorAll("[data-wiki]").forEach(el => {
      el.addEventListener("click", () => {
        const name = el.getAttribute("data-wiki");
        const page = Store.findPageByTitleOrAlias(name);

        if (page) {
          location.hash = `#/page/${page.id}`;
        } else {
          // 存在しない場合は新規作成へ（type指定）
          location.hash = `#/new?type=${encodeURIComponent(defaultNewType)}&title=${encodeURIComponent(name)}`;
        }
      });
    });
  }

  window.Link = { wikiToHtml, bindWikiLinks };
})();