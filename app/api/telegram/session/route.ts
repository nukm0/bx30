import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const initData = typeof body?.initData === "string" ? body.initData : "";
    const session = await getVerifiedSession(initData, { allowBanned: true });
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const missingConfig = message.includes("not configured") || message.includes("must be configured");
    return NextResponse.json({ error: missingConfig ? "Серверная авторизация не настроена." : "Не удалось подтвердить сессию Telegram." }, { status: missingConfig ? 503 : 401, headers: { "Cache-Control": "no-store" } });
  }
}
