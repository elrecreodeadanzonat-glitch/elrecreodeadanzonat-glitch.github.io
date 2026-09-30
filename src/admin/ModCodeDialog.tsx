import { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { checkCode, normalizeCode } from '../lib/cloud';

interface Props {
  onOk: (code: string) => void;
  onCancel: () => void;
}

/**
 * The family moderation code (hide / show / rotate what people add from the book).
 * It stays in this tab's memory only; it is checked by the database rules, never stored in the site.
 */
export function ModCodeDialog({ onOk, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(value);
    if (code.length < 12) {
      setError('El código tiene 12 letras y números (por ejemplo ABCD-EFGH-JKLM).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (await checkCode(code)) onOk(code);
      else setError('Ese código no es correcto. Revísalo e inténtalo otra vez.');
    } catch {
      setError('No hay conexión. Inténtalo en un momento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modcode-title" data-testid="modcode">
      <form className="modal small" onSubmit={submit}>
        <button type="button" className="modal-x" onClick={onCancel} aria-label="Cerrar"><X /></button>
        <h2 id="modcode-title">Código de la familia</h2>
        <p>
          Para ocultar, mostrar o girar lo que otros agregaron, escribe el código de moderación
          (está en el archivo <b>«Libro de mama - codigo de moderacion.txt»</b>). Se recuerda solo mientras esta pestaña esté abierta.
        </p>
        <label className="token-field">
          Código
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            data-testid="modcode-input"
          />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" disabled={busy} data-testid="modcode-ok">
            {busy ? <Loader2 className="spin" /> : <KeyRound />} Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
