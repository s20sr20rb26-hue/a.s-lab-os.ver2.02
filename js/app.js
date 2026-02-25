// js/app.js（Cell：継代メモ/日時の後編集対応）
(function () {
  const appEl = document.getElementById("app");
  const searchEl = document.getElementById("globalSearch");
  const btnExport = document.getElementById("btnExport");
  const fileImport = document.getElementById("fileImport");

  function splitList(s) {
    return (s || "").split(",").map(x => x.trim()).filter(Boolean);
  }

  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function wireReagentFormButtons() {
    const addBtn = document.getElementById("btnAddRow");
    const rowsEl = document.getElementById("compRows");
    if (!addBtn || !rowsEl) return;

    const bindDelete = () => {
      rowsEl.querySelectorAll(".comp-del").forEach(btn => {
        btn.onclick = () => btn.closest(".card")?.remove();
      });
    };

    addBtn.addEventListener("click", () => {
      const idx = rowsEl.querySelectorAll(".card").length;
      rowsEl.insertAdjacentHTML("beforeend", Render.reagentRowHtml(idx, "", "", ""));
      bindDelete();
    });

    bindDelete();
  }

  function navigate() {
    const { parts, query } = Router.parseHash();
    const [root, a] = parts;

    appEl.innerHTML = "";

    // Lists
    if (root === "protocol" || root === "reagent" || root === "duty" || root === "cell") {
      appEl.innerHTML = Render.renderList(root);
      return;
    }

    // Page detail
    if (root === "page" && a) {
      const out = Render.renderPageDetail(a);
      if (typeof out === "string") { appEl.innerHTML = out; return; }
      appEl.innerHTML = out.html;

      // wiki links
      const body = document.getElementById("pageBody");
      if (body) {
        const defaultNewType = (out.page.type === "protocol") ? "reagent" : out.page.type;
        Link.bindWikiLinks(body, { defaultNewType });
      }

      // favorite
      document.getElementById("btnFav")?.addEventListener("click", () => {
        out.page.favorite = !out.page.favorite;
        Store.upsertPage(out.page);
        navigate();
      });

      // delete
      document.getElementById("btnDel")?.addEventListener("click", () => {
        if (confirm("削除しますか？")) {
          Store.deletePage(out.page.id);
          location.hash = `#/${out.page.type}`;
        }
      });

      // protocol -> run
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
          plan: { blocks: [] },
          cellId: null
        };
        Store.updateRun(newRun);
        location.hash = `#/run/${newRun.id}`;
      });

      // cell page: add/edit/delete passage
      if (out.page.type === "cell") {
        const passAt = document.getElementById("passAt");
        const btnAddPass = document.getElementById("btnAddPass");

        if (passAt) passAt.value = toDatetimeLocal(Store.now());

        // 追加
        btnAddPass?.addEventListener("click", () => {
          const p = Store.getPage(out.page.id);
          if (!p) return;

          p.metaCell = p.metaCell || {};
          p.metaCell.passages = Array.isArray(p.metaCell.passages) ? p.metaCell.passages : [];

          const atStr = document.getElementById("passAt").value;
          const at = atStr ? Date.parse(atStr) : Store.now();
          const note = (document.getElementById("passNote").value || "").trim();

          p.metaCell.passages.unshift({ at, note });
          Store.upsertPage(p);
          navigate();
        });

        // 編集保存（行の「保存」）
        document.querySelectorAll(".pass-save").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-i"));
            const p = Store.getPage(out.page.id);
            if (!p) return;

            p.metaCell = p.metaCell || {};
            p.metaCell.passages = Array.isArray(p.metaCell.passages) ? p.metaCell.passages : [];

            const noteEl = document.querySelector(`.pass-note[data-i="${idx}"]`);
            const atEl = document.querySelector(`.pass-at[data-i="${idx}"]`);

            if (!p.metaCell.passages[idx]) return;

            if (noteEl) p.metaCell.passages[idx].note = (noteEl.value || "").trim();
            if (atEl && atEl.value) p.metaCell.passages[idx].at = Date.parse(atEl.value);

            Store.upsertPage(p);
            alert("保存した");
            // 表示も更新したいなら navigate() でもOK（値はもう反映済み）
            // navigate();
          });
        });

        // 削除
        document.querySelectorAll("[data-del-pass]").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-del-pass"));
            const p = Store.getPage(out.page.id);
            if (!p) return;

            p.metaCell = p.metaCell || {};
            p.metaCell.passages = Array.isArray(p.metaCell.passages) ? p.metaCell.passages : [];

            p.metaCell.passages.splice(idx, 1);
            Store.upsertPage(p);
            navigate();
          });
        });
      }

      return;
    }

    // New
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
          delete p.metaCell;
        } else if (p.type === "cell") {
          p.body = "";
          p.metaCell = {
            adhesion: document.getElementById("cellAdh").value,
            medium: document.getElementById("cellMedium").value.trim(),
            passageTiming: document.getElementById("cellPassTiming").value.trim(),
            passages: []
          };
          delete p.metaReagent;
        } else {
          p.body = document.getElementById("fBody")?.value || "";
          delete p.metaReagent;
          delete p.metaCell;
        }

        Store.upsertPage(p);
        location.hash = `#/page/${p.id}`;
      });

      return;
    }

    // Edit
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
          delete p.metaCell;
        } else if (p.type === "cell") {
          p.body = "";
          p.metaCell = p.metaCell || {};
          p.metaCell.adhesion = document.getElementById("cellAdh").value;
          p.metaCell.medium = document.getElementById("cellMedium").value.trim();
          p.metaCell.passageTiming = document.getElementById("cellPassTiming").value.trim();
          p.metaCell.passages = Array.isArray(p.metaCell.passages) ? p.metaCell.passages : [];
          delete p.metaReagent;
        } else {
          p.body = document.getElementById("fBody")?.value || "";
          delete p.metaReagent;
          delete p.metaCell;
        }

        Store.upsertPage(p);
        location.hash = `#/page/${p.id}`;
      });

      return;
    }

    // Run detail
    if (root === "run" && a) {
      const out = Render.renderRunDetail(a);
      if (typeof out === "string") { appEl.innerHTML = out; return; }
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

      // save cell link
      document.getElementById("btnSaveCell")?.addEventListener("click", () => {
        const v = document.getElementById("runCell").value;
        out.run.cellId = v ? v : null;
        Store.updateRun(out.run);
        alert("保存した");
        navigate();
      });

      // add block
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

      // delete block
      document.querySelectorAll("[data-del-block]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-del-block"));
          out.run.plan = out.run.plan || { blocks: [] };
          out.run.plan.blocks.splice(idx, 1);
          Store.updateRun(out.run);
          navigate();
        });
      });

      // notes
      document.getElementById("btnSaveNotes")?.addEventListener("click", () => {
        out.run.notes = document.getElementById("runNotes").value;
        Store.updateRun(out.run);
        alert("保存した");
      });

      // finish toggle
      document.getElementById("btnFinishRun")?.addEventListener("click", () => {
        out.run.finishedAt = out.run.finishedAt ? null : Store.now();
        Store.updateRun(out.run);
        navigate();
      });

      // delete run
      document.getElementById("btnDelRun")?.addEventListener("click", () => {
        if (confirm("このRunを削除しますか？")) {
          Store.deleteRun(out.run.id);
          location.hash = "#/run";
        }
      });

      return;
    }

    // Run list
    if (root === "run") {
      appEl.innerHTML = Render.renderRuns();
      return;
    }

    // Search
    if (root === "search") {
      const q = query.q || searchEl.value || "";
      const results = Store.search(q);
      appEl.innerHTML = `
        <h2>検索</h2>
        <div class="small">Enterで検索。ページを横断します。</div>
        <hr>
        <div class="list">${results.map(p=>`
          <div class="card"><h3><a href="#/page/${p.id}">${p.title}</a></h3><div class="meta"><span>${p.type}</span></div></div>
        `).join("") || `<div class="small">見つかりません</div>`}</div>
      `;
      return;
    }

    // default
    location.hash = "#/protocol";
  }

  // Search Enter
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      location.hash = `#/search?q=${encodeURIComponent(searchEl.value)}`;
    }
  });

  // Export / Import（手動同期）
btnExport.onclick = () => {
  const data = Store.exportAll();
  if (!data) return alert("データがありません");

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  const filename =
    `lab_os_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

  console.log("export filename:", filename); // ←確認用

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
};
  
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
      Store.importAll(obj);
    } catch (e) {
      alert("Import失敗: " + (e?.message || e));
      fileImport.value = "";
    }
  });

  window.addEventListener("hashchange", navigate);
  navigate();
})();



