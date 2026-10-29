"use strict";
// 弁護士向けお問い合わせフォーム。内容を1つの文章にまとめて、弁護士用のGoogleフォームへ送る。
(function () {
  var form = document.getElementById("lawyerForm");
  var err = document.getElementById("lawyerError");
  var btn = document.getElementById("lawyerSubmit");
  var done = document.getElementById("lawyerDone");
  var entry = form.getAttribute("data-entry") || "";
  var ready = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/formResponse$/.test(form.getAttribute("action") || "") && /^entry\.\d+$/.test(entry);

  if (!ready) { btn.disabled = true; err.textContent = "お問い合わせフォームは準備中です。もうしばらくお待ちください。"; }
  form.addEventListener("input", function () { if (ready) err.textContent = ""; });
  function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!ready) return;
    var checks = [["l_name", "お名前"], ["l_office", "事務所名"], ["l_email", "メールアドレス"]];
    for (var i = 0; i < checks.length; i++) {
      var el = document.getElementById(checks[i][0]);
      if (!el.value.trim()) return fail("「" + checks[i][1] + "」を書いてください。", el);
    }
    var mail = document.getElementById("l_email");
    if (!mail.checkValidity()) return fail("メールアドレスをもう一度確認してください。", mail);
    var agree = document.getElementById("l_agree");
    if (!agree.checked) return fail("「同意する」にチェックを入れてください。", agree);

    var fd = new FormData(form);
    if (fd.get("_gotcha")) return;
    var lines = ["【区分】弁護士からのお問い合わせ（AI支援事業）"], seen = {};
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
        fail("送信できませんでした。通信状況を確認して、もう一度お試しください。");
      });
  });
})();
