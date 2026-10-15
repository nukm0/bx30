import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession, supabaseRequest } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getVerifiedSession(request.headers.get("x-telegram-init-data") || "");
    if (!["Владелец", "Заместитель владельца", "Администратор", "Модератор", "Стажёр"].includes(session.role)) {
      return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
    }
    const rows = await supabaseRequest("marketplace_admin_audit?select=id,actor_telegram_id,actor_username,actor_name,action,target,created_at&order=created_at.desc&limit=250") as any[];
    const entries = (rows || []).map((row: any) => ({
      id: row.id,
      actor: `${row.actor_name || "Пользователь"} · ${row.actor_username ? `@${row.actor_username}` : "без username"} · ID ${row.actor_telegram_id}`,
      action: row.action,
      target: row.target,
      time: row.created_at ? new Date(row.created_at).toLocaleString("ru-RU") : "",
    }));
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const missingConfig = message.includes("not configured") || message.includes("must be configured");
    return NextResponse.json({ error: missingConfig ? "Серверная база не подключена." : "Не удалось загрузить журнал." }, { status: missingConfig ? 503 : 400 });
  }
}
