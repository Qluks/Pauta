import { FormEvent, useState } from "react";
import { supabase } from "./supabase";
import Mark from "./Mark";

type Mode = "in" | "up" | "reset";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setInfo(null);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) setMsg(error.message);
      else setInfo("Se esse e-mail tiver uma conta, enviamos um link para criar uma nova senha. Confira também a caixa de spam.");
    } else {
      const { error } =
        mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (mode === "up") setInfo("Conta criada. Confirme o e-mail se o Supabase pedir.");
    }
    setBusy(false);
  }

  const go = (m: Mode) => {
    setMode(m);
    setMsg(null);
    setInfo(null);
  };

  return (
    <main className="app login">
      <h1 className="brand"><Mark /> Pauta</h1>
      <form onSubmit={submit}>
        {mode === "reset" && <p className="login-note">Informe o e-mail da conta e enviaremos um link para criar uma nova senha.</p>}
        <label>
          E-mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "reset" && (
          <label>
            Senha
            <input
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button className="primary" disabled={busy}>
          {mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Enviar link"}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}
      {info && <p className="login-note" role="status">{info}</p>}
      {mode === "in" && <button className="ghost" onClick={() => go("reset")}>Esqueci a senha</button>}
      <button className="ghost" onClick={() => go(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Criar uma conta" : mode === "up" ? "Já tenho conta" : "Voltar para entrar"}
      </button>
    </main>
  );
}
