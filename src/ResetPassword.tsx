import { FormEvent, useState } from "react";
import { supabase } from "./supabase";
import Mark from "./Mark";

// Tela mostrada depois de clicar no link de "esqueci a senha" enviado por e-mail
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) return setMsg("As senhas não são iguais.");
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg(error.message);
    else setOk(true);
  }

  return (
    <main className="app login">
      <h1 className="brand"><Mark /> Pauta</h1>
      {ok ? (
        <>
          <p>Senha alterada. Você já está dentro da sua conta.</p>
          <button className="primary" onClick={onDone}>Continuar</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="login-note">Escolha uma nova senha para a sua conta.</p>
          <label>
            Nova senha
            <input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Repita a nova senha
            <input type="password" autoComplete="new-password" required minLength={6} value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>Salvar nova senha</button>
          {msg && <p className="error">{msg}</p>}
        </form>
      )}
    </main>
  );
}
