import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Login from "../features/auth/Login";
import ResetPassword from "../features/auth/ResetPassword";
import Sidebar from "../features/navigation/Sidebar";
import { DataProvider, useData } from "../lib/data";
import { ToastProvider } from "../components/Toast";
import { syncPush } from "../lib/push";
import MobileNav from "../features/navigation/MobileNav";
import CommandPalette from "../features/navigation/CommandPalette";
import ShortcutsHelp from "../features/navigation/ShortcutsHelp";
import SettingsPanel from "../features/settings/Notifications";
import { useSavedTaskFilters } from "../features/tasks/savedFilters";
import CaptureSheet from "../components/CaptureSheet";
import Sheet from "../components/Sheet";

const Tasks = lazy(() => import("../features/tasks/Tasks"));
const Notes = lazy(() => import("../features/notes/Notes"));

type Req = { id: string; n: number };
type IncomingShare = { id: string; title: string; text: string; url: string | null };

function readIncomingShare(): IncomingShare | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("share") !== "1") return null;
  const title = params.get("title")?.trim().slice(0, 200) ?? "";
  const text = params.get("text")?.trim().slice(0, 4000) ?? "";
  const rawUrl = params.get("url")?.trim().slice(0, 2048) ?? "";
  const httpUrl = (value: string): string | null => {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
    } catch {
      return null;
    }
    return null;
  };
  let url = httpUrl(rawUrl);
  if (!url) {
    const textUrl = text.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;:!?)\]]+$/, "") ?? "";
    url = httpUrl(textUrl);
  }
  if (!title && !text && !url) return null;
  return { id: crypto.randomUUID(), title, text, url };
}

const conflictFields = ["title", "body", "name", "due_at", "due_time", "done", "priority", "position", "archived", "pinned"];
const conflictFieldLabels: Record<string, string> = {
  title: "Título",
  body: "Texto",
  name: "Nome",
  due_at: "Prazo",
  due_time: "Horário",
  done: "Concluída",
  priority: "Prioridade",
  position: "Ordem",
  archived: "Arquivada",
  pinned: "Fixada",
};
function conflictValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  const text = typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value) ?? String(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function Main({ onSignOut }: { onSignOut: () => void }) {
  const { lists, loading, online, pendingMutations, retrySync, resolveConflict } = useData();
  const savedFilters = useSavedTaskFilters();
  const [view, setView] = useState("today");
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [incomingShare, setIncomingShare] = useState<IncomingShare | null>(readIncomingShare);
  const [shareMode, setShareMode] = useState<"task" | "note" | null>(null);
  const [taskReq, setTaskReq] = useState<Req | null>(null);
  const [noteReq, setNoteReq] = useState<Req | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setTransitioning(false);
    const frame = window.requestAnimationFrame(() => setTransitioning(true));
    const timer = window.setTimeout(() => setTransitioning(false), 280);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [view]);

  useEffect(() => {
    if (!incomingShare) return;
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.hash}`);
  }, [incomingShare]);

  // Atalhos: Ctrl+K paleta · ? ajuda · 1-6 telas · / busca
  useEffect(() => {
    const order = ["today", "upcoming", "week", "all", "done", "notes", "archive"];
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (document.querySelector(".sheet-backdrop, .modal-backdrop, .menu-backdrop")) return; // com janela aberta, os atalhos de tela ficam parados
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (/^[1-6]$/.test(e.key)) {
        setView(order[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Se a lista aberta foi excluída em outro aparelho, volta para "Todas"
  useEffect(() => {
    if (!loading && view.startsWith("list:") && !lists.some((l) => `list:${l.id}` === view)) setView("all");
  }, [loading, lists, view]);

  useEffect(() => {
    if (view.startsWith("saved:") && !savedFilters.some((filter) => `saved:${filter.id}` === view)) setView("all");
  }, [savedFilters, view]);

  // Toque numa notificação: o service worker pede para abrir uma tela
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "open-view" && typeof e.data.view === "string") setView(e.data.view);
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);

  // Mantém o fuso horário do aparelho atualizado para os lembretes
  useEffect(() => {
    syncPush();
  }, []);

  const openTask = (id: string) => {
    if (view === "notes" || view === "archive") setView("all");
    setTaskReq({ id, n: Date.now() });
  };
  const openNote = (id: string, archived: boolean) => {
    setView(archived ? "archive" : "notes");
    setNoteReq({ id, n: Date.now() });
  };
  const finishShare = () => {
    setIncomingShare(null);
    setShareMode(null);
  };

  return (
    <div className="shell">
      {(!online || pendingMutations.length > 0) && (
        <section className={`sync-status${online ? "" : " is-offline"}`} aria-live="polite" aria-label="Estado da sincronização">
          <div className="sync-status-line">
            <span>{online ? "Alterações aguardando sincronização" : "Você está offline"}</span>
            <span>{pendingMutations.length ? `${pendingMutations.length} pendente${pendingMutations.length === 1 ? "" : "s"}` : "Novas alterações serão salvas localmente quando possível"}</span>
            {online && pendingMutations.some((mutation) => !mutation.conflict) && (
              <button type="button" className="ghost" onClick={() => void retrySync()}>Sincronizar</button>
            )}
          </div>
          {pendingMutations.filter((mutation) => mutation.conflict).map((mutation) => {
            const local = { ...(mutation.base ?? {}), ...mutation.payload };
            const remote = mutation.conflict ?? {};
            const label = String(local.title ?? local.name ?? remote.title ?? remote.name ?? (mutation.table === "notes" ? "Nota" : mutation.table === "tasks" ? "Tarefa" : "Item"));
            const fields = conflictFields.filter((field) => field in local || field in remote).slice(0, 6);
            return (
              <div className="sync-conflict" key={mutation.key} role="group" aria-label={`Resolver conflito: ${label}`}>
                <span>“{label}” foi alterado em outro dispositivo. Escolha qual versão manter.</span>
                <details className="sync-conflict-details">
                  <summary>Comparar versões</summary>
                  <ul>
                    {fields.map((field) => (
                      <li key={field}>
                        <strong>{conflictFieldLabels[field] ?? field}</strong>
                        <span>Este aparelho: {mutation.operation === "delete" ? "item excluído" : conflictValue(local[field])}</span>
                        <span>Nuvem: {mutation.conflict?.__missing_remote ? "item excluído" : conflictValue(remote[field])}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <button type="button" className="chipbtn" onClick={() => void resolveConflict(mutation, "local")}>Manter minha versão</button>
                <button type="button" className="chipbtn" onClick={() => void resolveConflict(mutation, "remote")}>Usar versão da nuvem</button>
              </div>
            );
          })}
          {pendingMutations.some((mutation) => mutation.error) && (
            <p className="sync-error" role="alert">
              Algumas alterações não puderam ser sincronizadas. {pendingMutations.find((mutation) => mutation.error)?.error}
              <button type="button" className="ghost" onClick={() => void retrySync()}>Tentar novamente</button>
            </p>
          )}
        </section>
      )}
      <Sidebar view={view} setView={setView} onSignOut={onSignOut} onSearch={() => setPalette(true)} onSettings={() => setSettings(true)} />
      <main className={`content${transitioning ? " screen-entering" : ""}`}>
        <Suspense fallback={<p className="screen-loading" role="status">Abrindo…</p>}>
          {view === "notes" || view === "archive" ? (
            <Notes view={view} request={noteReq} onHandled={() => setNoteReq(null)} />
          ) : (
            <Tasks view={view} openRequest={taskReq} onHandled={() => setTaskReq(null)} />
          )}
        </Suspense>
      </main>
      <MobileNav view={view} setView={setView} onSignOut={onSignOut} onSearch={() => setPalette(true)} onSettings={() => setSettings(true)} />
      {palette && (
        <CommandPalette
          view={view}
          setView={setView}
          onClose={() => setPalette(false)}
          onOpenTask={openTask}
          onOpenNote={openNote}
          onSettings={() => setSettings(true)}
          onHelp={() => setHelp(true)}
        />
      )}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}
      {incomingShare && !shareMode && (
        <Sheet title="Conteúdo compartilhado" onClose={finishShare}>
          <p>O que você quer criar com este conteúdo?</p>
          {(incomingShare.title || incomingShare.text) && <p className="shared-preview">{incomingShare.title || incomingShare.text}</p>}
          {incomingShare.url && <p className="shared-preview">{incomingShare.url}</p>}
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => setShareMode("task")}>Criar tarefa</button>
            <button type="button" className="chipbtn" onClick={() => setShareMode("note")}>Criar nota</button>
          </div>
        </Sheet>
      )}
      {incomingShare && shareMode && (
        <CaptureSheet view="all" mode={shareMode} shared={incomingShare} onClose={finishShare} />
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(window.location.hash));
  const nextScreen = !ready ? null : recovery && session ? "reset" : session ? "app" : "login";
  const [displayScreen, setDisplayScreen] = useState<"login" | "app" | "reset" | null>(null);
  const [screenPhase, setScreenPhase] = useState<"entering" | "leaving" | "idle">("entering");
  const displayScreenRef = useRef<"login" | "app" | "reset" | null>(null);
  const switchTimer = useRef<number | null>(null);
  const phaseTimer = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!nextScreen || displayScreenRef.current === nextScreen) return;
    if (switchTimer.current !== null) window.clearTimeout(switchTimer.current);
    if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = () => {
      displayScreenRef.current = nextScreen;
      setDisplayScreen(nextScreen);
      setScreenPhase("entering");
      phaseTimer.current = window.setTimeout(() => setScreenPhase("idle"), reducedMotion ? 0 : 360);
    };

    if (!displayScreenRef.current || reducedMotion) {
      show();
      return;
    }
    setScreenPhase("leaving");
    switchTimer.current = window.setTimeout(show, 180);

    return () => {
      if (switchTimer.current !== null) window.clearTimeout(switchTimer.current);
      if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current);
    };
  }, [nextScreen]);

  useEffect(() => () => {
    if (switchTimer.current !== null) window.clearTimeout(switchTimer.current);
    if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current);
  }, []);

  if (!ready || !displayScreen) return null;
  if (displayScreen === "reset") {
    return (
      <div className={`surface-transition ${screenPhase}`}>
        <ResetPassword
          onDone={() => {
            setRecovery(false);
            history.replaceState(null, "", window.location.pathname);
          }}
        />
      </div>
    );
  }
  if (displayScreen === "login") return <div className={`surface-transition ${screenPhase}`}><Login /></div>;
  return (
    <div className={`surface-transition ${screenPhase}`}>
      <ToastProvider>
        <DataProvider>
          <Main onSignOut={() => supabase.auth.signOut()} />
        </DataProvider>
      </ToastProvider>
    </div>
  );
}
