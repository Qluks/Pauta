import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";
import AuthLayout from "./AuthLayout";

// Tela mostrada depois de clicar no link de "esqueci a senha" enviado por e-mail
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) {
      setMsg("As senhas não são iguais.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMsg(error.message);
      else setOk(true);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout eyebrow="Acesso seguro" title={ok ? "Senha atualizada" : "Crie uma nova senha"} description={ok ? "Sua conta está pronta para continuar." : "Escolha uma senha nova para proteger sua conta."}>
      {ok ? (
        <>
          <p className="login-note auth-message">Senha alterada. Você já está dentro da sua conta.</p>
          <button className="primary auth-submit" onClick={onDone}>Continuar</button>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <label>
            Nova senha
            <input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!msg} />
          </label>
          <label>
            Repita a nova senha
            <input type="password" autoComplete="new-password" required minLength={6} value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={!!msg} />
          </label>
          <button className="primary auth-submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
          {msg && <p className="error auth-message" role="alert">{msg}</p>}
        </form>
      )}
    </AuthLayout>
  );
}
