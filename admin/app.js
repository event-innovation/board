// マーケ管理アプリ。データは非公開リポジトリ（marketing-agent）にあり、
// この端末に保存したトークンで GitHub API から直接読み書きする。サーバーは持たない。
"use strict";

const AGENT_REPO = "dotdelibiz-hue/marketing-agent";
const API = "https://api.github.com";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない端末でも動かす */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
};

let S = { projects: [], proj: null, drafts: [], prospects: [], state: {}, stateSha: null, prs: [], cases: [], filter: "due" };

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const tok = store.get("gh_token");
  const res = await fetch(API + path, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, ...(opts.headers || {}) },
  });
  if (res.status === 401) { store.del("gh_token"); show("setup"); throw new Error("トークンが無効です。もう一度貼ってください"); }
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${res.status}`);
  return res;
}
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
async function getJson(repo, path) {
  const r = await gh(`/repos/${repo}/contents/${enc(path)}`);
  if (r.status === 404) return { data: null, sha: null };
  const j = await r.json();
  const text = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  return { data: JSON.parse(text), sha: j.sha };
}
async function putJson(repo, path, data, sha, msg) {
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 1) + "\n");
  let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const r = await gh(`/repos/${repo}/contents/${enc(path)}`, { method: "PUT", body: JSON.stringify({ message: msg, content: btoa(bin), sha: sha || undefined }) });
  if (r.status === 409 || r.status === 422) return null; // 他で更新された
  return (await r.json()).content.sha;
}
async function getBlob(repo, path) {
  const r = await gh(`/repos/${repo}/contents/${enc(path)}`, { headers: { Accept: "application/vnd.github.raw" } });
  if (!r.ok) throw new Error("ファイルを読めませんでした");
  return r.blob();
}

// ---------- 状態の保存（他の端末と同時に押しても消えないよう、読み直してから足す） ----------
async function updateState(fn, msg) {
  for (let i = 0; i < 3; i++) {
    const cur = await getJson(AGENT_REPO, `projects/${S.proj.id}/state.json`);
    const st = cur.data || {};
    fn(st);
    const sha = await putJson(AGENT_REPO, `projects/${S.proj.id}/state.json`, st, cur.sha, msg);
    if (sha) { S.state = st; S.stateSha = sha; return; }
  }
  throw new Error("保存できませんでした。もう一度押してください");
}
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

// ---------- 読み込み ----------
async function load() {
  toast("読み込み中…");
  const tree = await (await gh(`/repos/${AGENT_REPO}/git/trees/HEAD?recursive=1`)).json();
  const paths = (tree.tree || []).map((t) => t.path);
  const projIds = paths.filter((p) => /^projects\/[^/]+\/project\.json$/.test(p)).map((p) => p.split("/")[1]);
  S.projects = await Promise.all(projIds.map(async (id) => (await getJson(AGENT_REPO, `projects/${id}/project.json`)).data));
  const want = store.get("proj");
  S.proj = S.projects.find((p) => p.id === want) || S.projects[0];
  if (!S.proj) { toast("プロジェクトがありません"); return; }
  const sel = $("#projSel");
  sel.innerHTML = S.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  sel.value = S.proj.id;
  sel.classList.toggle("hidden", S.projects.length < 2);
  $("#projName").textContent = S.proj.name;

  const base = `projects/${S.proj.id}/`;
  const draftPaths = paths.filter((p) => p.startsWith(base + "drafts/") && p.endsWith(".json")).sort().reverse().slice(0, 40);
  const [drafts, pros, st, prs, cases] = await Promise.all([
    Promise.all(draftPaths.map(async (p) => (await getJson(AGENT_REPO, p)).data)),
    getJson(AGENT_REPO, base + "prospects.json"),
    getJson(AGENT_REPO, base + "state.json"),
    gh(`/repos/${S.proj.site_repo}/pulls?state=open&per_page=50`).then((r) => r.json()).catch(() => []),
    fetch(S.proj.articles.source_url, { cache: "no-store" }).then((r) => r.json()).then((j) => j.cases).catch(() => []),
  ]);
  S.drafts = drafts.filter(Boolean).sort((a, b) => a.suggest_at.localeCompare(b.suggest_at));
  S.prospects = pros.data || [];
  S.state = st.data || {};
  S.stateSha = st.sha;
  const label = S.proj.articles.pr_label || "article";
  S.prs = (Array.isArray(prs) ? prs : []).filter((p) => p.labels.some((l) => l.name === label));
  S.cases = cases || [];
  toast("");
  render();
}

// ---------- 画面 ----------
const fmt = (iso) => new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const dstate = (d) => (S.state.drafts || {})[d.id] || {};
const isDone = (d) => { const s = dstate(d); return s.skipped || (s.x && s.ig); };
const due = () => S.drafts.filter((d) => d.suggest_at <= now() && !isDone(d));
const followNow = () => S.prospects.find((p) => p.show_after <= now() && !(S.state.prospects || {})[p.id]);

function badge(id, n) { const b = $(id); b.textContent = n; b.classList.toggle("hidden", !n); }

function render() {
  const d = due(), f = followNow();
  badge("#bPosts", d.length); badge("#bArticles", S.prs.length); badge("#bFollow", f ? 1 : 0);
  const items = [];
  if (d.length) items.push(`<a class="card todo" href="#posts"><b>${d.length}件</b> 投稿できる下書きがあります<small>${esc(d[0].title)}</small></a>`);
  if (S.prs.length) items.push(`<a class="card todo" href="#articles"><b>${S.prs.length}件</b> 承認待ちの記事があります<small>${esc(S.prs[0].title)}</small></a>`);
  if (f) items.push(`<a class="card todo" href="#follow"><b>1件</b> フォロー候補があります<small>${esc(f.name)}</small></a>`);
  const next = S.drafts.find((x) => x.suggest_at > now());
  $("#todo").innerHTML = (items.join("") || `<div class="card calm">いまやることはありません 🎉</div>`) +
    (next ? `<p class="note">次の投稿予定：${fmt(next.suggest_at)}「${esc(next.title)}」</p>` : "");
  renderPosts(); renderArticles(); renderFollow(); renderStats();
}

function renderPosts() {
  let list;
  if (S.filter === "due") list = due();
  else if (S.filter === "later") list = S.drafts.filter((d) => d.suggest_at > now() && !isDone(d));
  else list = S.drafts.filter(isDone).reverse();
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.f === S.filter));
  $("#postList").innerHTML = list.map((d) => {
    const s = dstate(d);
    return `<article class="card post" data-id="${esc(d.id)}">
      <p class="meta">${fmt(d.suggest_at)}　${esc(pillarLabel(d.pillar))}</p>
      <h3>${esc(d.title)}</h3>
      <details><summary>X の文面</summary><pre>${esc(d.x)}</pre></details>
      <div class="row">
        <a class="btn x" href="${esc(d.x_intent)}" target="_blank" rel="noopener" data-act="x-open">Xで投稿</a>
        <button data-act="x-done" class="${s.x ? "done" : ""}">${s.x ? "X済み ✓" : "Xに投稿した"}</button>
      </div>
      <details><summary>Instagram の文面</summary><pre>${esc(d.ig_caption)}</pre></details>
      <div class="row">
        <button data-act="ig-copy">文面コピー</button>
        <button data-act="ig-reel" ${d.media && d.media.reel ? "" : "disabled"}>動画を保存</button>
        <button data-act="ig-img" ${d.media && d.media.image ? "" : "disabled"}>画像を保存</button>
      </div>
      <div class="row">
        <a class="btn ig" href="https://www.instagram.com/" target="_blank" rel="noopener">Instagramを開く</a>
        <button data-act="ig-done" class="${s.ig ? "done" : ""}">${s.ig ? "IG済み ✓" : "IGに投稿した"}</button>
      </div>
      ${d.link ? `<p class="note"><a href="${esc(d.link)}" target="_blank" rel="noopener">記事を見る</a></p>` : ""}
      ${s.skipped || isDone(d) ? "" : `<button data-act="skip" class="ghost">今回は見送る</button>`}
    </article>`;
  }).join("") || `<div class="card calm">ここには何もありません</div>`;
}
const pillarLabel = (id) => ((S.proj.pillars || []).find((p) => p.id === id) || {}).label || id;

function renderArticles() {
  $("#articleList").innerHTML = S.prs.map((p) => `<article class="card" data-pr="${p.number}">
      <p class="meta">${fmt(p.created_at)}</p><h3>${esc(p.title)}</h3>
      <details open><summary>内容と出典</summary><div class="body">${esc(p.body || "").replace(/\n/g, "<br>")}</div></details>
      <div class="row"><button class="primary" data-act="merge">承認して公開</button><button class="ghost" data-act="close">見送る</button></div>
      <p class="note"><a href="${esc(p.html_url)}" target="_blank" rel="noopener">GitHub で詳しく見る</a></p>
    </article>`).join("") || `<div class="card calm">承認待ちの記事はありません。<br>新しい記事はClaudeが探して、ここに届きます。</div>`;
}

function renderFollow() {
  const f = followNow();
  const next = S.prospects.find((p) => p.show_after > now());
  $("#followNow").innerHTML = f ? `<article class="card follow" data-pid="${esc(f.id)}">
      <p class="meta">${f.platform === "x" ? "X" : "Instagram"}　${{ lawyer: "弁護士", event: "イベント", ecosystem: "関係団体" }[f.category] || ""}</p>
      <h3>${esc(f.name)}</h3><p>${esc(f.reason)}</p>
      <a class="btn primary big" href="${esc(f.url)}" target="_blank" rel="noopener">プロフィールを開く</a>
      <div class="row"><button data-act="followed">フォローした</button><button class="ghost" data-act="pass">見送る</button></div>
      <p class="note">確認元：<a href="${esc(f.evidence_url)}" target="_blank" rel="noopener">公式サイト</a></p>
    </article>` : `<div class="card calm">いまの候補はありません。${next ? `次は ${fmt(next.show_after)} ごろ` : "候補を補充します"}</div>`;
  const ps = S.state.prospects || {};
  $("#followHist").innerHTML = S.prospects.filter((p) => ps[p.id]).reverse().map((p) =>
    `<p class="hist">${ps[p.id].status === "followed" ? "✓" : "–"} <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a></p>`).join("") || `<p class="note">まだありません</p>`;
}

function renderStats() {
  const ds = S.state.drafts || {}, ps = S.state.prospects || {};
  const vals = Object.values(ds);
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const n = (f) => vals.filter(f).length;
  const rows = [
    ["サイトの事例", S.cases.length + "件"],
    ["X に投稿（合計／7日）", `${n((v) => v.x)}／${n((v) => v.x && v.x > week)}`],
    ["Instagram に投稿（合計／7日）", `${n((v) => v.ig)}／${n((v) => v.ig && v.ig > week)}`],
    ["フォローした", Object.values(ps).filter((v) => v.status === "followed").length + "件"],
    ["フォロー候補の残り", S.prospects.filter((p) => !ps[p.id]).length + "件"],
    ["投稿待ちの下書き", S.drafts.filter((d) => !isDone(d)).length + "件"],
  ];
  $("#statBox").innerHTML = `<div class="card"><table>${rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join("")}</table></div>`;
}

// ---------- 操作 ----------
async function act(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act;
  const card = el.closest("[data-id],[data-pr],[data-pid]");
  const d = card && card.dataset.id && S.drafts.find((x) => x.id === card.dataset.id);
  try {
    if (a === "x-open") return; // リンクとして開くだけ
    e.preventDefault();
    if (a === "x-done" || a === "ig-done" || a === "skip") {
      const key = { "x-done": "x", "ig-done": "ig", skip: "skipped" }[a];
      await updateState((st) => { st.drafts = st.drafts || {}; st.drafts[d.id] = { ...(st.drafts[d.id] || {}), [key]: now() }; }, `投稿の記録: ${d.id}`);
      toast("記録しました"); render();
    } else if (a === "ig-copy") {
      await navigator.clipboard.writeText(d.ig_caption); toast("文面をコピーしました");
    } else if (a === "ig-reel" || a === "ig-img") {
      const path = a === "ig-reel" ? d.media.reel : d.media.image;
      toast("準備中…");
      const blob = await getBlob(AGENT_REPO, path);
      const name = path.split("/").pop();
      const file = new File([blob], name, { type: a === "ig-reel" ? "video/mp4" : "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] }); // スマホでは「保存」やInstagramを選べる
      } else {
        const u = URL.createObjectURL(file); const l = document.createElement("a"); l.href = u; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
      }
      toast("");
    } else if (a === "merge" || a === "close") {
      const num = card.dataset.pr;
      if (a === "merge") {
        if (!confirm("この記事をサイトに公開します。よろしいですか？")) return;
        const r = await gh(`/repos/${S.proj.site_repo}/pulls/${num}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) });
        if (!r.ok) throw new Error("公開できませんでした（自動チェックが終わっていない可能性があります）");
        toast("公開しました。数分でサイトに出ます");
      } else {
        await gh(`/repos/${S.proj.site_repo}/pulls/${num}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
        toast("見送りました");
      }
      S.prs = S.prs.filter((p) => String(p.number) !== num); render();
    } else if (a === "followed" || a === "pass") {
      const pid = card.dataset.pid;
      await updateState((st) => { st.prospects = st.prospects || {}; st.prospects[pid] = { status: a === "followed" ? "followed" : "skipped", at: now() }; }, `フォローの記録: ${pid}`);
      toast("記録しました"); render();
    }
  } catch (err) { toast(err.message || "うまくいきませんでした"); }
}

// ---------- 通知 ----------
function b64ToBytes(s) { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
// 通知の鍵：初回だけこの端末で作る。秘密の鍵はリポジトリに置かず、Actions の secret に貼ってもらう。
async function makeVapid() {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  let bin = ""; raw.forEach((b) => (bin += String.fromCharCode(b)));
  return { publicKey: btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), privateKey: jwk.d };
}
async function savePush(fn) {
  for (let i = 0; i < 3; i++) {
    const c = await getJson(AGENT_REPO, "state/push.json");
    const data = c.data || { subscriptions: [] };
    fn(data);
    if (await putJson(AGENT_REPO, "state/push.json", data, c.sha, "通知の登録")) return data;
  }
  throw new Error("登録を保存できませんでした");
}
async function enablePush() {
  const note = $("#pushNote");
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("この端末では通知を使えません。iPhoneはホーム画面に追加してから開いてください");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("通知が許可されませんでした");
    const reg = await navigator.serviceWorker.ready;
    let cur = (await getJson(AGENT_REPO, "state/push.json")).data || {};
    if (!cur.publicKey) {
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe(); // 鍵を作り直すときは古い登録を外す
      const v = await makeVapid();
      cur = await savePush((d) => { d.publicKey = v.publicKey; d.subscriptions = []; });
      store.set("vapid_pending", v.privateKey);
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cur.publicKey) });
    const j = sub.toJSON();
    await savePush((d) => {
      d.subscriptions = (d.subscriptions || []).filter((s) => s.subscription.endpoint !== j.endpoint);
      d.subscriptions.push({ subscription: j, device: navigator.userAgent.slice(0, 80), at: now() });
    });
    store.set("push_on", "1");
    note.textContent = "この端末で通知を受け取ります";
    showKeyStep();
  } catch (err) { note.textContent = err.message; }
}
function showKeyStep() {
  const k = store.get("vapid_pending");
  const box = $("#keyStep");
  box.classList.toggle("hidden", !k);
  if (!k) return;
  box.innerHTML = `<p><b>最後に1回だけ：</b>通知を送るための鍵を GitHub に登録します。</p>
    <ol class="steps"><li>「登録ページを開く」を押す（すでに VAPID_PRIVATE_KEY があるときは、その鉛筆マークから開く）</li>
      <li><b>Name</b> 欄に <code>VAPID_PRIVATE_KEY</code> と入力（すでにあるときは不要）</li>
      <li>ここに戻って「鍵をコピー」を押し、<b>Secret</b> 欄に貼り付けて保存</li><li>戻って「登録した」を押す</li></ol>
    <p class="note">Secret 欄に入れる鍵（43文字）：<br><code class="key">${esc(k)}</code></p>
    <div class="row"><button data-key="copy">鍵をコピー</button><a class="btn" href="https://github.com/${AGENT_REPO}/settings/secrets/actions" target="_blank" rel="noopener">登録ページを開く</a></div>
    <button data-key="done" class="primary big">登録した</button>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-key]");
  if (!b) return;
  if (b.dataset.key === "copy") { await navigator.clipboard.writeText(store.get("vapid_pending") || ""); toast("鍵をコピーしました"); }
  else { store.del("vapid_pending"); showKeyStep(); toast("設定が終わりました"); }
});

// ---------- 画面の切りかえ ----------
function show(v) {
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("hidden", s.id !== v));
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
  document.querySelector(".tabs").classList.toggle("hidden", v === "setup");
}
function route() { const v = (location.hash || "#home").slice(1); show(["home", "posts", "articles", "follow", "stats"].includes(v) ? v : "home"); }

let tt;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.toggle("hidden", !m); clearTimeout(tt); if (m && !/中…$/.test(m)) tt = setTimeout(() => t.classList.add("hidden"), 2500); }

document.addEventListener("click", act);
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { S.filter = b.dataset.f; renderPosts(); }));
$("#saveToken").addEventListener("click", () => { const v = $("#tokenIn").value.trim(); if (!v) return; store.set("gh_token", v); location.hash = "#home"; route(); load().catch((e) => toast(e.message)); });
$("#reload").addEventListener("click", () => load().catch((e) => toast(e.message)));
$("#projSel").addEventListener("change", (e) => { store.set("proj", e.target.value); load().catch((er) => toast(er.message)); });
$("#pushBtn").addEventListener("click", enablePush);
$("#logout").addEventListener("click", () => { if (confirm("この端末からトークンを消しますか？")) { store.del("gh_token"); location.reload(); } });
window.addEventListener("hashchange", route);
if (store.get("push_on")) $("#pushNote").textContent = "この端末で通知を受け取ります";
showKeyStep();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
if (!store.get("gh_token")) show("setup");
else { route(); load().catch((e) => toast(e.message)); }
