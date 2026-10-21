import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import Sidebar from "./Sidebar";
import Tasks from "./Tasks";
import Notes from "./Notes";
import { DataProvider, useData } from "./data";
import { ToastProvider } from "./Toast";
import { syncPush } from "./push";
import MobileNav from "./MobileNav";
import CommandPalette from "./CommandPalette";
import ShortcutsHelp from "./ShortcutsHelp";
import SettingsPanel from "./Notifications";

type Req = { id: string; n: number };

function Main({ onSignOut }: { onSignOut: () => void }) {
  const { lists, loading } = useData();
  const [view, setView] = useState("today");
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [taskReq, setTaskReq] = useState<Req | null>(null);
  const [noteReq, setNoteReq] = useState<Req | null>(null);

  // Atalhos: Ctrl+K paleta · ? ajuda · 1-6 telas · / busca
  useEffect(() => {
    const order = ["today", "upcoming", "all", "done", "notes", "archive"];
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

  return (
    <div className="shell">
      <Sidebar view={view} setView={setView} onSignOut={onSignOut} onSearch={() => setPalette(true)} onSettings={() => setSettings(true)} />
      <main className="content">
        {view === "notes" || view === "archive" ? (
          <Notes view={view} request={noteReq} onHandled={() => setNoteReq(null)} />
        ) : (
          <Tasks view={view} openRequest={taskReq} onHandled={() => setTaskReq(null)} />
        )}
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
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(window.location.hash));

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

  if (!ready) return null;
  if (recovery && session) {
    return (
      <ResetPassword
        onDone={() => {
          setRecovery(false);
          history.replaceState(null, "", window.location.pathname);
        }}
      />
    );
  }
  if (!session) return <Login />;

  return (
    <ToastProvider>
      <DataProvider>
        <Main onSignOut={() => supabase.auth.signOut()} />
      </DataProvider>
    </ToastProvider>
  );
}
