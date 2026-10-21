import { ReactNode, useState } from "react";
import { useData } from "./data";
import { isDormant, today } from "./util";
import Sheet from "./Sheet";
import Sidebar from "./Sidebar";
import CaptureSheet from "./CaptureSheet";

type Props = { view: string; setView: (v: string) => void; onSignOut: () => void; onSearch: () => void; onSettings: () => void };

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICONS = {
  today: icon(<><path d="M3 12h18" /><circle cx="12" cy="12" r="4.5" fill="currentColor" /></>),
  upcoming: icon(<><path d="M3 12h18" /><circle cx="6" cy="12" r="2.5" /><circle cx="12" cy="12" r="2.5" /><circle cx="18" cy="12" r="2.5" /></>),
  notes: icon(<><rect x="4" y="3.5" width="16" height="17" rx="3" /><path d="M8 9h8M8 13h5" /></>),
  lists: icon(<><path d="M10 7h10M10 12h10M10 17h10" /><circle cx="5" cy="7" r="1.2" fill="currentColor" /><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="5" cy="17" r="1.2" fill="currentColor" /></>),
  plus: icon(<path d="M12 5v14M5 12h14" />),
};

export default function MobileNav({ view, setView, onSignOut, onSearch, onSettings }: Props) {
  const { tasks } = useData();
  const [menu, setMenu] = useState(false);
  const [capture, setCapture] = useState(false);
  const t0 = today();
  const todayCount = tasks.filter((t) => !t.done && !isDormant(t) && t.due_at && t.due_at <= t0).length;
  const inLists = view.startsWith("list:") || view === "all" || view === "done" || view === "archive";

  function newItem() {
    if (view === "notes") window.dispatchEvent(new Event("pauta:new-note"));
    else setCapture(true);
  }

  const tab = (id: string, label: string, ic: ReactNode, badge?: number) => (
    <button key={id} className="tab" aria-current={view === id} onClick={() => setView(id)}>
      {ic}
      <span>{label}</span>
      {!!badge && <span className="tbadge">{badge}</span>}
    </button>
  );

  return (
    <>
      <nav className="tabbar" aria-label="Navegação principal">
        {tab("today", "Hoje", ICONS.today, todayCount)}
        {tab("upcoming", "Próximas", ICONS.upcoming)}
        <button className="fab" aria-label={view === "notes" ? "Nova nota" : "Nova tarefa"} onClick={newItem}>
          {ICONS.plus}
        </button>
        {tab("notes", "Notas", ICONS.notes)}
        <button className="tab" aria-current={inLists || menu} aria-haspopup="dialog" onClick={() => setMenu(true)}>
          {ICONS.lists}
          <span>Listas</span>
        </button>
      </nav>

      {menu && (
        <Sheet variant="bottom" title="Menu" hideHead onClose={() => setMenu(false)}>
          {(close) => (
            <Sidebar
              variant="sheet"
              view={view}
              setView={(v) => {
                setView(v);
                close();
              }}
              onSignOut={onSignOut}
              onSearch={() => {
                close();
                onSearch();
              }}
              onSettings={() => {
                close();
                onSettings();
              }}
            />
          )}
        </Sheet>
      )}
      {capture && <CaptureSheet view={view} onClose={() => setCapture(false)} />}
    </>
  );
}
