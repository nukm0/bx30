import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession, supabaseRequest } from "../../../../lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    let isStaff = false;
    const initData = request.headers.get("x-telegram-init-data") || "";
    if (initData) {
      try {
        const session = await getVerifiedSession(initData);
        isStaff = ["Владелец", "Заместитель владельца", "Администратор", "Модератор", "Стажёр"].includes(session.role);
      } catch { isStaff = false; }
    }
    const bannerQuery = isStaff
      ? "marketplace_banners?select=id,title,description,image_url,target_url,show_home,show_shops,hidden,created_at&order=created_at.desc"
      : "marketplace_banners?hidden=eq.false&select=id,title,description,image_url,target_url,show_home,show_shops,hidden,created_at&order=created_at.desc";
    const shopQuery = isStaff
      ? "marketplace_shops?select=id,name,description,logo_url,owner_telegram_id,created_at,hidden&order=created_at.desc"
      : "marketplace_shops?hidden=eq.false&select=id,name,description,logo_url,owner_telegram_id,created_at,hidden&order=created_at.desc";
    const [banners, shops, faq, moderation, shopSubscriptions] = await Promise.all([
      supabaseRequest(bannerQuery) as Promise<any[]>,
      supabaseRequest(shopQuery) as Promise<any[]>,
      supabaseRequest("marketplace_faq_entries?select=id,section,heading,parent_heading,question,answer,created_at&order=created_at.asc") as Promise<any[]>,
      supabaseRequest("marketplace_listing_moderation?select=object_type,object_id,public_hidden,admin_queue_hidden") as Promise<any[]>,
      supabaseRequest("marketplace_shop_subscriptions?select=shop_id,telegram_id") as Promise<any[]>,
    ]);
    return NextResponse.json({
      banners: (banners || []).map((b:any) => ({ id:b.id, title:b.title, sub:b.description, kicker:"MARKETPLACE · ОБЪЯВЛЕНИЕ", color:"banner-purple", url:b.target_url||"", image:b.image_url||"", home:!!b.show_home, shops:!!b.show_shops, hidden:!!b.hidden, createdAt:b.created_at })),
      shops: (shops || []).map((s:any) => ({ id:s.id, name:s.name, ownerTelegramId:Number(s.owner_telegram_id), owner:`ID: ${s.owner_telegram_id}`, description:s.description||"", logo:s.logo_url||"", createdAt:s.created_at, hidden:!!s.hidden, subscriberCount:(shopSubscriptions||[]).filter((sub:any)=>String(sub.shop_id)===String(s.id)).length })),
      faq: (faq || []).map((f:any) => ({ id:f.id, section:f.section, heading:f.heading||"", parent:f.parent_heading||"", question:f.question, answer:f.answer, createdAt:f.created_at })),
      hiddenListingIds: (moderation || []).filter((m:any)=>m.public_hidden).map((m:any)=>String(m.object_id)),
      adminQueueHiddenIds: isStaff ? (moderation || []).filter((m:any)=>m.admin_queue_hidden).map((m:any)=>String(m.object_id)) : [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ banners: [], shops: [], faq: [], hiddenListingIds: [], adminQueueHiddenIds: [], persistenceConfigured: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
