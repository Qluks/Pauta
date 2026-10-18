import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Login from "./Login";
import Sidebar from "./Sidebar";
import Tasks from "./Tasks";
import Notes from "./Notes";
import type { List } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const [view, setView] = useState("today");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("lists")
      .select("id,name")
      .order("created_at")
      .then(({ data }) => setLists((data as List[]) ?? []));
  }, [session]);

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

  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <div className="shell">
      <Sidebar
        lists={lists}
        setLists={setLists}
        view={view}
        setView={setView}
        onSignOut={() => supabase.auth.signOut()}
      />
      <main className="content">
        {view === "notes" || view === "archive" ? <Notes view={view} /> : <Tasks view={view} lists={lists} />}
      </main>
    </div>
  );
}
