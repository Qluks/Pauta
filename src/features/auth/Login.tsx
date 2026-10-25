import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";
import AuthLayout from "./AuthLayout";

type Mode = "in" | "up" | "reset";

function authMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
  if (lower.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (lower.includes("already registered") || lower.includes("already been registered")) return "Este e-mail já tem uma conta. Entre ou recupere sua senha.";
  if (lower.includes("already confirmed")) return "Este e-mail já está confirmado. Você já pode entrar na sua conta.";
  if (lower.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  return message;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [canResend, setCanResend] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setInfo(null);
    setCanResend(false);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) setMsg(authMessage(error.message));
        else setInfo("Se esse e-mail tiver uma conta, enviaremos um link para redefinir a senha. Confira também a caixa de spam.");
        return;
      }
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(authMessage(error.message));
        return;
      }
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg(authMessage(error.message));
      } else {
        setInfo("Conta criada. Se a confirmação de e-mail estiver ativada, enviamos um link para você confirmar o endereço.");
        setCanResend(true);
      }
    } catch (error) {
      setMsg(authMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setBusy(true);
    setMsg(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) setMsg(authMessage(error.message));
      else setInfo("Se a conta ainda precisar de confirmação, enviaremos outro link. Confira também a caixa de spam.");
    } catch (error) {
      setMsg(authMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  const go = (next: Mode) => {
    setMode(next);
    setMsg(null);
    setInfo(null);
    setCanResend(false);
    setPassword("");
  };
  const heading = mode === "in" ? "Boas-vindas de volta" : mode === "up" ? "Crie sua conta" : "Recupere sua senha";
  const description =
    mode === "in"
      ? "Entre para continuar de onde você parou."
      : mode === "up"
      ? "Comece a organizar tarefas e ideias em um só lugar."
      : "Vamos enviar um link para o e-mail associado à sua conta.";

  return (
    <AuthLayout eyebrow={mode === "in" ? "Acesse sua conta" : mode === "up" ? "Comece por aqui" : "Acesso seguro"} title={heading} description={description}>
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            aria-invalid={!!msg}
            aria-describedby={msg ? "auth-message" : undefined}
          />
        </label>
        {mode !== "reset" && (
          <label>
            Senha
            <span className="auth-password">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "up" ? "Pelo menos 6 caracteres" : "Sua senha"}
                aria-invalid={!!msg}
                aria-describedby={msg ? "auth-message" : mode === "up" ? "password-hint" : undefined}
              />
              <button type="button" className="auth-show" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
            {mode === "up" && <span id="password-hint" className="auth-hint">Use pelo menos 6 caracteres.</span>}
          </label>
        )}
        <button className="primary auth-submit" disabled={busy}>
          {busy ? "Aguarde…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar minha conta" : "Enviar link de recuperação"}
        </button>
      </form>
      {msg && <p id="auth-message" className="error auth-message" role="alert">{msg}</p>}
      {info && <p className="login-note auth-message" role="status">{info}</p>}
      {canResend && (
        <button type="button" className="auth-secondary" disabled={busy || !email} onClick={() => void resendConfirmation()}>
          Reenviar confirmação de e-mail
        </button>
      )}
      <div className="auth-links">
        {mode === "in" && <button type="button" className="ghost" onClick={() => go("reset")}>Esqueci minha senha</button>}
        <button type="button" className="ghost" onClick={() => go(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Ainda não tem conta? Criar conta" : "Já tem uma conta? Entrar"}
        </button>
      </div>
      <p className="auth-privacy">Seus dados ficam associados à sua conta.</p>
    </AuthLayout>
  );
}
