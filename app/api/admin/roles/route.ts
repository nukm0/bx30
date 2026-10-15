import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession, supabaseRequest } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getVerifiedSession(request.headers.get("x-telegram-init-data") || "");
    if (session.role !== "Владелец" && session.role !== "Заместитель владельца") return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
    const roles = await supabaseRequest("marketplace_staff_roles?select=telegram_id,role,updated_at&order=updated_at.desc") as any[];
    const users = await supabaseRequest("marketplace_users?select=telegram_id,username,first_name,last_name") as any[];
    const userMap = new Map((users||[]).map((u:any)=>[String(u.telegram_id),u]));
    return NextResponse.json({ staffRoles: (roles||[]).map((r:any) => ({ telegramId:r.telegram_id, role:r.role, username:userMap.get(String(r.telegram_id))?.username || "", name:[userMap.get(String(r.telegram_id))?.first_name,userMap.get(String(r.telegram_id))?.last_name].filter(Boolean).join(" ") })) }, { headers:{"Cache-Control":"no-store"} });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить роли." }, { status: 400 });
  }
}
