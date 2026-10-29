"use strict";
// 入力チェックをして、フォームの内容を受付先（Formspree）へ送る。
(function () {
  var form = document.getElementById("intake");
  var err = document.getElementById("formError");
  var btn = document.getElementById("submitBtn");
  var done = document.getElementById("done");
  var ready = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(form.getAttribute("action") || "");

  if (!ready) {
    btn.disabled = true;
    err.textContent = "現在、受付の準備中です。しばらくしてからお試しください。";
  }

  function fail(msg, el) {
    err.textContent = msg;
    if (el) el.focus();
  }

  form.addEventListener("input", function () { if (ready) err.textContent = ""; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    if (!ready) return;
    var required = form.querySelectorAll("[required]");
    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      var empty = el.type === "checkbox" ? !el.checked : !el.value.trim();
      if (empty) {
        var label = el.type === "checkbox" ? "確認のチェック" : (form.querySelector('label[for="' + el.id + '"]') || {}).textContent;
        return fail("「" + label + "」を入力してください。", el);
      }
    }
    var reply = document.getElementById("reply");
    if (reply.value && !reply.checkValidity()) return fail("返信先メールアドレスの形式を確認してください。", reply);

    btn.disabled = true;
    btn.textContent = "送信しています…";
    fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        form.classList.add("hidden");
        done.classList.remove("hidden");
        done.focus();
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "送信する";
        fail("送信できませんでした。通信状況を確認して、もう一度お試しください。");
      });
  });
})();
