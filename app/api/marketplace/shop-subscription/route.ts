import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession, supabaseRequest } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await getVerifiedSession(typeof body?.initData === "string" ? body.initData : "");
    const shopId = String(body?.shopId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(shopId)) return NextResponse.json({ error: "Неверный магазин." }, { status: 400 });
    const shop = await supabaseRequest(`marketplace_shops?id=eq.${encodeURIComponent(shopId)}&hidden=eq.false&select=id,owner_telegram_id&limit=1`) as any[];
    if (!shop?.length) return NextResponse.json({ error: "Магазин не найден." }, { status: 404 });
    if (Number(shop[0].owner_telegram_id) === session.user.id) return NextResponse.json({ error: "Нельзя подписаться на собственный магазин." }, { status: 400 });
    if (body?.active) {
      await supabaseRequest("marketplace_shop_subscriptions?on_conflict=shop_id,telegram_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ shop_id: shopId, telegram_id: session.user.id }) });
    } else {
      await supabaseRequest(`marketplace_shop_subscriptions?shop_id=eq.${encodeURIComponent(shopId)}&telegram_id=eq.${session.user.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    const countRows = await supabaseRequest(`marketplace_shop_subscriptions?shop_id=eq.${encodeURIComponent(shopId)}&select=telegram_id`) as any[];
    return NextResponse.json({ active: !!body?.active, subscriberCount: countRows?.length || 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const banned = message.includes("Account is banned");
    const missingConfig = message.includes("not configured") || message.includes("must be configured");
    return NextResponse.json({ error: banned ? "Аккаунт заблокирован." : missingConfig ? "Серверная база не подключена." : "Не удалось изменить подписку." }, { status: banned ? 403 : missingConfig ? 503 : 400 });
  }
}
