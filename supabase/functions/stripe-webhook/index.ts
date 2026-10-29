// Stripe からの通知を受けて、弁護士の契約状態（subscription_status）を更新する。
// 必要な秘密の値（Supabase の Edge Function Secrets）：
//   STRIPE_WEBHOOK_SECRET（whsec_...）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で入れる。
import { createClient } from "jsr:@supabase/supabase-js@2";

const enc = new TextEncoder();

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5分より古い通知は受け付けない
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

const STATUS: Record<string, string> = { active: "active", trialing: "active", past_due: "past_due", unpaid: "past_due", canceled: "canceled", incomplete_expired: "canceled" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();
  const ok = await verify(body, req.headers.get("stripe-signature") ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "");
  if (!ok) return new Response("bad signature", { status: 400 });

  const ev = JSON.parse(body);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const o = ev.data?.object ?? {};

  if (ev.type === "checkout.session.completed") {
    // 決済リンクに付けた client_reference_id（＝ログイン中の弁護士のID）で照合する
    const uid = o.client_reference_id;
    if (uid && /^[0-9a-f-]{36}$/.test(uid)) {
      await db.from("lawyers").update({ subscription_status: "active", stripe_customer_id: o.customer, stripe_subscription_id: o.subscription }).eq("user_id", uid);
    }
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const s = ev.type.endsWith("deleted") ? "canceled" : (STATUS[o.status] ?? "past_due");
    await db.from("lawyers").update({ subscription_status: s }).eq("stripe_subscription_id", o.id);
  }
  return new Response("ok");
});
