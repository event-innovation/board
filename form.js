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

  // ステップ3：送信
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    if (!ready) return;
    var checks = [["event", "イベント名"], ["when", "いつごろ"], ["what", "何があった"]];
    for (var i = 0; i < checks.length; i++) {
      var el = document.getElementById(checks[i][0]);
      if (!el.value.trim()) return fail("「" + checks[i][1] + "」を書いてください。", el);
    }
    var reply = document.getElementById("reply");
    if (reply.value && !reply.checkValidity()) return fail("メールアドレスをもう一度確認してください。", reply);
    var agree = document.getElementById("agree");
    if (!agree.checked) return fail("「同意する」にチェックを入れてください。", agree);

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

    btn.disabled = true;
    btn.textContent = "送信しています…";
    // Googleフォームは結果を読み取れない（no-cors）ため、通信できれば受付とみなす
    fetch(form.action, { method: "POST", mode: "no-cors", body: body })
      .then(function () {
        form.reset();
        form.classList.add("hidden");
        done.classList.remove("hidden");
        done.focus();
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "送信する";
        fail("送信できませんでした。電波のよい所で、もう一度お試しください。");
      });
  });

  // 公開案件のカルーセル
  var car = document.getElementById("carousel");
  function slide(dir) {
    var card = car.querySelector(".card");
    car.scrollBy({ left: dir * (card ? card.getBoundingClientRect().width + 16 : car.clientWidth), behavior: "smooth" });
  }
  document.getElementById("prevCase").addEventListener("click", function () { slide(-1); });
  document.getElementById("nextCase").addEventListener("click", function () { slide(1); });
})();
