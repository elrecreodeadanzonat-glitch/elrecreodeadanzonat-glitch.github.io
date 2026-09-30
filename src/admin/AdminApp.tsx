import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Undo2, Redo2, Eye, Save, UploadCloud, ImagePlus, Trash2, X, Info, BookOpen } from 'lucide-react';
import type { Gallery, Photo } from '../lib/types';
import { assetUrl, loadGallery } from '../lib/gallery';
import { historyReducer, initHistory, isDirty, type Op } from './store';
import { clearDraft, getBlob, loadDraft, putBlob, saveDraft, type Draft } from './draftDb';
import { processImage, type SizeKind } from './images';
import { PhotoCard } from './PhotoCard';
import { PublishDialog } from './PublishDialog';
import { Viewer } from '../components/Viewer';
import type { NewFile } from './github';

type BlobUrls = Record<string, Partial<Record<SizeKind, string>>>;
const KINDS: SizeKind[] = ['full', 'md', 'thumb'];

export default function AdminApp() {
  const [published, setPublished] = useState<Gallery | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [h, dispatch] = useReducer(historyReducer, initHistory([]));
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null);
  const [blobUrls, setBlobUrls] = useState<BlobUrls>({});
  const [tab, setTab] = useState<'photos' | 'trash'>('photos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ text: string; onYes: () => void } | null>(null);
  const [focal, setFocal] = useState<Photo | null>(null);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [token, setToken] = useState(''); // memory only — never persisted
  const [adding, setAdding] = useState<string | null>(null);
  const [addErrors, setAddErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = useRef(false);

  // ---- load published gallery + offer an existing draft ----
  useEffect(() => {
    (async () => {
      try {
        const g = await loadGallery();
        setPublished(g);
        dispatch({ type: 'load', photos: g.photos });
        const d = await loadDraft().catch(() => undefined);
        if (d && d.photos?.length) setDraftOffer(d);
        else ready.current = true;
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
  }, []);

  const photos = h.present;
  const visible = useMemo(() => photos.filter((p) => !p.hidden), [photos]);
  const trash = useMemo(() => photos.filter((p) => p.hidden), [photos]);
  const publishedIds = useMemo(() => new Set(published?.photos.map((p) => p.id)), [published]);
  const newPhotos = useMemo(() => photos.filter((p) => !publishedIds.has(p.id)), [photos, publishedIds]);
  const dirty = !!published && isDirty(published.photos, photos);

  // ---- blob URLs for photos added locally (not yet published) ----
  const ensureBlobUrls = useCallback(async (ids: string[]) => {
    const add: BlobUrls = {};
    for (const id of ids) {
      const entry: Partial<Record<SizeKind, string>> = {};
      for (const k of KINDS) {
        const b = await getBlob(`${id}:${k}`).catch(() => undefined);
        if (b) entry[k] = URL.createObjectURL(b);
      }
      add[id] = entry;
    }
    setBlobUrls((m) => ({ ...m, ...add }));
  }, []);

  useEffect(() => {
    const missing = newPhotos.filter((p) => !blobUrls[p.id]).map((p) => p.id);
    // loads blobs asynchronously from IndexedDB, then stores their object URLs
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (missing.length) void ensureBlobUrls(missing);
  }, [newPhotos, blobUrls, ensureBlobUrls]);

  // ---- autosave the draft (this device) ----
  useEffect(() => {
    if (!ready.current || !published) return;
    const t = window.setTimeout(async () => {
      if (!dirty) {
        await clearDraft().catch(() => undefined);
        setSavedAt(null);
        return;
      }
      const d: Draft = { baseRevision: published.revision, photos, savedAt: new Date().toISOString() };
      await saveDraft(d).catch(() => undefined);
      setSavedAt(d.savedAt);
    }, 500);
    return () => window.clearTimeout(t);
  }, [photos, published, dirty]);

  // flush the draft right away when the tab is hidden (switching apps on a phone, closing the tab)
  const latest = useRef({ photos, dirty, published });
  useEffect(() => {
    latest.current = { photos, dirty, published };
  });
  useEffect(() => {
    const flush = () => {
      const { photos: ps, dirty: dt, published: pub } = latest.current;
      if (document.visibilityState === 'hidden' && ready.current && dt && pub) {
        void saveDraft({ baseRevision: pub.revision, photos: ps, savedAt: new Date().toISOString() }).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const saveNow = async () => {
    if (!published) return;
    const d: Draft = { baseRevision: published.revision, photos, savedAt: new Date().toISOString() };
    await saveDraft(d);
    setSavedAt(d.savedAt);
  };

  // ---- undo / redo shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onOp = useCallback((op: Op) => dispatch(op), []);

  const askHide = (ids: string[]) => {
    const n = ids.length;
    setConfirm({
      text: n === 1 ? '¿Quitar esta foto del libro? Irá a la papelera y podrás restaurarla.' : `¿Quitar ${n} fotos del libro? Irán a la papelera y podrás restaurarlas.`,
      onYes: () => { dispatch({ type: 'hide', ids }); setSelected(new Set()); },
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) dispatch({ type: 'reorder', activeId: String(e.active.id), overId: String(e.over.id) });
  };

  // ---- add photos ----
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const added: Photo[] = [];
    const errors: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setAdding(`Preparando ${i + 1} de ${list.length}…`);
      try {
        const res = await processImage(list[i], visible.length + i + 1);
        for (const k of KINDS) await putBlob(`${res.photo.id}:${k}`, res.blobs[k]);
        added.push(res.photo);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setAdding(null);
    setAddErrors(errors);
    if (added.length) {
      await ensureBlobUrls(added.map((p) => p.id));
      dispatch({ type: 'add', photos: added });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  // ---- data for preview / publish ----
  const withLocalUrls = (p: Photo): Photo => {
    const u = blobUrls[p.id];
    if (!u) return p;
    return { ...p, src: u.full ?? p.src, srcMd: u.md ?? p.srcMd, thumb: u.thumb ?? p.thumb };
  };
  const thumbFor = (p: Photo) => blobUrls[p.id]?.thumb ?? assetUrl(p.thumb);

  const buildNewFiles = async (): Promise<NewFile[]> => {
    const out: NewFile[] = [];
    for (const p of newPhotos) {
      for (const k of KINDS) {
        const b = await getBlob(`${p.id}:${k}`);
        const path = k === 'full' ? p.src : k === 'md' ? p.srcMd! : p.thumb;
        if (!b) throw new Error(`Falta el archivo de la foto nueva ${p.originalFilename}`);
        out.push({ path: `public/${path}`, blob: b });
      }
    }
    return out;
  };
  const [newFiles, setNewFiles] = useState<NewFile[] | null>(null);
  const openPublish = async () => {
    try {
      setNewFiles(await buildNewFiles());
      setPublishing(true);
    } catch (e) {
      setAddErrors([(e as Error).message]);
    }
  };

  const onPublished = async (revision: string) => {
    await clearDraft().catch(() => undefined);
    setSavedAt(null);
    const g: Gallery = { version: 1, revision, updatedAt: revision.slice(0, 20), photos };
    setPublished(g);
    dispatch({ type: 'load', photos });
  };

  // ---- render ----
  if (loadError) return <div className="admin"><p className="error">{loadError}</p></div>;
  if (!published) return <div className="admin"><p className="loading">Cargando el libro…</p></div>;

  return (
    <div className="admin" data-testid="admin">
      <header className="admin-head">
        <div className="title">
          <BookOpen aria-hidden="true" />
          <div>
            <h1>Editar el libro</h1>
            <p className="status" data-testid="admin-status">
              {dirty ? (savedAt ? 'Cambios sin publicar · borrador guardado en este dispositivo' : 'Cambios sin publicar') : 'Todo publicado'}
            </p>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn icon" onClick={() => dispatch({ type: 'undo' })} disabled={!h.past.length} aria-label="Deshacer" title="Deshacer (Ctrl+Z)" data-testid="undo"><Undo2 /></button>
          <button className="btn icon" onClick={() => dispatch({ type: 'redo' })} disabled={!h.future.length} aria-label="Rehacer" title="Rehacer (Ctrl+Y)" data-testid="redo"><Redo2 /></button>
          <button className="btn" onClick={() => setPreview(true)} data-testid="preview"><Eye /> Vista previa</button>
          <button className="btn" onClick={saveNow} disabled={!dirty} data-testid="save-draft"><Save /> Guardar borrador</button>
          <button className="btn primary" onClick={openPublish} disabled={!dirty} data-testid="publish"><UploadCloud /> Publicar cambios</button>
        </div>
      </header>

      {showHelp ? (
        <div className="help">
          <Info aria-hidden="true" />
          <p>
            Arrastra las fotos por el asa <b>⋮⋮</b> (o usa las flechas) para cambiar el orden. «Quitar» manda la foto a la papelera: no se borra.
            Los cambios se guardan como <b>borrador en este dispositivo</b>; nadie más los ve hasta que pulses <b>Publicar cambios</b>.
          </p>
          <button className="btn icon" onClick={() => setShowHelp(false)} aria-label="Ocultar ayuda"><X /></button>
        </div>
      ) : null}

      {draftOffer ? (
        <div className="banner" role="alert">
          <p>
            {draftOffer.baseRevision === published.revision
              ? `Tienes un borrador sin publicar de ${new Date(draftOffer.savedAt).toLocaleString('es')}.`
              : 'Tienes un borrador hecho sobre una versión anterior del libro (alguien publicó después).'}
          </p>
          <div>
            <button className="btn" onClick={async () => { await clearDraft(); setDraftOffer(null); ready.current = true; }}>Descartar borrador</button>
            <button className="btn primary" onClick={() => { dispatch({ type: 'load', photos: draftOffer.photos }); setDraftOffer(null); ready.current = true; }}>Continuar borrador</button>
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'photos'} onClick={() => setTab('photos')}>Fotos ({visible.length})</button>
          <button role="tab" aria-selected={tab === 'trash'} onClick={() => setTab('trash')} data-testid="trash-tab">Papelera ({trash.length})</button>
        </div>
        {tab === 'photos' ? (
          <div className="tool-actions">
            {selected.size ? (
              <button className="btn danger" onClick={() => askHide([...selected])}><Trash2 /> Quitar seleccionadas ({selected.size})</button>
            ) : null}
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={!!adding} data-testid="add-photos"><ImagePlus /> {adding ?? 'Agregar fotos'}</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} data-testid="file-input" />
          </div>
        ) : null}
      </div>
      {addErrors.length ? <div className="banner error" role="alert">{addErrors.map((e, i) => <p key={i}>{e}</p>)}<button className="btn" onClick={() => setAddErrors([])}>Entendido</button></div> : null}

      {tab === 'photos' ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((p) => p.id)} strategy={rectSortingStrategy}>
            <ol className="grid">
              {visible.map((p, i) => (
                <PhotoCard
                  key={p.id}
                  photo={p}
                  position={i + 1}
                  total={visible.length}
                  thumbUrl={thumbFor(p)}
                  selected={selected.has(p.id)}
                  isNew={!publishedIds.has(p.id)}
                  onSelect={(id, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; })}
                  onOp={onOp}
                  onAskHide={askHide}
                  onFocal={setFocal}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="grid">
          {trash.length === 0 ? <li className="empty">La papelera está vacía.</li> : null}
          {trash.map((p, i) => (
            <PhotoCard key={p.id} photo={p} position={i + 1} total={trash.length} thumbUrl={thumbFor(p)} selected={false} isNew={!publishedIds.has(p.id)}
              onSelect={() => undefined} onOp={onOp} onAskHide={() => undefined} onFocal={() => undefined} trash />
          ))}
        </ol>
      )}

      {confirm ? (
        <div className="modal-backdrop" role="alertdialog" aria-modal="true">
          <div className="modal small">
            <p>{confirm.text}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirm(null)} autoFocus>Cancelar</button>
              <button className="btn danger" onClick={() => { confirm.onYes(); setConfirm(null); }} data-testid="confirm-yes">Sí, quitar</button>
            </div>
          </div>
        </div>
      ) : null}

      {focal ? <FocalDialog photo={focal} url={blobUrls[focal.id]?.md ?? assetUrl(focal.srcMd ?? focal.src)} onClose={() => setFocal(null)} onSet={(pt) => dispatch({ type: 'focal', id: focal.id, focalPoint: pt })} /> : null}

      {preview ? (
        <div className="preview-overlay">
          <button className="preview-close" onClick={() => setPreview(false)} aria-label="Cerrar vista previa"><X /> Cerrar vista previa</button>
          <Viewer
            photos={visible.map(withLocalUrls)}
            music={{ started: false, playing: false, muted: true, volume: 0, trackTitle: '', error: null }}
            onToggleMute={() => undefined}
            onVolume={() => undefined}
            onFinish={() => setPreview(false)}
            embedded
          />
        </div>
      ) : null}

      {publishing && newFiles ? (
        <PublishDialog
          photos={photos}
          newFiles={newFiles}
          baseRevision={published.revision}
          token={token}
          setToken={setToken}
          onClose={() => setPublishing(false)}
          onPublished={onPublished}
        />
      ) : null}
    </div>
  );
}

function FocalDialog({ photo, url, onClose, onSet }: { photo: Photo; url: string; onClose: () => void; onSet: (p: { x: number; y: number }) => void }) {
  const [pt, setPt] = useState(photo.focalPoint);
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPt({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="focal-title">
      <div className="modal">
        <button className="modal-x" onClick={onClose} aria-label="Cerrar"><X /></button>
        <h2 id="focal-title">Punto focal</h2>
        <p>Toca lo más importante de la foto (por ejemplo, las caras). Se usa cuando la foto está en «Llenar», para no cortar lo importante.</p>
        <div className="focal-pick" onPointerDown={pick} style={{ transform: `rotate(${photo.rotation}deg)` }}>
          <img src={url} alt="" draggable={false} />
          <span className="focal-dot big" style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }} />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => setPt({ x: 0.5, y: 0.5 })}>Centrar</button>
          <button className="btn primary" onClick={() => { onSet(pt); onClose(); }}>Listo</button>
        </div>
      </div>
    </div>
  );
}
