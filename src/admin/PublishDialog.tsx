import { useState } from 'react';
import { CheckCircle2, Loader2, KeyRound, X, ExternalLink } from 'lucide-react';
import { REPO } from '../config';
import { checkToken, publishGallery, waitForLive, PublishError, type NewFile, type Step } from './github';
import type { Photo } from '../lib/types';

interface Props {
  photos: Photo[];
  newFiles: NewFile[];
  baseRevision: string;
  token: string;
  setToken: (t: string) => void;
  onClose: () => void;
  onPublished: (revision: string) => void;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'validate', label: 'Revisar los cambios' },
  { key: 'upload', label: 'Subir fotos nuevas' },
  { key: 'commit', label: 'Guardar en GitHub' },
  { key: 'deploy', label: 'Actualizar el sitio público' },
  { key: 'done', label: 'Libro actualizado' },
];

const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Libro%20de%20mam%C3%A1%20-%20editor&description=Publicar%20cambios%20del%20Libro%20de%20mam%C3%A1&expires_in=30&contents=write';

export function PublishDialog({ photos, newFiles, baseRevision, token, setToken, onClose, onPublished }: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [draftToken, setDraftToken] = useState(token);
  const busy = step !== null && step !== 'done' && !error;

  const run = async () => {
    const t = draftToken.trim();
    if (!t) { setError('Pega la llave de GitHub para poder publicar.'); return; }
    setError(null);
    setSlow(false);
    try {
      setStep('validate');
      await checkToken(t);
      setToken(t);
      const res = await publishGallery({ token: t, photos, newFiles, baseRevision, onStep: (s, d) => { setStep(s); setDetail(d ?? ''); } });
      setStep('deploy');
      setDetail('');
      const live = await waitForLive(res.revision, { onTick: (s) => setDetail(`${s} s`) });
      onPublished(res.revision);
      if (!live) setSlow(true);
      setStep('done');
    } catch (e) {
      setError(e instanceof PublishError ? e.message : 'Algo salió mal al publicar. Tus cambios siguen guardados como borrador.');
    }
  };

  const idx = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pub-title">
      <div className="modal">
        <button className="modal-x" onClick={onClose} disabled={busy} aria-label="Cerrar"><X /></button>
        <h2 id="pub-title">Publicar cambios</h2>
        {step === null || error ? (
          <>
            <p>Para que todos vean los cambios, se guardan en GitHub y el sitio se actualiza solo (1 a 3 minutos).</p>
            <details className="howto" open={!token}>
              <summary><KeyRound /> Cómo obtener la llave (una sola vez)</summary>
              <ol>
                <li>Abre <a href={TOKEN_URL} target="_blank" rel="noreferrer">crear llave en GitHub <ExternalLink /></a> (con tu cuenta {REPO.owner}).</li>
                <li>En <b>Repository access</b> elige <b>Only select repositories</b> → <b>{REPO.name}</b>.</li>
                <li>En <b>Permissions → Repository permissions</b>, pon <b>Contents</b> en <b>Read and write</b>. Nada más.</li>
                <li>Pulsa <b>Generate token</b>, copia la llave y pégala aquí abajo.</li>
              </ol>
              <p className="note">La llave solo se guarda en la memoria de esta pestaña: al cerrarla se olvida. Nunca se sube al sitio ni a GitHub.</p>
            </details>
            <label className="token-field">
              <span>Llave de GitHub</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="github_pat_…"
                data-testid="token-input"
              />
            </label>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn primary" onClick={run} data-testid="publish-now">Publicar ahora</button>
            </div>
          </>
        ) : (
          <>
            <ol className="steps" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.key} className={i < idx || step === 'done' ? 'ok' : i === idx ? 'now' : ''}>
                  {i < idx || step === 'done' ? <CheckCircle2 /> : i === idx ? <Loader2 className="spin" /> : <span className="dot" />}
                  <span>{s.label}{i === idx && detail ? ` · ${detail}` : ''}</span>
                </li>
              ))}
            </ol>
            {step === 'done' ? (
              <div className="done" data-testid="publish-done">
                <p className="big">Libro actualizado</p>
                {slow ? <p className="note">GitHub todavía está terminando de actualizar el sitio; en unos minutos todos verán los cambios.</p> : null}
                <div className="modal-actions">
                  <a className="btn ghost" href={import.meta.env.BASE_URL} target="_blank" rel="noreferrer">Ver el libro</a>
                  <button className="btn primary" onClick={onClose}>Listo</button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
