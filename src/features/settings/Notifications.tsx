import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PALETTES, useAppearance, type Appearance } from "../../lib/appearance";
import { currentSubscription, disablePush, enablePush, hasKey, isIOS, isStandalone, matchesKey, pushSupported, serverTest, testNotification } from "../../lib/push";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useData } from "../../lib/data";
import { supabase } from "../../lib/supabase";

type State = "loading" | "unsupported" | "install" | "nokey" | "blocked" | "off" | "on";

async function computeState(): Promise<State> {
  if (!hasKey()) return "nokey";
  if (!pushSupported()) return isIOS() && !isStandalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const sub = Notification.permission === "granted" ? await currentSubscription() : null;
  return sub && matchesKey(sub) ? "on" : "off"; // inscrição de chave antiga aparece como "desativada"
}

function AppearanceSection() {
  const [a, set] = useAppearance();
  const seg = (key: "theme" | "paper", value: string, label: string) => (
    <button type="button" className="seg" aria-pressed={a[key] === value} onClick={() => set({ [key]: value } as Partial<Appearance>)}>
      {label}
    </button>
  );
  return (
    <section className="settings-block">
      <h3 className="modal-sub">Aparência</h3>
      <div className="seg-row">
        <span className="lbl">Tema</span>
        <div className="seg-group" role="group" aria-label="Tema">
          {seg("theme", "auto", "Automático")}
          {seg("theme", "light", "Claro")}
          {seg("theme", "dark", "Escuro")}
        </div>
      </div>
      <div className="seg-row">
        <span className="lbl">Paleta de cores</span>
        <div className="palette-options" role="group" aria-label="Paleta de cores">
          {PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className="palette-option"
              aria-pressed={a.palette === palette.id}
              onClick={() => set({ palette: palette.id })}
            >
              <span className="palette-swatch" style={{ backgroundColor: palette.surface }} aria-hidden="true">
                <i style={{ backgroundColor: palette.accent }} />
              </span>
              {palette.label}
            </button>
          ))}
        </div>
      </div>
      <div className="seg-row">
        <span className="lbl">Papel</span>
        <div className="seg-group" role="group" aria-label="Estilo do papel">
          {seg("paper", "grid", "Quadriculado")}
          {seg("paper", "ruled", "Pautado")}
          {seg("paper", "plain", "Liso")}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={a.cheer} onChange={(e) => set({ cheer: e.target.checked })} />
        Animação ao concluir o dia
      </label>
    </section>
  );
}

function CalendarSection() {
  const { ownerId } = useData();
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const storageKey = ownerId ? `pauta-calendar-feed:${ownerId}` : null;

  useEffect(() => {
    if (!storageKey) {
      setFeedUrl(null);
      return;
    }
    try {
      setFeedUrl(localStorage.getItem(storageKey));
      setError("");
    } catch (storageError) {
      setError(`Não foi possível ler o link salvo neste aparelho: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
    }
  }, [storageKey]);

  async function createFeed() {
    if (busy) return;
    if (!window.confirm("Criar um link substitui qualquer link de calendário anterior da conta. Se já houver uma assinatura, ela precisará ser atualizada. Continuar?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!storageKey) throw new Error("Não foi possível identificar a conta atual.");
      const probeKey = `${storageKey}:probe`;
      localStorage.setItem(probeKey, "ok");
      localStorage.removeItem(probeKey);
      const { data: token, error: createError } = await supabase.rpc("create_calendar_feed_token");
      if (createError) throw new Error(createError.message);
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("O servidor retornou um token de calendário inválido.");
      const url = new URL("/functions/v1/calendar-feed", import.meta.env.VITE_SUPABASE_URL);
      url.searchParams.set("token", token);
      const nextFeedUrl = url.toString();
      localStorage.setItem(storageKey, nextFeedUrl);
      setFeedUrl(nextFeedUrl);
      setMessage("Link criado. Adicione-o como calendário por assinatura.");
    } catch (createError) {
      setError(`Não foi possível criar o link de calendário: ${createError instanceof Error ? createError.message : String(createError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function revokeFeed() {
    if (busy || !window.confirm("Revogar o link interrompe a sincronização e invalida todas as assinaturas atuais. Continuar?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: revokeError } = await supabase.rpc("revoke_calendar_feed_token");
      if (revokeError) throw new Error(revokeError.message);
      if (storageKey) localStorage.removeItem(storageKey);
      setFeedUrl(null);
      setMessage("Link revogado.");
    } catch (revokeError) {
      setError(`Não foi possível revogar o link: ${revokeError instanceof Error ? revokeError.message : String(revokeError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyFeed() {
    if (!feedUrl) return;
    setError("");
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMessage("Link copiado.");
    } catch (copyError) {
      setError(`Não foi possível copiar o link. Selecione e copie o endereço manualmente. ${copyError instanceof Error ? copyError.message : String(copyError)}`);
    }
  }

  const webcalUrl = feedUrl?.replace(/^https?:/, "webcal:");
  const googleUrl = feedUrl
    ? `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?url=${encodeURIComponent(feedUrl)}`
    : null;

  return (
    <section className="settings-block calendar-settings">
      <h3 className="modal-sub">Calendário</h3>
      <p>Assine uma agenda com tarefas que têm prazo. Tarefas concluídas deixam de aparecer após a próxima atualização do calendário.</p>
      <p className="calendar-sync-note">Apple e Google controlam a frequência de atualização das agendas assinadas; mudanças podem levar algumas horas para aparecer.</p>
      {!feedUrl ? (
        <button type="button" className="primary" disabled={busy || !ownerId} onClick={() => void createFeed()}>
          {busy ? "Criando link…" : "Criar link de assinatura"}
        </button>
      ) : (
        <>
          <label className="calendar-feed-label">
            Link privado da agenda
            <input className="calendar-feed-url" readOnly value={feedUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Link privado da agenda" />
          </label>
          <div className="calendar-feed-actions">
            <button type="button" className="chipbtn" onClick={() => void copyFeed()}>Copiar link</button>
            <a className="chipbtn" href={webcalUrl ?? undefined}>Abrir no Apple Calendar</a>
            <a className="chipbtn" href={googleUrl ?? undefined} target="_blank" rel="noreferrer">Adicionar ao Google Calendar</a>
            <button type="button" className="chipbtn clear" disabled={busy} onClick={() => void revokeFeed()}>Revogar link</button>
          </div>
          <p className="calendar-sync-note">O link funciona como uma senha: qualquer pessoa que o receber poderá ver títulos, prazos, horários, listas, etiquetas e prioridades. Ele fica salvo apenas neste navegador; se trocar de aparelho e não o tiver, gere outro para substituir este.</p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function SharingSection() {
  return (
    <section className="settings-block">
      <h3 className="modal-sub">Compartilhamento</h3>
      <p>Em navegadores compatíveis, como Chrome no Android, compartilhe texto ou uma página e escolha o Pauta para criar uma tarefa ou nota.</p>
      <p>No iPhone, crie um Atalho na Folha de Compartilhamento para codificar o texto recebido e abrir uma URL do Pauta com estes parâmetros:</p>
      <code className="share-url-template">/?share=1&amp;title=...&amp;text=...&amp;url=...</code>
      <p className="calendar-sync-note">Os valores precisam estar codificados para URL. A PWA no iOS não consegue se registrar diretamente como destino da Folha de Compartilhamento; o Atalho faz essa ponte.</p>
    </section>
  );
}

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  const refresh = async () => setState(await computeState());
  useEffect(() => {
    refresh();
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    setInfo(null);
    try {
      const res = await fn();
      if (res) setInfo(res);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text === "denied") setMsg("A permissão não foi concedida. Se mudar de ideia, libere nas configurações do navegador.");
      else if ("brave" in navigator && /registration failed|push service|abort/i.test(text)) setMsg("O Brave bloqueia notificações por padrão. Abra brave://settings/privacy, ative “Usar serviços do Google para mensagens push” e tente de novo. Detalhe: " + text);
      else setMsg(text);
    }
    await refresh();
    setBusy(false);
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="rem-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 id="rem-title">Ajustes</h2>
        <AppearanceSection />
        <hr />
        <CalendarSection />
        <hr />
        <SharingSection />
        <hr />
        <h3 className="modal-sub">Lembretes</h3>

        {state === "loading" && <p>Verificando…</p>}
        {state === "nokey" && <p>As notificações ainda não foram configuradas neste app (falta a chave <code>VITE_VAPID_PUBLIC_KEY</code>).</p>}
        {state === "install" && (
          <p>No iPhone, as notificações só funcionam com o app instalado. Toque em Compartilhar, depois em “Adicionar à Tela de Início”, abra a Pauta por esse ícone e volte aqui.</p>
        )}
        {state === "unsupported" && <p>Este navegador não oferece notificações para sites.</p>}
        {state === "blocked" && <p>As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e volte aqui.</p>}
        {state === "off" && (
          <>
            <p>Receba um aviso no horário das tarefas, mesmo com o app fechado. Vale só para este aparelho: ative também nos outros.</p>
            <button className="primary" disabled={busy} onClick={() => run(enablePush)}>Ativar neste aparelho</button>
          </>
        )}
        {state === "on" && (
          <>
            <p>Ativadas neste aparelho. Tarefas com prazo e horário avisam na hora marcada. Sem horário, o aviso sai às 09:00 do dia do prazo.</p>
            <div className="modal-actions">
              <button className="chipbtn" disabled={busy} onClick={() => run(testNotification)}>Enviar teste</button>
              <button className="chipbtn" disabled={busy} onClick={() => run(serverTest)}>Testar pelo servidor</button>
              <button className="chipbtn clear" disabled={busy} onClick={() => run(disablePush)}>Desativar neste aparelho</button>
            </div>
          </>
        )}
        {msg && <p className="error" role="alert">{msg}</p>}
        {info && <p role="status">{info}</p>}

        <button ref={closeRef} className="ghost" onClick={onClose}>Fechar</button>
      </div>
    </div>,
    document.body
  );
}
