import { ReactNode } from "react";
import Mark from "../../components/Mark";

export default function AuthLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <h1 className="brand"><Mark /> Pauta</h1>
        <div className="auth-route" aria-hidden="true">
          <span className="auth-route-line" />
          <span className="auth-stop stop-one" />
          <span className="auth-stop stop-two" />
          <span className="auth-stop stop-three" />
          <span className="auth-note"><span /><span /><span /></span>
        </div>
        <p className="auth-kicker">Seu espaço, no seu ritmo</p>
        <p className="auth-promise">Tarefas, ideias e planos em um só lugar.</p>
        <p className="auth-caption">Organize o que importa e siga uma etapa de cada vez.</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-heading">
          <span className="auth-eyebrow">{eyebrow}</span>
          <h2 id="auth-title">{title}</h2>
          <p>{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
