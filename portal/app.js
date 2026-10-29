"use strict";
// 弁護士専用ページ。ログイン → 弁護士情報の登録 → 管理者の確認 → 相談の閲覧。
(function () {
  var C = window.PORTAL_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var show = function (id, on) { $(id).classList.toggle("hidden", !on); };
  var msg = function (t) { $("msg").textContent = t || ""; };
  var BOXES = ["notReady", "authBox", "registerBox", "statusBox", "tipsBox", "tipBox", "billingBox", "logoutWrap"];
  var only = function (ids) { BOXES.forEach(function (b) { show(b, ids.indexOf(b) >= 0); }); };

  if (!C.supabaseUrl || !C.supabaseKey || !window.supabase) { only(["notReady"]); return; }
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  var me = null, lawyer = null, settings = { tips_require_subscription: false }, current = null;

  var KIND_JP = { unverified: "未確認", documents_seen: "資料の一部を確認", tier_b: "調査で確認済み（B）" };
  var ERR = {
    "Invalid login credentials": "メールアドレスかパスワードが違います。",
    "Email not confirmed": "メールアドレスの確認がまだです。届いたメールのリンクを押してください。",
    "User already registered": "このメールアドレスはすでに登録されています。ログインしてください。"
  };
  function jp(e) { var m = (e && e.message) || String(e); return ERR[m] || (/not_allowed/.test(m) ? "まだ閲覧できません。" : /not_found/.test(m) ? "この相談は見られません。" : /duplicate key/.test(m) ? "この登録番号は、すでに申請されています。" : "うまくいきませんでした。時間をおいてもう一度お試しください。"); }

  // ログイン・登録の切り替え
  var mode = "login";
  function setMode(m) {
    mode = m;
    $("tabLogin").setAttribute("aria-selected", m === "login");
    $("tabSignup").setAttribute("aria-selected", m === "signup");
    $("authBtn").textContent = m === "login" ? "ログイン" : "登録する（確認メールが届きます）";
    $("password").setAttribute("autocomplete", m === "login" ? "current-password" : "new-password");
  }
  $("tabLogin").addEventListener("click", function () { setMode("login"); });
  $("tabSignup").addEventListener("click", function () { setMode("signup"); });

  $("authForm").addEventListener("submit", function (e) {
    e.preventDefault(); msg("");
    var email = $("email").value.trim(), pw = $("password").value;
    if (!$("email").checkValidity() || !email) return msg("メールアドレスを確認してください。");
    if (pw.length < 8) return msg("パスワードは8文字以上にしてください。");
    $("authBtn").disabled = true;
    var redirect = location.origin + location.pathname;
    var p = mode === "login" ? sb.auth.signInWithPassword({ email: email, password: pw })
      : sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirect } });
    p.then(function (r) {
      $("authBtn").disabled = false;
      if (r.error) return msg(jp(r.error));
      if (mode === "signup" && !r.data.session) {
        $("authDone").textContent = "確認メールを送りました。メールのリンクを押してから、ログインしてください。";
        show("authDone", true);
      }
    });
  });
  $("forgot").addEventListener("click", function (e) {
    e.preventDefault(); msg("");
    var email = $("email").value.trim();
    if (!email) return msg("メールアドレスを入れてから押してください。");
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function () {
      $("authDone").textContent = "パスワードを設定し直すメールを送りました。"; show("authDone", true);
    });
  });
  $("logoutBtn").addEventListener("click", function () { sb.auth.signOut(); });

  // 弁護士情報の登録
  $("regForm").addEventListener("submit", function (e) {
    e.preventDefault(); msg("");
    var v = function (id) { return $(id).value.trim(); };
    var no = v("r_no").replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); });
    if (!v("r_name") || !v("r_bar") || !v("r_office") || !v("r_tel")) return msg("すべての欄を書いてください。");
    if (!/^[0-9]{4,6}$/.test(no)) return msg("登録番号は数字で書いてください。");
    if (!$("r_agree").checked) return msg("「お約束と利用規約・情報の取扱いに同意する」にチェックを入れてください。");
    $("regBtn").disabled = true;
    sb.rpc("register_lawyer", { p_full_name: v("r_name"), p_bar_number: no, p_bar_association: v("r_bar"), p_office: v("r_office"), p_office_phone: v("r_tel") })
      .then(function (r) { $("regBtn").disabled = false; if (r.error) return msg(jp(r.error)); refresh(); });
  });

  // 一覧
  function loadTips() {
    sb.rpc("list_tips").then(function (r) {
      if (r.error) return msg(jp(r.error));
      var list = $("tipsList"); list.textContent = "";
      show("tipsEmpty", !r.data.length);
      r.data.forEach(function (t) {
        var d = document.createElement("div");
        d.className = "tip-item"; d.tabIndex = 0; d.setAttribute("role", "button");
        var meta = document.createElement("p"); meta.className = "meta";
        [t.kind, t.category, t.region, t.period].filter(Boolean).forEach(function (s) { var g = document.createElement("span"); g.className = "tag"; g.textContent = s; meta.appendChild(g); });
        var ver = document.createElement("span"); ver.className = "tag " + (t.verification === "tier_b" ? "ok" : "warn"); ver.textContent = KIND_JP[t.verification] || "未確認"; meta.appendChild(ver);
        if (t.has_response) { var rs = document.createElement("span"); rs.className = "tag"; rs.textContent = "相手方の回答あり"; meta.appendChild(rs); }
        if (t.status === "closed") { var cl = document.createElement("span"); cl.className = "tag"; cl.textContent = "受付終了"; meta.appendChild(cl); }
        if (t.interested) { var it = document.createElement("span"); it.className = "tag ok"; it.textContent = "対応できますを送信済み"; meta.appendChild(it); }
        var h = document.createElement("h3"); h.textContent = t.title;
        var s = document.createElement("p"); s.textContent = t.summary;
        d.appendChild(meta); d.appendChild(h); d.appendChild(s);
        var open = function () { openTip(t.id); };
        d.addEventListener("click", open);
        d.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        list.appendChild(d);
      });
    });
  }

  // 詳しい内容
  function openTip(id) {
    msg("");
    sb.rpc("view_tip", { p_id: id }).then(function (r) {
      if (r.error || !r.data || !r.data.length) return msg(jp(r.error || "not_found"));
      var t = current = r.data[0];
      $("tMeta").textContent = [t.kind, t.category, t.region, t.period, KIND_JP[t.verification]].filter(Boolean).join("・");
      $("tTitle").textContent = t.title;
      $("tDetails").textContent = t.details;
      $("tCounterparty").textContent = t.counterparty_name || ""; show("tCounterpartyWrap", !!t.counterparty_name);
      $("tDocs").textContent = t.documents || ""; show("tDocsWrap", !!t.documents);
      $("tResponse").textContent = t.counterparty_response
        ? t.counterparty_response + (t.counterparty_responded_on ? "\n（" + t.counterparty_responded_on + " 回答）" : "")
        : "まだありません（問い合わせ前、または回答待ち）。";
      $("iDone").textContent = ""; $("iMsg").value = "";
      $("interestBtn").disabled = t.status !== "open";
      sb.from("tip_interests").select("message").eq("tip_id", t.id).then(function (q) {
        var sent = q.data && q.data.length;
        show("withdrawBtn", !!sent);
        if (sent) { $("iMsg").value = q.data[0].message || ""; $("iDone").textContent = "「対応できます」を送信済みです。"; }
      });
      only(["tipBox", "logoutWrap"]);
      window.scrollTo(0, 0);
    });
  }
  $("backBtn").addEventListener("click", function () { current = null; refresh(); });
  $("interestBtn").addEventListener("click", function () {
    if (!current) return;
    $("interestBtn").disabled = true;
    sb.rpc("express_interest", { p_tip_id: current.id, p_message: $("iMsg").value.trim() }).then(function (r) {
      $("interestBtn").disabled = false;
      if (r.error) return msg(jp(r.error));
      $("iDone").textContent = "送信しました。当団体から相談者にお伝えします。"; show("withdrawBtn", true);
    });
  });
  $("withdrawBtn").addEventListener("click", function () {
    if (!current) return;
    sb.rpc("withdraw_interest", { p_tip_id: current.id }).then(function (r) {
      if (r.error) return msg(jp(r.error));
      $("iDone").textContent = "取り下げました（すでに相談者へお伝えした後は取り下げられません）。"; show("withdrawBtn", false);
    });
  });

  // AI顧問サービスの支払い（Stripeの決済リンク）
  function pay(kind) {
    var url = (C.paymentLinks || {})[kind];
    if (!url || !/^https:\/\/buy\.stripe\.com\//.test(url)) return msg("お支払いの準備中です。お問い合わせください。");
    location.href = url + (url.indexOf("?") < 0 ? "?" : "&") + "client_reference_id=" + encodeURIComponent(me.id) + "&prefilled_email=" + encodeURIComponent(me.email);
  }
  $("paySolo").addEventListener("click", function () { pay("solo"); });
  $("payFirm").addEventListener("click", function () { pay("firm"); });

  function renderBilling() {
    var st = lawyer && lawyer.subscription_status;
    $("subState").textContent = st === "active" ? "ご契約中です。" : st === "past_due" ? "お支払いが確認できていません。" : "ご契約はありません。";
    show("paySolo", st !== "active"); show("payFirm", st !== "active");
  }

  var STATUS_TEXT = {
    pending: ["確認しています", "日弁連の弁護士情報検索で、ご登録の内容を確認しています。確認が終わると閲覧できるようになります（通常3営業日以内）。必要に応じて、事務所へお電話することがあります。"],
    rejected: ["確認できませんでした", "ご登録の内容を確認できませんでした。お手数ですが、お問い合わせください。"],
    suspended: ["閲覧を止めています", "詳しくはお問い合わせください。"]
  };

  function refresh() {
    msg("");
    sb.auth.getUser().then(function (u) {
      me = u.data && u.data.user;
      if (!me) { only(["authBox"]); return; }
      Promise.all([sb.from("lawyers").select("*").maybeSingle(), sb.from("settings").select("tips_require_subscription").maybeSingle()]).then(function (res) {
        lawyer = res[0].data; if (res[1].data) settings = res[1].data;
        if (!lawyer || lawyer.status === "rejected") {
          only(["registerBox", "logoutWrap"].concat(lawyer ? ["statusBox"] : []));
          if (lawyer) { $("statusTitle").textContent = STATUS_TEXT.rejected[0]; $("statusText").textContent = STATUS_TEXT.rejected[1]; }
          return;
        }
        if (lawyer.status !== "verified") {
          var s = STATUS_TEXT[lawyer.status];
          $("statusTitle").textContent = s[0]; $("statusText").textContent = s[1];
          only(["statusBox", "billingBox", "logoutWrap"]); renderBilling(); return;
        }
        renderBilling();
        if (settings.tips_require_subscription && lawyer.subscription_status !== "active") {
          $("statusTitle").textContent = "ご契約のうえでご覧いただけます";
          $("statusText").textContent = "下のプランからお申し込みください。";
          only(["statusBox", "billingBox", "logoutWrap"]); return;
        }
        only(["tipsBox", "billingBox", "logoutWrap"]); loadTips();
      });
    });
  }
  sb.auth.onAuthStateChange(function (ev) { if (ev !== "TOKEN_REFRESHED") refresh(); });
})();
