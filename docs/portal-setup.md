# 弁護士専用ページ（相談の閲覧）の仕組みと準備

## しくみ
- 画面：`portal/index.html`（弁護士）、`portal/admin.html`（管理者）。GitHub Pages のまま動く静的ページ。
- ログイン・データ：Supabase（無料プラン）。表と権限は `supabase/migrations/20261029_lawyer_portal.sql`。
- 支払い（AI顧問サービス・任意）：Stripe の決済リンク。月額料金はなく、決済ごとの手数料（国内カード3.6%）だけ。
  契約状態は `supabase/functions/stripe-webhook` が Stripe からの通知を受けて更新する。
- 元のファイルは共有フォルダの `資料受付試作/site/src/portal/`。`node build.js` で dist/ に作る。

## 守っていること
- 相談者の名前・連絡先はSupabaseに入れない。管理者がGoogleフォームの内容を伏せてから登録する。
- 「弁護士に見せてよい」に同意がない相談は、データベースの決まりで登録できない。
- 見られるのは、管理者が日弁連の弁護士情報検索で照合し、事務所へ確認した弁護士だけ。
- 弁護士は相談者に直接連絡できない。「対応できます」を押すと管理者に届き、管理者が相談者に伝え、相談者が選ぶ。
- 閲覧は無料（初期設定）。「閲覧に有料契約を必要にする」設定もあるが、事件の周旋とみなされるおそれがあるため、弁護士の確認が済むまでオフ。
- 誰がいつどの相談を見たかを記録する（view_log）。

## 準備の手順
1. Supabase のプロジェクトを作り、上のSQLを流す。
2. Authentication → Providers → Email：確認メールを有効のまま。Site URL を `https://event-innovation.github.io/board/portal/` にする。
3. 管理者のアカウントで portal/index.html から登録し、SQLで `insert into public.admins values ('<そのユーザーのid>');`
4. `portal/config.js` に Project URL と publishable key を入れる（service_role は絶対に入れない）。
5. Stripe：商品（ひとり法人／弁護士法人の月額）と決済リンクを作り、`paymentLinks` に入れる。
   Webhook の送り先に `https://<ref>.supabase.co/functions/v1/stripe-webhook`、イベントは
   `checkout.session.completed` `customer.subscription.updated` `customer.subscription.deleted`。
   署名シークレット（whsec_…）を Supabase の Edge Function Secrets に `STRIPE_WEBHOOK_SECRET` として入れる。
   関数は JWT 確認なし（`verify_jwt: false`）で配置する（署名で確認するため）。

## 無料プランの注意
- Supabase の無料プランは、1週間使われないと一時停止する。停止したら画面から再開する。
- Supabase標準のメール送信は1時間あたりの上限が小さい。登録が増えたら、無料のメール送信サービス（Resend など）をSMTPに設定する。
