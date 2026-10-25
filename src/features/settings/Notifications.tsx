import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppearance, type Appearance } from "../../lib/appearance";
import { currentSubscription, disablePush, enablePush, hasKey, isIOS, isStandalone, matchesKey, pushSupported, serverTest, testNotification } from "../../lib/push";
import { useDialogFocus } from "../../lib/useDialogFocus";

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
