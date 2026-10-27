import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCalendar, type FeedList, type FeedTask } from "./ical.ts";

const encoder = new TextEncoder();
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function response(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response("Method not allowed", 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return response("Not found", 404, { "Content-Type": "text/plain; charset=utf-8" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Calendar feed is missing Supabase server configuration.");
    return response("Calendar feed unavailable", 500, { "Content-Type": "text/plain; charset=utf-8" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: feed, error: feedError } = await admin
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (feedError) {
    console.error("Could not verify calendar feed token:", feedError.message);
    return response("Calendar feed unavailable", 500, { "Content-Type": "text/plain; charset=utf-8" });
  }
  if (!feed) return response("Not found", 404, { "Content-Type": "text/plain; charset=utf-8" });

  const [taskResult, listResult] = await Promise.all([
    admin.from("tasks")
      .select("id,title,due_at,due_time,created_at,updated_at,list_id,tags,priority")
      .eq("user_id", feed.user_id)
      .eq("done", false)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .order("due_time", { ascending: true }),
    admin.from("lists").select("id,name").eq("user_id", feed.user_id),
  ]);
  if (taskResult.error || listResult.error) {
    console.error("Could not load calendar feed data:", taskResult.error?.message ?? listResult.error?.message);
    return response("Calendar feed unavailable", 500, { "Content-Type": "text/plain; charset=utf-8" });
  }

  const body = buildCalendar((taskResult.data ?? []) as FeedTask[], (listResult.data ?? []) as FeedList[]);
  const etag = `"${await sha256(body)}"`;
  const headers = { ETag: etag, "Content-Disposition": 'inline; filename="pauta.ics"' };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return response(request.method === "HEAD" ? "" : body, 200, headers);
});
