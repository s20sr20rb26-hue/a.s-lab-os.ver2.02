// js/render.js（Cell：継代メモ/日時の後編集対応）
(function () {
  function setActiveTab(tab) {
    document.querySelectorAll(".tabs a").forEach(a => a.classList.remove("active"));
    const el = document.querySelector(`.tabs a[data-tab="${tab}"]`);
    if (el) el.classList.add("active");
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString("ja-JP");
  }
  function fmtHM(ts) {
    const d = new Date(ts);
    return d.toLocaleString("ja-JP", { hour12: false });
  }
  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function label(type) {
    return ({
      protocol: "プロトコル",
      reagent: "試薬",
      duty: "当番",
      run: "Run",
      cell: "細胞"
    })[type] || type;
  }

  function escapeHtml(s) {
    return (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  function escapeAttr(s) { return escapeHtml(s).replaceAll('"',"&quot;"); }

  function wikiInline(text) {
    const esc = (s) => (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const safe = esc(text);
    return safe.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const n = name.trim();
      return `<span class="link" data-wiki="${esc(n)}">[[${esc(n)}]]</span>`;
    });
  }

  function pageCard(p) {
    const tags = (p.tags || []).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("");
    const fav = p.favorite ? "⭐" : "";
    return `
      <div class="card">
        <h3>${fav} <a href="#/page/${p.id}">${escapeHtml(p.title)}</a></h3>
        <div class="meta">
          <span>${label(p.type)}</span>
          <span>更新: ${fmtTime(p.updatedAt)}</span>
        </div>
        <div class="pills">${tags}</div>
      </div>
    `;
  }

  function renderList(type) {
    setActiveTab(type);
    const items = Store.listPages(type);
    return `
      <div class="row">
        <div>
          <h2>${label(type)} 一覧</h2>
          <div class="small">本文に <b>[[試薬名]]</b> と書くとリンクになります。</div>
        </div>
        <div style="text-align:right; min-width:200px;">
          <a class="btn primary" href="#/new?type=${type}">＋ ${label(type)}を追加</a>
        </div>
      </div>
      <hr>
      <div class="list">
        ${items.map(pageCard).join("") || `<div class="small">まだ何もありません</div>`}
      </div>
    `;
  }

  // ===== Reagent meta =====
  function getReagentMeta(p) {
    const m = p.metaReagent;
    if (!m || typeof m !== "object") return { composition: [] };
    if (!Array.isArray(m.composition)) return { composition: [] };
    return { composition: m.composition };
  }

  function renderCompositionTable(rows) {
    if (!rows.length) return `<div class="small">未登録</div>`;
    return `
      <div style="overflow-x:auto;">
        <table cellpadding="6">
          <tr><th>薬品</th><th>量</th><th>場所</th></tr>
          ${rows.map(r => `
            <tr>
              <td>${wikiInline(r.name || "")}</td>
              <td>${escapeHtml(r.amount || "")}</td>
              <td>${escapeHtml(r.location || "")}</td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;
  }

  function reagentRowHtml(i, name, amount, location) {
    return `
      <div class="card" style="padding:10px;">
        <div class="row">
          <label>薬品名
            <input class="comp-name" data-i="${i}" value="${escapeAttr(name || "")}" placeholder="例：FBS / [[DMEM]]" />
          </label>
          <label>量
            <input class="comp-amount" data-i="${i}" value="${escapeAttr(amount || "")}" placeholder="例：50 mL" />
          </label>
          <label>場所
            <input class="comp-location" data-i="${i}" value="${escapeAttr(location || "")}" placeholder="例：-20℃ / 冷蔵庫2段目" />
          </label>
        </div>
        <div style="text-align:right;">
          <button class="btn comp-del" data-i="${i}" type="button">削除</button>
        </div>
      </div>
    `;
  }

  function readReagentCompositionFromDOM() {
    const container = document.getElementById("compRows");
    if (!container) return [];
    const cards = Array.from(container.querySelectorAll(".card"));
    return cards.map(card => {
      const name = card.querySelector(".comp-name")?.value?.trim() || "";
      const amount = card.querySelector(".comp-amount")?.value?.trim() || "";
      const location = card.querySelector(".comp-location")?.value?.trim() || "";
      return { name, amount, location };
    }).filter(r => r.name || r.amount || r.location);
  }

  // ===== Cell meta =====
  function getCellMeta(p) {
    const m = p.metaCell;
    if (!m || typeof m !== "object") {
      return { adhesion: "付着", medium: "", passageTiming: "", passages: [] };
    }
    return {
      adhesion: m.adhesion || "付着",
      medium: m.medium || "",
      passageTiming: m.passageTiming || "",
      passages: Array.isArray(m.passages) ? m.passages : []
    };
  }

  function cellInfoTable(meta) {
    return `
      <div style="overflow-x:auto;">
        <table cellpadding="6">
          <tr><th>細胞の性質</th><td>${escapeHtml(meta.adhesion)}</td></tr>
          <tr><th>培地</th><td>${wikiInline(meta.medium)}</td></tr>
          <tr><th>継代タイミング</th><td>${escapeHtml(meta.passageTiming)}</td></tr>
        </table>
      </div>
    `;
  }

  // ★ここが「後から編集」対応（日時+メモ+保存）
  function passageTable(passages) {
    if (!passages.length) return `<div class="small">まだ継代記録がありません</div>`;
    return `
      <div style="overflow-x:auto;">
        <table cellpadding="6">
          <tr><th>#</th><th>日時</th><th>メモ</th><th></th></tr>
          ${passages.map((x, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>
                <input type="datetime-local"
                  class="pass-at"
                  data-i="${i}"
                  value="${escapeAttr(toDatetimeLocal(x.at || Date.now()))}" />
              </td>
              <td>
                <input class="pass-note"
                  data-i="${i}"
                  value="${escapeAttr(x.note || "")}"
                  placeholder="例：1:5、状態良い、P12 など" />
              </td>
              <td style="white-space:nowrap;">
                <button class="btn pass-save" data-i="${i}">保存</button>
                <button class="btn" data-del-pass="${i}">削除</button>
              </td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;
  }

  // ===== Detail pages =====
  function renderPageDetail(id) {
    const p = Store.getPage(id);
    if (!p) return `<div class="card">見つかりません</div>`;

    setActiveTab(p.type);
    const tags = (p.tags || []).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("");

    // Cell detail
  if (p.type === "cell") {
  const meta = getCellMeta(p);
  const runs = Store.listRunsByCellId(p.id);

  // 直近3件だけ（プレビュー用）
  const recent = (meta.passages || []).slice(0, 3);

  const passagePreview = recent.length
    ? `
      <div style="overflow-x:auto;">
        <table cellpadding="6">
          <tr><th>#</th><th>日時</th><th>メモ</th></tr>
          ${recent.map((x, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${fmtHM(x.at || Date.now())}</td>
              <td>${escapeHtml(x.note || "")}</td>
            </tr>
          `).join("")}
        </table>
      </div>
      <div class="small">※ 直近3件のみ表示。全部見る/編集する場合は下の「継代（全件/編集）」を開く。</div>
    `
    : `<div class="small">まだ継代記録がありません（下の「継代（全件/編集）」から追加できます）</div>`;

  const runsHtml = runs.length ? `
    <div class="list">
      ${runs.map(r => `
        <div class="card">
          <h3><a href="#/run/${r.id}">${escapeHtml(r.protocolTitleSnapshot || "Run")}</a></h3>
          <div class="meta">
            <span>${r.finishedAt ? "完了" : "進行中"}</span>
            <span>開始: ${fmtHM(r.startedAt)}</span>
          </div>
          <div class="small">${escapeHtml(r.notes || "")}</div>
        </div>
      `).join("")}
    </div>
  ` : `<div class="small">この細胞に紐付いたRunはまだありません（Run詳細で細胞を選ぶと紐付きます）</div>`;

  const html = `
    <div class="row">
      <div>
        <h2>${escapeHtml(p.title)}</h2>
        <div class="meta">
          <span>${label(p.type)}</span>
          <span>更新: ${fmtTime(p.updatedAt)}</span>
        </div>
        <div class="pills">${tags}</div>
      </div>
      <div style="text-align:right; min-width:240px;">
        <button class="btn" id="btnFav">${p.favorite ? "★ お気に入り解除" : "☆ お気に入り"}</button>
        <a class="btn" href="#/edit/${p.id}">編集</a>
        <button class="btn" id="btnDel">削除</button>
      </div>
    </div>

    <hr>

    <div id="pageBody">
      <div class="card">
        <h3>【細胞情報】</h3>
        ${cellInfoTable(meta)}
      </div>

      <div class="card">
        <h3>【継代（直近3回）】</h3>
        ${passagePreview}
      </div>

      <!-- 折りたたみ：開いたときだけ全件＆編集UI -->
      <details class="card details">
        <summary class="details-summary">継代（全件/編集）を開く</summary>

        <div style="margin-top:12px;">
          <div class="row">
            <label>日時（追加用）
              <input id="passAt" type="datetime-local" />
            </label>
            <label>メモ（追加用）
              <input id="passNote" placeholder="例：1:5、状態良い など" />
            </label>
            <div style="align-self:end; text-align:right; min-width:180px;">
              <button class="btn primary" id="btnAddPass">＋継代記録</button>
            </div>
          </div>

          ${passageTable(meta.passages)}
          <div class="small">※ 行を編集したら「保存」を押して反映</div>
        </div>
      </details>

      <div class="card">
        <h3>【実験】</h3>
        <div class="small">Run（実験記録）側で「使用細胞」を選ぶと、ここに自動で一覧が出ます。</div>
        <hr>
        ${runsHtml}
      </div>
    </div>
  `;
  return { html, page: p };
}
    // Reagent detail
    if (p.type === "reagent") {
      const meta = getReagentMeta(p);
      const methodHtml = p.body ? Link.wikiToHtml(p.body) : `<div class="small">未登録</div>`;
      const html = `
        <div class="row">
          <div>
            <h2>${escapeHtml(p.title)}</h2>
            <div class="meta">
              <span>${label(p.type)}</span>
              <span>更新: ${fmtTime(p.updatedAt)}</span>
            </div>
            <div class="pills">${tags}</div>
          </div>
          <div style="text-align:right; min-width:240px;">
            <button class="btn" id="btnFav">${p.favorite ? "★ お気に入り解除" : "☆ お気に入り"}</button>
            <a class="btn" href="#/edit/${p.id}">編集</a>
            <button class="btn" id="btnDel">削除</button>
          </div>
        </div>
        <hr>
        <div id="pageBody">
          <div class="card">
            <h3>【組成】</h3>
            ${renderCompositionTable(meta.composition)}
          </div>
          <div class="card">
            <h3>【調製法】</h3>
            <div>${methodHtml}</div>
          </div>
        </div>
      `;
      return { html, page: p };
    }

    // default (protocol/duty)
    const bodyHtml = Link.wikiToHtml(p.body || "");
    const html = `
      <div class="row">
        <div>
          <h2>${escapeHtml(p.title)}</h2>
          <div class="meta">
            <span>${label(p.type)}</span>
            <span>更新: ${fmtTime(p.updatedAt)}</span>
          </div>
          <div class="pills">${tags}</div>
        </div>
        <div style="text-align:right; min-width:240px;">
          <button class="btn" id="btnFav">${p.favorite ? "★ お気に入り解除" : "☆ お気に入り"}</button>
          <a class="btn" href="#/edit/${p.id}">編集</a>
          <button class="btn" id="btnDel">削除</button>
          ${p.type === "protocol" ? `<button class="btn primary" id="btnRun">▶ 実行を開始</button>` : ""}
        </div>
      </div>
      <hr>
      <div class="card">
        <div id="pageBody">${bodyHtml}</div>
      </div>
    `;
    return { html, page: p };
  }

  // ===== Editor =====
  function renderEditor(mode, id, preset) {
    const p = mode === "edit"
      ? Store.getPage(id)
      : ({
          id: Store.uuid(),
          type: preset?.type || "protocol",
          title: preset?.title || "",
          aliases: [],
          tags: [],
          body: "",
          updatedAt: Store.now(),
          favorite: false
        });

    if (!p) return { html: `<div class="card">見つかりません</div>`, page: null };
    setActiveTab(p.type);

    const commonTop = `
      <h2>${mode === "edit" ? "編集" : "新規作成"}</h2>
      <div class="card">
        <div class="row">
          <label>種類
            <select id="fType">
              ${["protocol","cell","reagent","duty"].map(t => `
                <option value="${t}" ${p.type===t?"selected":""}>${label(t)}</option>
              `).join("")}
            </select>
          </label>
          <label>タイトル（=名前）
            <input id="fTitle" value="${escapeAttr(p.title)}" />
          </label>
        </div>

        <div class="row">
          <label>別名（カンマ区切り）
            <input id="fAliases" value="${escapeAttr((p.aliases||[]).join(", "))}" />
          </label>
          <label>タグ（カンマ区切り）
            <input id="fTags" value="${escapeAttr((p.tags||[]).join(", "))}" />
          </label>
        </div>
    `;

    const commonBottom = `
        <div class="row">
          <label style="min-width:220px;">
            <input type="checkbox" id="fFav" ${p.favorite ? "checked":""} />
            お気に入り
          </label>
          <div style="text-align:right; min-width:240px;">
            <button class="btn primary" id="btnSave">保存</button>
            <a class="btn" href="#/page/${p.id}">キャンセル</a>
          </div>
        </div>
      </div>
    `;

    if (p.type === "cell") {
      const m = (p.metaCell || {});
      const adhesion = m.adhesion || "付着";
      const medium = m.medium || "";
      const passageTiming = m.passageTiming || "";
      const html = `
        ${commonTop}

        <hr>
        <h3>【細胞情報】</h3>
        <div class="row">
          <label>細胞の性質
            <select id="cellAdh">
              <option value="付着" ${adhesion==="付着"?"selected":""}>付着</option>
              <option value="浮遊" ${adhesion==="浮遊"?"selected":""}>浮遊</option>
            </select>
          </label>
          <label>培地（名前）
            <input id="cellMedium" value="${escapeAttr(medium)}" placeholder="例：DMEM + 10%FBS" />
          </label>
        </div>

        <div class="row">
          <label>継代のタイミング
            <input id="cellPassTiming" value="${escapeAttr(passageTiming)}" placeholder="例：80% confluentで1:5、2-3日に1回" />
          </label>
        </div>

        <div class="small">※ 継代の日時ログは詳細ページで追加・編集できます。</div>

        ${commonBottom}
      `;
      return { html, page: p };
    }

    if (p.type === "reagent") {
      const meta = getReagentMeta(p);
      const rows = meta.composition || [];
      const compRowsHtml = rows.length
        ? rows.map((r,i)=>reagentRowHtml(i, r.name, r.amount, r.location)).join("")
        : reagentRowHtml(0,"","","");
      const html = `
        ${commonTop}

        <hr>
        <h3>【組成】</h3>
        <div class="card">
          <div id="compRows" class="list" style="gap:8px;">
            ${compRowsHtml}
          </div>
          <div style="margin-top:10px; text-align:right;">
            <button class="btn" id="btnAddRow" type="button">＋ 行を追加</button>
          </div>
        </div>

        <h3>【調製法】</h3>
        <label><textarea id="fMethod">${escapeHtml(p.body || "")}</textarea></label>

        ${commonBottom}
      `;
      return { html, page: p };
    }

    const template =
      (p.type === "protocol")
        ? `## 目的

## 準備物
- [[試薬A]]
- [[試薬B]]

## 手順
1.
2.
3.

## インキュベート/待ち
- 例：24h（37℃ 5%CO2）

## 注意・コツ
- 
`
        : `## 手順
1.
2.

## 注意
- 
`;
    const showTemplate = !(p.body && p.body.trim().length > 0);

    const html = `
      ${commonTop}
      <label>
        本文（Markdown風 + [[リンク]]）
        <textarea id="fBody">${escapeHtml(showTemplate ? template : (p.body || ""))}</textarea>
      </label>
      ${commonBottom}
    `;
    return { html, page: p };
  }

  // ===== Run list/detail =====
  function runCard(r) {
    const title = r.protocolTitleSnapshot || "Run";
    const status = r.finishedAt ? "完了" : "進行中";
    const cellTitle = r.cellId ? (Store.getPage(r.cellId)?.title || "") : "";
    return `
      <div class="card">
        <h3><a href="#/run/${r.id}">${escapeHtml(title)}</a></h3>
        <div class="meta">
          <span>${status}</span>
          <span>開始: ${fmtHM(r.startedAt)}</span>
          ${cellTitle ? `<span>細胞: ${escapeHtml(cellTitle)}</span>` : ""}
        </div>
        <div class="small">${escapeHtml(r.notes || "")}</div>
      </div>
    `;
  }

  function renderRuns() {
    setActiveTab("run");
    const runs = Store.listRuns();
    return `
      <div class="row">
        <div>
          <h2>Run（実験記録）</h2>
          <div class="small">プロトコル詳細の「▶ 実行を開始」から作れます。</div>
        </div>
      </div>
      <hr>
      <div class="list">${runs.map(runCard).join("") || `<div class="small">まだRunがありません</div>`}</div>
    `;
  }

  function renderRunDetail(runId) {
    setActiveTab("run");
    const run = Store.getRun(runId);
    if (!run) return `<div class="card">Runが見つかりません</div>`;

    const blocks = (run.plan?.blocks || []);
    const cells = Store.listPages("cell");

    const cellOptions = [`<option value="">（未設定）</option>`].concat(
      cells.map(c => `<option value="${c.id}" ${run.cellId===c.id?"selected":""}>${escapeHtml(c.title)}</option>`)
    ).join("");

    const blocksHtml = `
      <div class="card">
        <h3>⏳ インキュベート計画</h3>
        ${blocks.length ? `
          <div style="overflow-x:auto;">
            <table cellpadding="6">
              <tr><th>#</th><th>内容</th><th>開始</th><th>終了</th><th></th></tr>
              ${blocks.map((b,i)=>`
                <tr>
                  <td>${i+1}</td>
                  <td>${escapeHtml(b.label || "Incubate")}</td>
                  <td>${fmtHM(b.startAt)}</td>
                  <td>${fmtHM(b.endAt)}</td>
                  <td><button class="btn" data-del-block="${i}">削除</button></td>
                </tr>
              `).join("")}
            </table>
          </div>
        ` : `<div class="small">まだ区間がありません</div>`}
      </div>
    `;

    const html = `
      <div class="row">
        <div>
          <h2>Run</h2>
          <div class="meta">
            <span>プロトコル: ${escapeHtml(run.protocolTitleSnapshot || "Run")}</span>
            <span>${run.finishedAt ? "完了" : "進行中"}</span>
          </div>
        </div>
        <div style="text-align:right; min-width:280px;">
          <button class="btn" id="btnFinishRun">${run.finishedAt ? "完了解除" : "完了にする"}</button>
          <button class="btn" id="btnDelRun">Run削除</button>
        </div>
      </div>

      <hr>

      <div class="card">
        <h3>🧫 使用細胞</h3>
        <div class="row">
          <label>細胞
            <select id="runCell">${cellOptions}</select>
          </label>
          <div style="align-self:end; text-align:right; min-width:180px;">
            <button class="btn primary" id="btnSaveCell">保存</button>
          </div>
        </div>
        <div class="small">ここで選んだ細胞が「細胞ページ」の【実験】に表示されます。</div>
      </div>

      <div class="card">
        <h3>🕒 開始時刻（基準）</h3>
        <div class="row">
          <label>開始時刻
            <input id="runStart" type="datetime-local" />
          </label>
          <div style="align-self:end; text-align:right; min-width:180px;">
            <button class="btn primary" id="btnSetStart">保存</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>➕ インキュベート区間</h3>
        <div class="row">
          <label>ラベル
            <input id="blkLabel" placeholder="例：培養（TMZ処理）" />
          </label>
          <label>継続時間（時間）
            <input id="blkHours" type="number" step="0.1" placeholder="例：24" />
          </label>
        </div>
        <div class="row">
          <label>開始時刻（空なら直前の終了 or 開始時刻）
            <input id="blkStart" type="datetime-local" />
          </label>
          <div style="align-self:end; text-align:right; min-width:180px;">
            <button class="btn primary" id="btnAddBlock">追加</button>
          </div>
        </div>
      </div>

      ${blocksHtml}

      <div class="card">
        <h3>📝 メモ</h3>
        <textarea id="runNotes">${escapeHtml(run.notes || "")}</textarea>
        <div style="text-align:right; margin-top:10px;">
          <button class="btn primary" id="btnSaveNotes">メモ保存</button>
        </div>
      </div>
    `;
    return { html, run };
  }

  window.Render = {
    renderList,
    renderPageDetail,
    renderEditor,
    renderRuns,
    renderRunDetail,
    reagentRowHtml,
    readReagentCompositionFromDOM
  };
})();
