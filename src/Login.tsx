import { FormEvent, useState } from "react";
import { supabase } from "./supabase";
import Mark from "./Mark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Conta criada. Confirme o e-mail se o Supabase pedir.");
    setBusy(false);
  }

  return (
    <main className="app login">
      <h1 className="brand"><Mark /> Pauta</h1>
      <form onSubmit={submit}>
        <label>
          E-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {mode === "in" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}
      <button className="ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Criar uma conta" : "Já tenho conta"}
      </button>
    </main>
  );
}
