"use strict";
// スポンサー申し込み。内容を1つの文章にまとめてGoogleフォームへ送る。
(function () {
  var form = document.getElementById("sponsorForm");
  var err = document.getElementById("sponsorError");
  var btn = document.getElementById("sponsorSubmit");
  var done = document.getElementById("sponsorDone");
  var entry = form.getAttribute("data-entry");
  function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }
  form.addEventListener("input", function () { err.textContent = ""; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var req = form.querySelectorAll("input[required]:not([type=checkbox])");
    for (var i = 0; i < req.length; i++) {
      var label = form.querySelector('label[for="' + req[i].id + '"]').textContent;
      if (!req[i].value.trim()) return fail("「" + label + "」を書いてください。", req[i]);
      if (!req[i].checkValidity()) return fail("「" + label + "」をもう一度確認してください。", req[i]);
    }
    var agree = document.getElementById("s_agree");
    if (!agree.checked) return fail("「情報の取扱いに同意する」にチェックを入れてください。", agree);
    var fd = new FormData(form);
    if (fd.get("_gotcha")) return;
    var lines = ["【種別】スポンサーのお申し込み"];
    fd.forEach(function (v, k) { if (k !== "_gotcha" && String(v).trim()) lines.push("【" + k + "】" + v); });
    var body = new URLSearchParams();
    body.append(entry, lines.join("\n"));
    btn.disabled = true;
    btn.textContent = "送信しています…";
    fetch(form.action, { method: "POST", mode: "no-cors", body: body })
      .then(function () { form.reset(); form.classList.add("hidden"); done.classList.remove("hidden"); done.focus(); })
      .catch(function () { btn.disabled = false; btn.textContent = "送信する"; fail("送信できませんでした。電波のよい所で、もう一度お試しください。"); });
  });
})();
