import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, UploadCloud, PencilLine, X } from 'lucide-react';
import type { Gallery, Photo } from '../lib/types';
import { renumber, sortByOrder } from '../lib/gallery';
import { processImage, type ProcessedImage } from '../admin/images';
import { loadDraft, putBlob, saveDraft } from '../admin/draftDb';
import { applyOp } from '../admin/store';
import { PublishDialog } from '../admin/PublishDialog';
import type { NewFile } from '../admin/github';
import '../styles/dialog.css';

interface Props {
  files: File[];
  gallery: Gallery;
  onClose: () => void;
  /** called after the new photos are live; receives the id of the first new photo */
  onPublished: (firstNewId: string) => void;
}

/**
 * «+» in the thumbnails tray: prepare new photos (resize/compress in the browser, EXIF orientation honoured)
 * and either publish them right away (needs the family's GitHub key) or hand them over to the editor as a draft.
 */
export default function AddPhotos({ files, gallery, onClose, onPublished }: Props) {
  const [items, setItems] = useState<(ProcessedImage & { preview: string })[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(files.length);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [token, setToken] = useState(''); // memory only
  const [done, setDone] = useState(false);
  const live = useRef(items);
  const moreRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: File[]) => {
    setBusy(true);
    setTotal(list.length);
    const errs: string[] = [];
    const out: (ProcessedImage & { preview: string })[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress(i + 1);
      try {
        const img = await processImage(list[i], 0);
        out.push({ ...img, preview: URL.createObjectURL(img.blobs.thumb) });
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    setItems((cur) => [...cur, ...out]);
    setErrors((cur) => [...cur, ...errs]);
    setBusy(false);
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // processing runs asynchronously (canvas work), then stores the results
    void addFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // free the preview object URLs when the sheet closes
  useEffect(() => {
    live.current = items;
  }, [items]);
  useEffect(() => () => live.current.forEach((it) => URL.revokeObjectURL(it.preview)), []);

  /** published photos + the new ones at the end of the book */
  const merged: Photo[] = useMemo(
    () => applyOp(renumber(sortByOrder(gallery.photos)), { type: 'add', photos: items.map((it) => it.photo) }),
    [gallery.photos, items],
  );
  const newFiles: NewFile[] = useMemo(
    () => items.flatMap((it) => [
      { path: `public/${it.photo.src}`, blob: it.blobs.full },
      { path: `public/${it.photo.srcMd}`, blob: it.blobs.md },
      { path: `public/${it.photo.thumb}`, blob: it.blobs.thumb },
    ]),
    [items],
  );

  const toEditor = async () => {
    setBusy(true);
    for (const it of items) {
      await putBlob(`${it.photo.id}:full`, it.blobs.full);
      await putBlob(`${it.photo.id}:md`, it.blobs.md);
      await putBlob(`${it.photo.id}:thumb`, it.blobs.thumb);
    }
    const existing = await loadDraft().catch(() => undefined);
    const base = existing && existing.baseRevision === gallery.revision ? existing.photos : gallery.photos;
    const photos = applyOp(renumber(sortByOrder(base)), { type: 'add', photos: items.map((it) => it.photo) });
    await saveDraft({ baseRevision: gallery.revision, photos, savedAt: new Date().toISOString() });
    window.location.href = `${import.meta.env.BASE_URL}admin/`;
  };

  if (publishing) {
    return (
      <PublishDialog
        photos={merged}
        newFiles={newFiles}
        baseRevision={gallery.revision}
        token={token}
        setToken={setToken}
        onClose={() => (done ? onClose() : setPublishing(false))}
        onPublished={() => { setDone(true); onPublished(items[0].photo.id); }}
      />
    );
  }

  const n = items.length;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-title" data-testid="add-photos">
      <div className="modal">
        <button className="modal-x" onClick={onClose} disabled={busy} aria-label="Cerrar"><X /></button>
        <h2 id="add-title">Agregar fotos al libro</h2>
        <p>Se agregan al final, después de la foto {gallery.photos.filter((p) => !p.hidden).length}. Solo se reducen de tamaño; no se recortan ni se retocan.</p>

        <ul className="add-grid">
          {items.map((it) => (
            <li key={it.photo.id}>
              <img src={it.preview} alt="" />
              <button
                className="add-remove"
                onClick={() => { URL.revokeObjectURL(it.preview); setItems((cur) => cur.filter((x) => x !== it)); }}
                aria-label={`Quitar ${it.photo.originalFilename}`}
                disabled={busy}
              >
                <X />
              </button>
            </li>
          ))}
          {busy ? (
            <li className="add-busy" aria-live="polite"><Loader2 className="spin" /> <span>Preparando {progress} de {total}…</span></li>
          ) : (
            <li>
              <button className="add-more" onClick={() => moreRef.current?.click()} aria-label="Elegir más fotos"><ImagePlus /></button>
              <input
                ref={moreRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; if (l.length) void addFiles(l); }}
              />
            </li>
          )}
        </ul>

        {errors.length ? <div className="error" role="alert">{errors.map((e, i) => <p key={i}>{e}</p>)}</div> : null}

        <p className="note">Para que todos las vean hay que publicarlas con la llave de GitHub de la familia. Si no la tienes a mano, guárdalas en el editor y publícalas después.</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn" onClick={() => void toEditor()} disabled={busy || !n} data-testid="add-to-editor"><PencilLine /> Guardar y seguir en el editor</button>
          <button className="btn primary" onClick={() => setPublishing(true)} disabled={busy || !n} data-testid="add-publish">
            <UploadCloud /> Publicar {n === 1 ? '1 foto' : `${n} fotos`}
          </button>
        </div>
      </div>
    </div>
  );
}
