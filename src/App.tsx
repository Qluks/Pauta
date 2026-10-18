import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Login from "./Login";
import Sidebar from "./Sidebar";
import Tasks from "./Tasks";
import Notes from "./Notes";
import { DataProvider, useData } from "./data";
import { ToastProvider } from "./Toast";

function Main({ onSignOut }: { onSignOut: () => void }) {
  const { lists, loading } = useData();
  const [view, setView] = useState("today");

  // Atalhos: 1-6 trocam de tela, "/" vai para a busca
  useEffect(() => {
    const order = ["today", "upcoming", "all", "done", "notes", "archive"];
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
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

  return (
    <div className="shell">
      <Sidebar view={view} setView={setView} onSignOut={onSignOut} />
      <main className="content">{view === "notes" || view === "archive" ? <Notes view={view} /> : <Tasks view={view} />}</main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <ToastProvider>
      <DataProvider>
        <Main onSignOut={() => supabase.auth.signOut()} />
      </DataProvider>
    </ToastProvider>
  );
}
