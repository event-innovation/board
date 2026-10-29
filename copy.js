"use strict";
// ひな形のコピーだけを行う。通信はしない。
document.getElementById("copyBtn").addEventListener("click", function () {
  var t = document.getElementById("template");
  var msg = document.getElementById("copyMsg");
  function done(ok) { msg.textContent = ok ? "コピーしました" : "コピーできませんでした。手動で選択してコピーしてください。"; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t.value).then(function () { done(true); }, function () { t.select(); done(document.execCommand && document.execCommand("copy")); });
  } else {
    t.select();
    done(document.execCommand && document.execCommand("copy"));
  }
});
