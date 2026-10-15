import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession, supabaseRequest } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const session = await getVerifiedSession(initData);
    if (!["Владелец", "Заместитель владельца", "Администратор", "Модератор", "Стажёр"].includes(session.role)) {
      return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
    }
    const rows = await supabaseRequest("marketplace_reports?select=*&order=created_at.desc&limit=250") as any[];
    const reports = (rows || []).map((r: any) => ({
      id: r.id,
      serverId: r.id,
      objectId: r.object_id || "",
      objectOwnerUsername: r.object_owner_username || "",
      title: r.object_title || r.object_id || `${r.object_type || "Объект"} · жалоба`,
      seller: r.object_owner_username ? `@${r.object_owner_username}` : r.object_owner_telegram_id ? String(r.object_owner_telegram_id) : "ID не указан",
      reason: r.reason,
      details: r.details,
      status: ({ new: "Новая", hidden_pending: "Скрыто на время проверки", in_progress: "В процессе", awaiting_owner: "Ожидает решения владельца", resolved: "Решено" } as Record<string, string>)[r.status] || r.status,
      decisionComment: [r.review_comment && `Заключение: ${r.review_comment}`, r.owner_comment && `Решение владельца: ${r.owner_comment}`].filter(Boolean).join(" · "),
      photos: Array.isArray(r.materials) ? r.materials : [],
      reporter: `Telegram ID ${r.reporter_telegram_id}`,
      reporterId: Number(r.reporter_telegram_id),
      ownerTelegramId: r.object_owner_telegram_id ? Number(r.object_owner_telegram_id) : undefined,
      reviewer: r.reviewer_telegram_id ? `ID ${r.reviewer_telegram_id}${r.reviewer_username ? ` · @${r.reviewer_username}` : ""}` : undefined,
      objectType: r.object_type,
      recommendedAction: r.recommended_action,
      recommendedDurationMinutes: r.recommended_duration_minutes || null,
      ownerDecision: r.owner_decision || null,
      ownerComment: r.owner_comment || "",
      createdAt: r.created_at,
    }));
    return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const missingConfig = message.includes("not configured") || message.includes("must be configured");
    return NextResponse.json({ error: missingConfig ? "Серверная база не подключена." : "Не удалось загрузить жалобы." }, { status: missingConfig ? 503 : 400 });
  }
}
