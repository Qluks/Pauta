import { supabase } from "./supabase";

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const hasKey = () => !!KEY;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const registration = () => navigator.serviceWorker.ready;

export async function currentSubscription() {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function enablePush() {
  if (!KEY) throw new Error("A chave de notificações (VITE_VAPID_PUBLIC_KEY) não está configurada.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(KEY) });
  await saveSubscription(sub);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

// Mantém o fuso horário do aparelho atualizado no servidor
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (sub) await saveSubscription(sub);
  } catch {
    /* sem problema: tenta de novo na próxima abertura */
  }
}

export async function testNotification() {
  const reg = await registration();
  await reg.showNotification("Pauta", {
    body: "Os lembretes estão funcionando neste aparelho.",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: "teste",
  });
}

// Pede ao servidor (função send-reminders) para enviar uma notificação de teste a todos os aparelhos da conta
export async function serverTest(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("send-reminders", { body: { test: true } });
  if (error) {
    let detail = error.message;
    try {
      const res = (error as unknown as { context?: Response }).context;
      if (res) {
        const text = await res.text();
        try {
          detail = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          detail = text || detail;
        }
      }
    } catch {
      /* usa a mensagem padrão */
    }
    throw new Error(`A função send-reminders respondeu com erro: ${detail}`);
  }
  const r = data as { devices: number; sent: number; errors: string[] };
  if (r.sent === 0) throw new Error(`A função respondeu, mas o envio falhou. ${r.errors.join(" | ")}`);
  return `Enviado pelo servidor para ${r.sent} de ${r.devices} aparelho(s).${r.errors.length ? " Erros: " + r.errors.join(" | ") : ""}`;
}
