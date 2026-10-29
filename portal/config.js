"use strict";
// 弁護士専用ページの設定。値はSupabaseとStripeの準備ができたら入れる。
// supabaseKey は公開してよい鍵（publishable / anon）。service_role の鍵は絶対に入れない。
window.PORTAL_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  // Stripeの決済リンク（AI顧問サービスの月額）。空なら「お問い合わせください」と表示する
  paymentLinks: { solo: "", firm: "" }
};
