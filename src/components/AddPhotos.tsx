import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X, Check, PartyPopper, RotateCcw } from 'lucide-react';
import { prepareCloudImage, type CloudImage } from '../admin/images';
import type { CloudStore } from '../lib/cloudStore';
import { loadName, saveName } from '../lib/prefs';
import { LIMITS } from '../lib/cloud';
import '../styles/dialog.css';

interface Props {
  files: File[];
  store: CloudStore;
  /** closes the sheet; with the id of the first photo added, the book jumps to it */
  onClose: (firstNewId?: string) => void;
}

type Item = CloudImage & { key: string; state: 'ready' | 'uploading' | 'done' | 'failed'; id?: string; createdAt?: string };
type Phase = 'preparing' | 'ready' | 'uploading' | 'done' | 'failed';

/**
 * «+» in the thumbnails tray. Made for everyone, grandparents included:
 * pick photos → one big button → «¡Listo!». No keys, no accounts, no editor.
 */
export default function AddPhotos({ files, store, onClose }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>('preparing');
  const [preparing, setPreparing] = useState({ done: 0, total: files.length });
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState(loadName);
  const moreRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const prepare = async (list: File[]) => {
    setPhase('preparing');
    setPreparing({ done: 0, total: list.length });
    const errs: string[] = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const img = await prepareCloudImage(list[i]);
        setItems((cur) => [...cur, { ...img, key: `${Date.now()}-${i}-${Math.random()}`, state: 'ready' }]);
      } catch (e) {
        errs.push((e as Error).message);
      }
      setPreparing({ done: i + 1, total: list.length });
    }
    setErrors((cur) => [...cur, ...errs]);
    setPhase('ready');
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // decoding and resizing runs asynchronously (canvas), then stores the results
    void prepare(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async () => {
    saveName(name);
    setErrors([]);
    setPhase('uploading');
    let failed = 0;
    for (const it of itemsRef.current) {
      if (it.state === 'done') continue;
      setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, state: 'uploading' } : x)));
      try {
        const saved = await store.addPhoto({ image: it.image, thumb: it.thumb, width: it.width, height: it.height, color: it.color, author: name });
        setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, state: 'done', id: saved.id, createdAt: saved.createdAt } : x)));
      } catch {
        failed++;
        setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, state: 'failed' } : x)));
      }
    }
    setPhase(failed ? 'failed' : 'done');
  };

  const n = items.length;
  const doneItems = items.filter((x) => x.state === 'done');
  // the one that comes first in the book (after a retry, upload order and pick order differ)
  const firstNew = [...doneItems].sort((x, y) => Date.parse(x.createdAt ?? '') - Date.parse(y.createdAt ?? ''))[0]?.id;
  const sending = items.findIndex((x) => x.state === 'uploading') + 1 || doneItems.length;
  const locked = phase === 'uploading';
  const fotos = (k: number) => (k === 1 ? '1 foto' : `${k} fotos`);

  if (phase === 'done') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-title" data-testid="add-photos">
        <div className="modal add-sheet done-sheet">
          <div className="done-mark" aria-hidden="true"><PartyPopper /></div>
          <h2 id="add-title">¡Listo!</h2>
          <p className="big-text" data-testid="add-done">
            {doneItems.length === 1 ? 'Tu foto ya está en el libro.' : `Tus ${doneItems.length} fotos ya están en el libro.`}
            <br />Todos la{doneItems.length === 1 ? '' : 's'} pueden ver desde ahora.
          </p>
          <ul className="add-grid done" aria-hidden="true">
            {doneItems.slice(0, 6).map((it) => <li key={it.key}><img src={it.thumb} alt="" /></li>)}
          </ul>
          <button className="btn primary huge" onClick={() => onClose(firstNew)} autoFocus data-testid="add-see">
            Ver {doneItems.length === 1 ? 'mi foto' : 'mis fotos'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-title" data-testid="add-photos">
      <div className="modal add-sheet">
        <button className="modal-x" onClick={() => onClose(firstNew)} disabled={locked} aria-label="Cerrar"><X /></button>
        <h2 id="add-title">Agregar al libro</h2>

        <ul className="add-grid big">
          {items.map((it) => (
            <li key={it.key} className={`is-${it.state}`}>
              <img src={it.thumb} alt="" />
              {it.state === 'uploading' ? <span className="add-state"><Loader2 className="spin" /></span> : null}
              {it.state === 'done' ? <span className="add-state ok"><Check /></span> : null}
              {it.state === 'failed' ? <span className="add-state bad">!</span> : null}
              {it.state === 'ready' && !locked ? (
                <button className="add-remove" onClick={() => setItems((cur) => cur.filter((x) => x.key !== it.key))} aria-label={`Quitar ${it.name}`}>
                  <X />
                </button>
              ) : null}
            </li>
          ))}
          {phase === 'preparing' ? (
            <li className="add-busy" aria-live="polite"><Loader2 className="spin" /><span>Preparando {preparing.done + 1 > preparing.total ? preparing.total : preparing.done + 1} de {preparing.total}…</span></li>
          ) : !locked ? (
            <li>
              <button className="add-more" onClick={() => moreRef.current?.click()} aria-label="Elegir más fotos"><ImagePlus /><span>Más</span></button>
              <input
                ref={moreRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; if (l.length) void prepare(l); }}
              />
            </li>
          ) : null}
        </ul>

        {errors.length ? <div className="error" role="alert">{errors.map((e, i) => <p key={i}>{e}</p>)}</div> : null}

        {phase === 'uploading' ? (
          <div className="upload-progress" aria-live="polite" data-testid="add-progress">
            <p>Subiendo {Math.min(sending, n)} de {n}…</p>
            <div className="bar"><div style={{ width: `${(doneItems.length / Math.max(1, n)) * 100}%` }} /></div>
          </div>
        ) : phase === 'failed' ? (
          <div className="error" role="alert" data-testid="add-failed">
            <p>{doneItems.length ? `${doneItems.length === 1 ? 'Se subió 1 foto' : `Se subieron ${doneItems.length} fotos`}, pero ${fotos(n - doneItems.length)} no.` : 'No se pudieron subir.'} Revisa tu conexión a internet e inténtalo otra vez.</p>
          </div>
        ) : (
          <label className="who-field">
            <span>¿Quién {n === 1 ? 'la' : 'las'} comparte? <small>(opcional)</small></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre, ej.: Tía Rosa" maxLength={LIMITS.author} autoComplete="name" data-testid="add-name" />
          </label>
        )}

        <div className="add-actions">
          {phase === 'failed' ? (
            <button className="btn primary huge" onClick={() => void upload()} data-testid="add-retry"><RotateCcw /> Intentar otra vez</button>
          ) : (
            <button className="btn primary huge" onClick={() => void upload()} disabled={phase !== 'ready' || !n} data-testid="add-publish">
              {phase === 'uploading' ? <><Loader2 className="spin" /> Subiendo…</> : phase === 'preparing' ? 'Preparando…' : n ? `Agregar ${fotos(n)} al libro` : 'Elige al menos una foto'}
            </button>
          )}
          <button className="btn ghost" onClick={() => onClose(firstNew)} disabled={locked}>
            {phase === 'failed' && doneItems.length ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  );
}
