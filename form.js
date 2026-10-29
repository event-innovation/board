"use strict";
// 3ステップの入力画面。内容を1つの文章にまとめてGoogleフォームへ送る。
(function () {
  var form = document.getElementById("intake");
  var err = document.getElementById("formError");
  var btn = document.getElementById("submitBtn");
  var done = document.getElementById("done");
  var kindInput = document.getElementById("kind");
  var stepNo = document.getElementById("stepNo");
  var progress = document.getElementById("progress");
  var entry = form.getAttribute("data-entry") || "";
  var ready = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/formResponse$/.test(form.getAttribute("action") || "") && /^entry\.\d+$/.test(entry);
  var LABELS = { b2b: "会社ー会社", b2c: "会社ー個人" };
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  function show(n) {
    each(form.querySelectorAll(".wstep"), function (s) { s.classList.toggle("hidden", s.getAttribute("data-step") !== String(n)); });
    stepNo.textContent = n;
    progress.scrollIntoView({ behavior: "smooth", block: "start" });
    if (n === 3 && !ready) { btn.disabled = true; err.textContent = "ただいま準備中です。もうしばらくお待ちください。"; }
  }

  // ステップ1：区分
  each(form.querySelectorAll("button.big"), function (b) {
    b.addEventListener("click", function () {
      var kind = b.getAttribute("data-kind");
      each(form.querySelectorAll("fieldset[data-kind]"), function (fs) {
        var on = fs.getAttribute("data-kind") === kind;
        fs.disabled = !on;
        fs.classList.toggle("hidden", !on);
      });
      kindInput.value = LABELS[kind];
      show(2);
    });
  });

  // ステップ2：困りごと（選んだら次へ）
  each(form.querySelectorAll('input[name="トラブルの種類"]'), function (r) {
    r.addEventListener("change", function () { show(3); });
  });

  each(form.querySelectorAll("button.back"), function (b) {
    b.addEventListener("click", function () { show(Number(b.getAttribute("data-back"))); });
  });

  form.addEventListener("input", function () { if (ready) err.textContent = ""; });

  function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }

  // ポップアップの開け閉め
  var modalErr = document.getElementById("modalError");
  var lastFocus = null;
  function openModal(id, focusEl) {
    lastFocus = document.activeElement;
    var m = document.getElementById(id);
    m.classList.remove("hidden");
    document.body.classList.add("modal-open");
    requestAnimationFrame(function () { m.classList.add("show"); });
    setTimeout(function () { (focusEl || m.querySelector(".modal-close")).focus(); }, 60);
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    m.classList.remove("show");
    m.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  each(document.querySelectorAll("[data-close]"), function (b) {
    b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
  });
  each(document.querySelectorAll(".modal"), function (m) {
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(m.id); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    each(document.querySelectorAll(".modal:not(.hidden)"), function (m) { closeModal(m.id); });
  });

  // ステップ3：「送信する」→ 確認ポップアップ →「同意して送信する」で送信
  var finalBtn = document.getElementById("finalBtn");
  var modal = document.getElementById("agreeModal");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    modalErr.textContent = "";
    if (!ready) return;
    var checks = [["event", "イベント名"], ["what", "いつごろ、何があった"]];
    for (var i = 0; i < checks.length; i++) {
      var el = document.getElementById(checks[i][0]);
      if (!el.value.trim()) { if (!modal.classList.contains("hidden")) closeModal("agreeModal"); return fail("「" + checks[i][1] + "」を書いてください。", el); }
    }
    var reply = document.getElementById("reply");
    if (modal.classList.contains("hidden")) { openModal("agreeModal", reply); return; }
    var mfail = function (msg, el) { modalErr.textContent = msg; if (el) el.focus(); };
    if (!reply.value.trim()) return mfail("メールアドレスを書いてください。", reply);
    if (!reply.checkValidity()) return mfail("メールアドレスをもう一度確認してください。", reply);
    var agree = document.getElementById("agree");
    if (!agree.checked) return mfail("「利用規約と情報の取扱いに同意する」にチェックを入れてください。", agree);

    var fd = new FormData(form);
    if (fd.get("_gotcha")) return; // ボット対策
    var lines = [], seen = {};
    fd.forEach(function (v, k) {
      if (k === "_gotcha" || !String(v).trim()) return;
      if (seen[k] !== undefined) { lines[seen[k]] += "、" + v; return; }
      seen[k] = lines.length;
      lines.push("【" + k + "】" + v);
    });
    var body = new URLSearchParams();
    body.append(entry, lines.join("\n"));

    finalBtn.disabled = true;
    finalBtn.textContent = "送信しています…";
    // Googleフォームは結果を読み取れない（no-cors）ため、通信できれば受付とみなす
    fetch(form.action, { method: "POST", mode: "no-cors", body: body })
      .then(function () {
        closeModal("agreeModal");
        form.reset();
        form.classList.add("hidden");
        done.classList.remove("hidden");
        done.scrollIntoView({ block: "center" });
        openModal("lineModal");
      })
      .catch(function () {
        finalBtn.disabled = false;
        finalBtn.textContent = "同意して送信する";
        mfail("送信できませんでした。電波のよい所で、もう一度お試しください。");
      });
  });

  // 「こちらのフォーム」などのリンク：最初の質問「どちらで困っていますか？」へ戻して移動する
  each(document.querySelectorAll('a[href="#intake"]'), function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (form.classList.contains("hidden")) { form.classList.remove("hidden"); done.classList.add("hidden"); }
      each(form.querySelectorAll(".wstep"), function (s) { s.classList.toggle("hidden", s.getAttribute("data-step") !== "1"); });
      stepNo.textContent = 1;
      var q = progress;
      var y = q.getBoundingClientRect().top + window.pageYOffset - 16;
      window.scrollTo({ top: y, behavior: "smooth" });
      setTimeout(function () { var b = form.querySelector("button.big"); if (b) b.focus({ preventScroll: true }); }, 500);
    });
  });

  // 公開案件のカルーセル
  var car = document.getElementById("carousel");
  function slide(dir) {
    var card = car.querySelector(".card");
    car.scrollBy({ left: dir * (card ? card.getBoundingClientRect().width + 16 : car.clientWidth), behavior: "smooth" });
  }
  var prev = document.getElementById("prevCase"), next = document.getElementById("nextCase");
  if (prev && car) prev.addEventListener("click", function () { slide(-1); });
  if (next && car) next.addEventListener("click", function () { slide(1); });
})();
