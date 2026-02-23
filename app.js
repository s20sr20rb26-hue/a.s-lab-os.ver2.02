// js/app.js（ルーティング + ボタン配線 + Export/Import）
(function () {
  const appEl = document.getElementById("app");
  const searchEl = document.getElementById("globalSearch");
  const btnNew = document.getElementById("btnNew");

  const btnExport = document.getElementById("btnExport");
  const fileImport = document.getElementById("fileImport");

  function splitList(s) {
    return (s || "").split(",").map(x => x.trim()).filter(Boolean);
  }

  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function wireReagentFormButtons() {
    const addBtn = document.getElementById("btnAddRow");
    const rowsEl = document.getElementById("compRows");
    if (!addBtn || !rowsEl) return;

    const bindDeleteButtons = () => {
      rowsEl.querySelectorAll(".comp-del").forEach(btn => {
        btn.onclick = () => btn.closest(".card")?.remove();
      });
    };

    addBtn.addEventListener("click", () => {
      const idx = rowsEl.querySelectorAll(".card").length;
      rowsEl.insertAdjacentHTML("beforeend", Render.reagentRowHtml(idx, "", "", ""));
      bindDeleteButtons();
    });

    bindDeleteButtons();
  }

  function navigate() {
    const { parts, query } = Router.parseHash();
    const [root, a] = parts;

    appEl.innerHTML = "";

    // 一覧
    if (root === "protocol" || root === "reagent" || root === "duty") {
      appEl.innerHTML = Render.renderList(root);
      return;
    }

    // 詳細
    if (root === "page" && a) {
      const out = Render.renderPageDetail(a);
      if (typeof out === "string") {
        appEl.innerHTML = out;
        return;
      }
      appEl.innerHTML = out.html;

      // Wikiリンク
      const body = document.getElementById("pageBody");
      if (body) {
        const defaultNewType = (out.page.type === "protocol") ? "reagent" : out.page.type;
        Link.bindWikiLinks(body, { defaultNewType });
      }

      document.getElementById("btnFav")?.addEventListener("click", () => {
        out.page.favorite = !out.page.favorite;
        Store.upsertPage(out.page);
        navigate();
      });

      document.getElementById("btnDel")?.addEventListener("click", () => {
        if (confirm("削除しますか？")) {
          Store.deletePage(out.page.id);
          location.hash = `#/${out.page.type}`;
        }
      });

      // Run開始
      document.getElementById("btnRun")?.addEventListener("click", () => {
        const proto = out.page;
        const newRun = {
          id: Store.uuid(),
          protocolId: proto.id,
          protocolTitleSnapshot: proto.title,
          protocolBodySnapshot: proto.body,
          startedAt: Store.now(),
          finishedAt: null,
          notes: "",
          plan: { blocks: [] }
        };
        Store.updateRun(newRun);
        location.hash = `#/run/${newRun.id}`;
      });

      return;
    }

    // 新規
    if (root === "new") {
      const preset = { type: query.type || "protocol", title: query.title || "" };
      const out = Render.renderEditor("new", null, preset);
      appEl.innerHTML = out.html;
      wireReagentFormButtons();

      document.getElementById("btnSave")?.addEventListener("click", () => {
        const p = out.page;
        p.type = document.getElementById("fType").value;
        p.title = document.getElementById("fTitle").value.trim();
        p.aliases = splitList(document.getElementById("fAliases").value);
        p.tags = splitList(document.getElementById("fTags").value);
        p.favorite = document.getElementById("fFav").checked;

        if (!p.title) return alert("タイトルは必須です");

        if (p.type === "reagent") {
          p.body = document.getElementById("fMethod")?.value || "";
          p.metaReagent = { composition: Render.readReagentCompositionFromDOM() };
        } else {
          p.body = document.getElementById("fBody")?.value || "";
          delete p.metaReagent;
        }

        Store.upsertPage(p);
        location.hash = `#/page/${p.id}`;
      });

      return;
    }

    // 編集
    if (root === "edit" && a) {
      const out = Render.renderEditor("edit", a, null);
      appEl.innerHTML = out.html;
      wireReagentFormButtons();

      document.getElementById("btnSave")?.addEventListener("click", () => {
        const p = out.page;
        p.type = document.getElementById("fType").value;
        p.title = document.getElementById("fTitle").value.trim();
        p.aliases = splitList(document.getElementById("fAliases").value);
        p.tags = splitList(document.getElementById("fTags").value);
        p.favorite = document.getElementById("fFav").checked;

        if (!p.title) return alert("タイトルは必須です");

        if (p.type === "reagent") {
          p.body = document.getElementById("fMethod")?.value || "";
          p.metaReagent = { composition: Render.readReagentCompositionFromDOM() };
        } else {
          p.body = document.getElementById("fBody")?.value || "";
          delete p.metaReagent;
        }

        Store.upsertPage(p);
        location.hash = `#/page/${p.id}`;
      });

      return;
    }

    // Run詳細（先）
    if (root === "run" && a) {
      const out = Render.renderRunDetail(a);
      if (typeof out === "string") {
        appEl.innerHTML = out;
        return;
      }
      appEl.innerHTML = out.html;

      const startInput = document.getElementById("runStart");
      if (startInput) startInput.value = toDatetimeLocal(out.run.startedAt || Store.now());

      document.getElementById("btnSetStart")?.addEventListener("click", () => {
        const v = document.getElementById("runStart").value;
        if (!v) return alert("開始時刻を入力してね");
        out.run.startedAt = Date.parse(v);
        out.run.plan = out.run.plan || { blocks: [] };
        Store.updateRun(out.run);
        navigate();
      });

      document.getElementById("btnAddBlock")?.addEventListener("click", () => {
        const label = document.getElementById("blkLabel").value.trim() || "Incubate";
        const hours = Number(document.getElementById("blkHours").value);
        if (!Number.isFinite(hours) || hours <= 0) return alert("継続時間（時間）を入れてね");

        out.run.plan = out.run.plan || { blocks: [] };
        const blocks = out.run.plan.blocks;

        const startRaw = document.getElementById("blkStart").value;
        let startAt = startRaw ? Date.parse(startRaw) : null;

        if (!startAt) {
          const last = blocks.length ? blocks[blocks.length - 1] : null;
          startAt = last?.endAt || out.run.startedAt || Store.now();
        }

        const endAt = startAt + hours * 60 * 60 * 1000;
        blocks.push({ label, startAt, endAt });

        Store.updateRun(out.run);
        navigate();
      });

      document.querySelectorAll("[data-del-block]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-del-block"));
          out.run.plan = out.run.plan || { blocks: [] };
          out.run.plan.blocks.splice(idx, 1);
          Store.updateRun(out.run);
          navigate();
        });
      });

      document.getElementById("btnSaveNotes")?.addEventListener("click", () => {
        out.run.notes = document.getElementById("runNotes").value;
        Store.updateRun(out.run);
        alert("保存した");
      });

      document.getElementById("btnFinishRun")?.addEventListener("click", () => {
        out.run.finishedAt = out.run.finishedAt ? null : Store.now();
        Store.updateRun(out.run);
        navigate();
      });

      document.getElementById("btnDelRun")?.addEventListener("click", () => {
        if (confirm("このRunを削除しますか？")) {
          Store.deleteRun(out.run.id);
          location.hash = "#/run";
        }
      });

      return;
    }

    // Run一覧（後）
    if (root === "run") {
      appEl.innerHTML = Render.renderRuns();
      return;
    }

    // 検索
    if (root === "search") {
      const q = query.q || searchEl.value || "";
      appEl.innerHTML = Render.renderSearch(q);
      return;
    }

    // デフォルト
    location.hash = "#/protocol";
  }

  // 検索 enter
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      location.hash = `#/search?q=${encodeURIComponent(searchEl.value)}`;
    }
  });

  // 新規（今のタブに合わせる）
  btnNew.addEventListener("click", () => {
    const { parts } = Router.parseHash();
    const t = parts[0];
    const type = (t === "protocol" || t === "reagent" || t === "duty") ? t : "protocol";
    location.hash = `#/new?type=${type}`;
  });

  // Export：スマホでも確実に動く「新規タブでJSON表示」方式
 btnExport?.addEventListener("click", async () => {
  const data = Store.exportAll();
  if (!data) return alert("データがありません");

  const json = JSON.stringify(data, null, 2);
  const filename = `lab-os-backup-${new Date().toISOString().slice(0,10)}.json`;

  try {
    // ① スマホ向け：共有（Drive/LINE/メール）で保存できる
    const file = new File([json], filename, { type: "application/json" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Lab OS Backup",
        text: "Lab OSのバックアップJSONです",
        files: [file]
      });
      return;
    }
  } catch (e) {
    // share失敗したら下のフォールバックへ
  }

  // ② フォールバック：blobダウンロード（PC向け/一部Androidでも動く）
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    alert("ダウンロードを開始しました（できない場合はPCでExportしてください）");
  } catch (e) {
    alert("Exportに失敗しました。PCでExportするのが確実です。");
  }
});

  // Import：label内inputのchangeで確実に発火
  fileImport?.addEventListener("change", async () => {
    const file = fileImport.files?.[0];
    if (!file) return;

    if (!confirm("Importすると、この端末のデータは上書きされます。続けますか？")) {
      fileImport.value = "";
      return;
    }

    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      Store.importAll(obj); // 成功したらリロード
    } catch (e) {
      alert("Import失敗: " + (e?.message || e));
      fileImport.value = "";
    }
  });

  window.addEventListener("hashchange", navigate);
  navigate();
})();