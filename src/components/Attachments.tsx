import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { ATT_COLS, useData } from "../lib/data";
import { useToast } from "./Toast";
import type { Attachment } from "../lib/types";
import { normalizeUrl } from "../lib/util";

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "attachments";

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
function hostOf(url: string | null) {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return url ?? "";
  }
}

export default function Attachments({ taskId, noteId, editable = true }: { taskId?: string; noteId?: string; editable?: boolean }) {
  const { attachments, setAttachments, hide, unhide, saveMutation, online } = useData();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = attachments.filter((a) => (taskId ? a.task_id === taskId : a.note_id === noteId));
  const addToState = (att: Attachment) => setAttachments((p) => (p.some((x) => x.id === att.id) ? p : [...p, att]));
  const base = { task_id: taskId ?? null, note_id: noteId ?? null };

  async function addLink(e: FormEvent) {
    e.preventDefault();
    const u = normalizeUrl(url);
    if (!u) {
      setError("Endereço inválido. Use um link como https://exemplo.com");
      return;
    }
    const att: Attachment = { id: crypto.randomUUID(), ...base, kind: "link", title: label.trim(), url: u, path: null, mime: null, size: null, created_at: new Date().toISOString() };
    addToState(att);
    setUrl("");
    setLabel("");
    setAdding(false);
    setError(null);
    const result = await saveMutation("attachments", att.id, "upsert", att);
    if (result.error) {
      setAttachments((p) => p.filter((x) => x.id !== att.id));
      setError(result.error);
    }
  }

  async function uploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!online) {
      setError("O envio de arquivos precisa de conexão. Tente novamente quando estiver online.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`O arquivo tem ${fmtSize(file.size)}. O limite é 10 MB.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) {
      setBusy(false);
      setError("Sessão expirada. Entre de novo.");
      return;
    }
    const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${uid}/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) {
      setBusy(false);
      setError(up.error.message);
      return;
    }
    const att: Attachment = { id: crypto.randomUUID(), ...base, kind: "file", title: file.name, url: null, path, mime: file.type || null, size: file.size, created_at: new Date().toISOString() };
    const ins = await supabase.from("attachments").insert(att);
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove([path]);
      setError(ins.error.message);
    } else {
      addToState(att);
    }
    setBusy(false);
  }

  async function openFile(a: Attachment) {
    // Abre a aba antes do pedido, para o navegador não bloquear
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path ?? "", 600);
    if (error || !data) {
      w?.close();
      setError(error?.message ?? "Não foi possível abrir o arquivo.");
      return;
    }
    if (w) {
      w.opener = null;
      w.location.href = data.signedUrl;
    } else {
      window.location.assign(data.signedUrl);
    }
  }

  function remove(a: Attachment) {
    hide(a.id);
    toast("Anexo removido", {
      onUndo: () => unhide(a.id),
      onCommit: async () => {
        if (a.kind === "file" && a.path && online) {
          const { error: storageError } = await supabase.storage.from(BUCKET).remove([a.path]);
          if (storageError) {
            setError(storageError.message);
            unhide(a.id);
            return;
          }
        }
        const result = await saveMutation("attachments", a.id, "delete", {}, a);
        if (result.error) setError(result.error);
        else setAttachments((p) => p.filter((x) => x.id !== a.id));
        unhide(a.id);
      },
    });
  }

  return (
    <div className="attach">
      {items.length > 0 && (
        <ul className="attlist">
          {items.map((a) => {
            const name = a.title || hostOf(a.url);
            return (
              <li key={a.id}>
                {a.kind === "link" ? (
                  <a className="attname" href={a.url ?? "#"} target="_blank" rel="noopener noreferrer">{name}</a>
                ) : (
                  <button type="button" className="attname" onClick={() => openFile(a)}>{name}</button>
                )}
                <span className="attmeta">{a.kind === "link" ? (a.title ? hostOf(a.url) : "Link") : fmtSize(a.size)}</span>
                {editable && (
                  <button type="button" className="ghost" onClick={() => remove(a)} aria-label={`Remover anexo ${name}`}>Remover</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <>
          <div className="attactions">
            <button type="button" className="chipbtn" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>Adicionar link</button>
            <button type="button" className="chipbtn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : "Anexar arquivo"}</button>
            <input ref={fileRef} type="file" hidden onChange={uploadFile} />
          </div>
          {adding && (
            <form className="attform" onSubmit={addLink}>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Cole o link (https://…)" inputMode="url" autoCapitalize="none" autoCorrect="off" aria-label="Endereço do link" autoFocus />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Título (opcional)" aria-label="Título do link" />
              <div className="nactions">
                <button className="primary small">Adicionar</button>
                <button type="button" className="ghost" onClick={() => setAdding(false)}>Cancelar</button>
              </div>
            </form>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
