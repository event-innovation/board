"use strict";
// 区分ボタンでフォームを切り替え、入力チェックをして、内容を1つの文章にまとめてGoogleフォームへ送る。
(function () {
  var form = document.getElementById("intake");
  var err = document.getElementById("formError");
  var btn = document.getElementById("submitBtn");
  var done = document.getElementById("done");
  var kindInput = document.getElementById("kind");
  var subject = document.getElementById("subject");
  var entry = form.getAttribute("data-entry") || "";
  var ready = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/formResponse$/.test(form.getAttribute("action") || "") && /^entry\.\d+$/.test(entry);
  var LABELS = { b2b: "会社ー会社", b2c: "会社ー個人" };

  function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }

  // 1. 区分を選ぶ
  var choices = document.querySelectorAll("button.big");
  Array.prototype.forEach.call(choices, function (b) {
    b.addEventListener("click", function () {
      var kind = b.getAttribute("data-kind");
      Array.prototype.forEach.call(choices, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      Array.prototype.forEach.call(form.querySelectorAll("fieldset[data-kind]"), function (fs) {
        var on = fs.getAttribute("data-kind") === kind;
        fs.disabled = !on;
        fs.classList.toggle("hidden", !on);
      });
      kindInput.value = LABELS[kind];
      subject.value = "相談受付（" + LABELS[kind] + "）";
      form.classList.remove("hidden");
      if (!ready) { btn.disabled = true; err.textContent = "現在、受付の準備中です。しばらくしてからお試しください。"; }
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  form.addEventListener("input", function () { if (ready) err.textContent = ""; });

  // 2. 送信
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    if (!ready) return;
    var required = form.querySelectorAll("[required]");
    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      if (el.disabled || el.closest("fieldset:disabled")) continue;
      var empty = el.type === "checkbox" ? !el.checked : !el.value.trim();
      if (empty) {
        var label = el.type === "checkbox" ? "同意のチェック" : (form.querySelector('label[for="' + el.id + '"]') || {}).textContent;
        return fail("「" + label + "」を入力してください。", el);
      }
    }
    var reply = document.getElementById("reply");
    if (reply.value && !reply.checkValidity()) return fail("返信先メールアドレスの形式を確認してください。", reply);

    btn.disabled = true;
    btn.textContent = "送信しています…";
    // 入力された項目を「項目名：値」の形で1つの文章にまとめる
    var fd = new FormData(form), lines = [], seen = {};
    fd.forEach(function (v, k) {
      if (k === "_gotcha" || k === "_subject" || !String(v).trim()) return;
      if (seen[k] !== undefined) { lines[seen[k]] += "、" + v; return; }
      seen[k] = lines.length;
      lines.push("【" + k + "】" + v);
    });
    if (fd.get("_gotcha")) return; // ボット対策
    var body = new URLSearchParams();
    body.append(entry, lines.join("\n"));
    // Googleフォームは結果を読み取れない（no-cors）ため、通信が成功すれば受付とみなす
    fetch(form.action, { method: "POST", mode: "no-cors", body: body })
      .then(function () {
        form.reset();
        form.classList.add("hidden");
        document.querySelector(".choose").parentNode.classList.add("hidden");
        done.classList.remove("hidden");
        done.focus();
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "送信する";
        fail("送信できませんでした。通信状況を確認して、もう一度お試しください。");
      });
  });

  // 3. 公開案件のカルーセル
  var car = document.getElementById("carousel");
  function step(dir) {
    var card = car.querySelector(".card");
    var w = card ? card.getBoundingClientRect().width + 16 : car.clientWidth;
    car.scrollBy({ left: dir * w, behavior: "smooth" });
  }
  document.getElementById("prevCase").addEventListener("click", function () { step(-1); });
  document.getElementById("nextCase").addEventListener("click", function () { step(1); });
})();
