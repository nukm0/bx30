import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getVerifiedSession, supabaseConfig } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await getVerifiedSession(typeof body?.initData === "string" ? body.initData : "");
    const requestedFolder = String(body?.folder ?? "admin");
    const isReportEvidence = requestedFolder === "reports";
    if (!isReportEvidence && !["Владелец", "Заместитель владельца", "Администратор"].includes(session.role)) {
      return NextResponse.json({ error: "Недостаточно прав для загрузки файлов." }, { status: 403 });
    }
    const dataUrl = String(body?.dataUrl ?? "");
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: "Разрешены только PNG, JPEG, WEBP и GIF." }, { status: 400 });
    const binary = Buffer.from(match[2], "base64");
    if (!binary.length || binary.length > 5 * 1024 * 1024) return NextResponse.json({ error: "Максимальный размер изображения — 5 МБ." }, { status: 413 });
    const { url, key } = supabaseConfig();
    const ext = match[1].split("/")[1].replace("jpeg", "jpg");
    const filename = `${Date.now()}-${randomUUID()}.${ext}`;
    const folder = requestedFolder.replace(/[^a-z0-9/_-]/gi, "").slice(0, 50) || "admin";
    const path = `${folder}/${filename}`;
    const response = await fetch(`${url}/storage/v1/object/marketplace-media/${path}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": match[1], "x-upsert": "true" },
      body: binary,
    });
    if (!response.ok) return NextResponse.json({ error: "Не удалось сохранить изображение в хранилище." }, { status: 502 });
    return NextResponse.json({ url: `${url}/storage/v1/object/public/marketplace-media/${path}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const missingConfig = message.includes("not configured") || message.includes("must be configured");
    return NextResponse.json({ error: missingConfig ? "Хранилище сервера не подключено." : "Не удалось загрузить изображение." }, { status: missingConfig ? 503 : 400 });
  }
}
