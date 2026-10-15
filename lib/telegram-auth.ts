import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

export function verifyTelegramInitData(initData: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!initData || initData.length > 16_384) throw new Error("Invalid initData");

  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!suppliedHash || !Number.isFinite(authDate)) throw new Error("Missing Telegram signature");
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 86_400) throw new Error("Telegram session expired");

  params.delete("hash");
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");
  const expected = Buffer.from(calculatedHash, "hex");
  const received = Buffer.from(suppliedHash, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Invalid Telegram signature");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user is missing");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Invalid Telegram user ID");
  return user;
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  return { url, key };
}

export async function sendTelegramMessage(telegramId: number, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !Number.isSafeInteger(telegramId) || telegramId <= 0) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message, disable_web_page_preview: true }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Database request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function getVerifiedSession(initData: string, options: { allowBanned?: boolean } = {}) {
  const user = verifyTelegramInitData(initData);
  const id = String(user.id);
  let role = id === "998579758" ? "Владелец" : "Участник";
  let shop: any = null;
  let ban: any = null;

  await supabaseRequest("marketplace_users?on_conflict=telegram_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      photo_url: user.photo_url ?? null,
      updated_at: new Date().toISOString(),
    }),
  });

  if (user.id !== 998579758) {
    const roles = await supabaseRequest(`marketplace_staff_roles?telegram_id=eq.${id}&select=role&limit=1`) as Array<{ role: string }>;
    if (roles?.[0]?.role) role = roles[0].role;
  }
  const shops = await supabaseRequest(`marketplace_shops?owner_telegram_id=eq.${id}&hidden=eq.false&select=id,name,description,logo_url,created_at,owner_telegram_id&limit=1`) as any[];
  shop = shops?.[0] ?? null;
  if (user.id !== 998579758 && role === "Участник" && shop) role = "Магазин";

  const bans = await supabaseRequest(`marketplace_bans?telegram_id=eq.${id}&active=eq.true&select=reason,permanent,expires_at,created_at&order=created_at.desc&limit=5`) as any[];
  const now = Date.now();
  ban = bans?.find((item) => item.permanent || (item.expires_at && new Date(item.expires_at).getTime() > now)) ?? null;
  if (ban && !options.allowBanned && user.id !== 998579758) throw new Error("Account is banned");
  const profileRows = await supabaseRequest(`marketplace_users?telegram_id=eq.${id}&select=verified,verified_full_name,verified_nickname&limit=1`) as any[];
  const notifications = await supabaseRequest(`marketplace_notifications?telegram_id=eq.${id}&read=eq.false&select=id,title,message,created_at&order=created_at.desc&limit=50`) as any[];
  const shopSubscriptionRows = await supabaseRequest(`marketplace_shop_subscriptions?telegram_id=eq.${id}&select=shop_id`) as any[];
  if (shop?.id) {
    const subscriberRows = await supabaseRequest(`marketplace_shop_subscriptions?shop_id=eq.${encodeURIComponent(String(shop.id))}&select=telegram_id`) as any[];
    shop.subscriber_count = subscriberRows?.length || 0;
  }

  return { user, role, isOwner: user.id === 998579758, shop, ban, verified: !!profileRows?.[0]?.verified, notifications: notifications || [], shopSubscriptions: (shopSubscriptionRows || []).map((row:any)=>String(row.shop_id)) };
}
