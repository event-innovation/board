"use strict";
(function () {
  var C = window.PORTAL_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var msg = function (t) { $("msg").textContent = t || ""; };
  if (!C.supabaseUrl || !C.supabaseKey) { msg("config.js が未設定です。"); return; }
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  var STATUS = { pending: "確認待ち", verified: "確認済み", rejected: "確認できない", suspended: "停止" };
  var VER = { unverified: "未確認", documents_seen: "資料の一部を確認", tier_b: "B確認済み" };
  var tipsById = {};

  function td(tr, text) { var c = document.createElement("td"); c.textContent = text == null ? "" : text; tr.appendChild(c); return c; }
  function btn(parent, label, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "p-btn sub"; b.textContent = label; b.addEventListener("click", fn); parent.appendChild(b); return b; }
  function done(r) { if (r.error) { msg("エラー：" + r.error.message); return false; } msg(""); return true; }

  function loadLawyers() {
    sb.from("lawyers").select("*").order("created_at", { ascending: false }).then(function (r) {
      if (!done(r)) return;
      var body = $("lawyerRows"); body.textContent = "";
      r.data.sort(function (a, b) { return (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1); }).forEach(function (l) {
        var tr = document.createElement("tr");
        td(tr, STATUS[l.status]); td(tr, l.full_name); td(tr, l.bar_number); td(tr, l.bar_association);
        td(tr, l.office + " / " + l.office_phone); td(tr, l.email); td(tr, l.subscription_status);
        var c = td(tr, ""); c.className = "row-actions";
        var note = document.createElement("input"); note.type = "text"; note.value = l.admin_note || ""; note.placeholder = "確認した日・方法"; c.appendChild(note);
        var set = function (status) {
          if (status === "verified" && !note.value.trim()) return msg("メモに、確認した日と方法を書いてください。");
          var patch = { status: status, admin_note: note.value.trim() };
          if (status === "verified") { patch.verified_at = new Date().toISOString(); }
          sb.auth.getUser().then(function (u) {
            if (status === "verified") patch.verified_by = u.data.user.id;
            sb.from("lawyers").update(patch).eq("user_id", l.user_id).then(function (x) { if (done(x)) loadLawyers(); });
          });
        };
        btn(c, "確認済みにする", function () { set("verified"); });
        btn(c, "確認できない", function () { set("rejected"); });
        btn(c, "停止", function () { set("suspended"); });
        $("lawyerRows").appendChild(tr);
      });
    });
  }

  var F = ["id", "ref", "kind", "cat", "region", "period", "title", "summary", "details", "cp", "docs", "ver", "resp", "respon", "consenton", "status"];
  var COL = { ref: "ref_code", kind: "kind", cat: "category", region: "region", period: "period", title: "title", summary: "summary", details: "details", cp: "counterparty_name", docs: "documents", ver: "verification", resp: "counterparty_response", respon: "counterparty_responded_on", consenton: "consent_recorded_on", status: "status" };
  function fillTip(t) {
    F.forEach(function (k) { var el = $("t_" + k); if (k === "id") el.value = t ? t.id : ""; else el.value = t && t[COL[k]] != null ? t[COL[k]] : (el.tagName === "SELECT" ? el.options[0].value : ""); });
    $("t_consent").checked = !!(t && t.consent_lawyer_view); $("t_redact").checked = !!(t && t.redaction_checked); $("t_pub").checked = !!(t && t.published);
    window.scrollTo(0, $("tipForm").offsetTop - 20);
  }
  $("tipNew").addEventListener("click", function () { fillTip(null); });
  $("tipForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var row = {};
    Object.keys(COL).forEach(function (k) { var v = $("t_" + k).value.trim(); row[COL[k]] = v === "" ? null : v; });
    if (!row.category || !row.title || !row.summary || !row.details) return msg("必須の欄を書いてください。");
    if (!$("t_consent").checked) return msg("弁護士に見せる同意がない相談は、登録できません。");
    if (!$("t_redact").checked) return msg("相談者が分かる情報を伏せてから、チェックを入れてください。");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.consent_recorded_on || "")) return msg("同意を確認した日を 2026-10-30 の形で書いてください。");
    if (row.counterparty_responded_on && !/^\d{4}-\d{2}-\d{2}$/.test(row.counterparty_responded_on)) return msg("回答日は 2026-11-01 の形で書いてください。");
    row.consent_lawyer_view = true; row.redaction_checked = true; row.published = $("t_pub").checked;
    var id = $("t_id").value;
    var p = id ? sb.from("tips").update(row).eq("id", id) : sb.auth.getUser().then(function (u) { row.created_by = u.data.user.id; return sb.from("tips").insert(row); });
    Promise.resolve(p).then(function (r) { if (done(r)) { fillTip(null); loadTips(); msg(""); } });
  });

  function loadTips() {
    sb.from("tips").select("*").order("created_at", { ascending: false }).then(function (r) {
      if (!done(r)) return;
      var body = $("tipRows"); body.textContent = ""; tipsById = {};
      r.data.forEach(function (t) {
        tipsById[t.id] = t;
        var tr = document.createElement("tr");
        td(tr, t.id); td(tr, t.title); td(tr, VER[t.verification]); td(tr, t.published ? "公開" : "非公開"); td(tr, t.status === "open" ? "受付中" : "終了");
        btn(td(tr, ""), "編集", function () { fillTip(t); });
        body.appendChild(tr);
      });
      loadInterests();
    });
  }

  function loadInterests() {
    sb.from("tip_interests").select("tip_id, lawyer_id, message, created_at, forwarded_at, lawyers(full_name, office, bar_association)").order("created_at", { ascending: false }).then(function (r) {
      if (!done(r)) return;
      var body = $("intRows"); body.textContent = "";
      r.data.forEach(function (i) {
        var tr = document.createElement("tr");
        td(tr, (tipsById[i.tip_id] || {}).title || i.tip_id);
        td(tr, i.lawyers ? i.lawyers.full_name + "（" + i.lawyers.office + "・" + i.lawyers.bar_association + "）" : "");
        td(tr, i.message); td(tr, new Date(i.created_at).toLocaleString("ja-JP"));
        var c = td(tr, i.forwarded_at ? "伝えた（" + new Date(i.forwarded_at).toLocaleDateString("ja-JP") + "）" : "");
        if (!i.forwarded_at) btn(c, "伝えた", function () {
          sb.from("tip_interests").update({ forwarded_at: new Date().toISOString() }).eq("tip_id", i.tip_id).eq("lawyer_id", i.lawyer_id).then(function (x) { if (done(x)) loadInterests(); });
        });
        body.appendChild(tr);
      });
    });
  }

  $("gate").addEventListener("change", function () {
    var on = $("gate").checked;
    if (on && !confirm("閲覧を有料にすると、事件の紹介でお金を受け取ったとみなされるおそれがあります。弁護士への確認は済んでいますか？")) { $("gate").checked = false; return; }
    sb.from("settings").update({ tips_require_subscription: on, updated_at: new Date().toISOString() }).eq("id", 1).then(done);
  });

  function start() {
    sb.auth.getUser().then(function (u) {
      if (!u.data.user) { $("login").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
      sb.rpc("is_admin").then(function (r) {
        if (!r.data) { msg("このアカウントは管理者ではありません。"); $("login").classList.remove("hidden"); return; }
        $("login").classList.add("hidden"); $("app").classList.remove("hidden");
        sb.from("settings").select("tips_require_subscription").single().then(function (s) { if (s.data) $("gate").checked = s.data.tips_require_subscription; });
        loadLawyers(); loadTips();
      });
    });
  }
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value }).then(function (r) { if (r.error) return msg("ログインできませんでした。"); start(); });
  });
  $("logout").addEventListener("click", function () { sb.auth.signOut().then(start); });
  start();
})();
