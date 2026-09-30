import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, ZoomIn, ZoomOut, Minimize2, Maximize, Minimize,
  LayoutGrid, X, Expand, Shrink,
} from 'lucide-react';
import type { FitMode, Photo } from '../lib/types';
import { assetUrl, displayAspect } from '../lib/gallery';
import { useAutoplay } from '../lib/useAutoplay';
import { useGestures } from '../lib/useGestures';
import type { MusicState } from '../lib/music';

export const PHOTO_SECONDS = 15;
const TRANSITION_MS = 700;

interface Props {
  photos: Photo[];
  music: MusicState;
  onToggleMute: () => void;
  onVolume: (v: number) => void;
  onFinish: () => void;
  startIndex?: number;
  /** used by the admin preview: no fullscreen hand-off to the document */
  embedded?: boolean;
}

interface Layer { photo: Photo; key: number; dir: 1 | -1 | 0; leaving?: boolean }

const mdWidth = (p: Photo) => Math.round(p.width * Math.min(1, 1280 / Math.max(p.width, p.height)));

function srcSetFor(p: Photo): string | undefined {
  if (!p.srcMd || p.srcMd === p.src) return undefined;
  return `${assetUrl(p.srcMd)} ${mdWidth(p)}w, ${assetUrl(p.src)} ${p.width}w`;
}

function preload(p: Photo | undefined, sizes: string) {
  if (!p) return;
  const img = new Image();
  const ss = srcSetFor(p);
  if (ss) {
    img.sizes = sizes;
    img.srcset = ss;
  }
  img.src = assetUrl(p.src);
}

export function Viewer({ photos, music, onToggleMute, onVolume, onFinish, startIndex = 0, embedded = false }: Props) {
  const n = photos.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, n - 1)));
  const [playing, setPlaying] = useState(true);
  const [fitOverride, setFitOverride] = useState<FitMode | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [layers, setLayers] = useState<Layer[]>(() => (n ? [{ photo: photos[Math.min(startIndex, n - 1)], key: 0, dir: 0 }] : []));
  const [transitioning, setTransitioning] = useState(false);
  const [interactKey, setInteractKey] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const layerKey = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const photo = photos[index];
  const fit: FitMode = fitOverride ?? photo?.fitMode ?? 'contain';

  // ---- frame geometry (album page around the photo) ----
  const frame = useMemo(() => {
    if (!photo || !stage.w) return { w: 0, h: 0, pad: 0 };
    const pad = stage.w < 600 ? 7 : 12;
    const margin = stage.w < 600 ? 10 : 22;
    const aw = Math.max(40, stage.w - margin * 2);
    const ah = Math.max(40, stage.h - margin * 2);
    if (fit === 'cover') return { w: aw, h: ah, pad };
    const a = displayAspect(photo);
    let w = aw;
    let h = (w - pad * 2) / a + pad * 2;
    if (h > ah) {
      h = ah;
      w = (h - pad * 2) * a + pad * 2;
    }
    return { w, h, pad };
  }, [photo, stage, fit]);

  const sizes = `${Math.max(1, Math.round(frame.w))}px`;

  const bumpInteraction = useCallback(() => setInteractKey((k) => k + 1), []);

  const go = useCallback(
    (target: number, dir: 1 | -1) => {
      if (target < 0 || target >= n || target === index) return;
      layerKey.current += 1;
      const key = layerKey.current;
      setLayers((ls) => [...ls.filter((l) => !l.leaving).map((l) => ({ ...l, leaving: true })), { photo: photos[target], key, dir }]);
      setIndex(target);
      setTransitioning(true);
      window.setTimeout(() => {
        setLayers((ls) => ls.filter((l) => l.key === key || !l.leaving));
        setTransitioning(false);
      }, TRANSITION_MS);
    },
    [index, n, photos],
  );

  // ---- fullscreen + controls auto-hide (only while in fullscreen) ----
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !embedded;
  const fullscreenOn = isFs || immersive;
  const hideUi = fullscreenOn && uiHidden;
  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiHidden(true), 3200);
  }, []);
  const revealUi = useCallback(() => {
    setUiHidden(false);
    if (fullscreenOn) scheduleHide();
  }, [fullscreenOn, scheduleHide]);
  const toggleUi = useCallback(() => {
    if (!fullscreenOn) return;
    if (uiHidden) revealUi();
    else setUiHidden(true);
  }, [fullscreenOn, uiHidden, revealUi]);
  useEffect(() => {
    const onFs = () => {
      const on = !!document.fullscreenElement;
      setIsFs(on);
      setUiHidden(false);
      if (on) scheduleHide();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);
  const toggleFullscreen = useCallback(async () => {
    if (fsSupported) {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await (rootRef.current ?? document.documentElement).requestFullscreen();
        return;
      } catch {
        /* fall through to immersive mode */
      }
    }
    const on = !immersive;
    setImmersive(on);
    setUiHidden(false);
    if (on) scheduleHide();
  }, [fsSupported, immersive, scheduleHide]);

  // ---- navigation ----
  const next = useCallback(() => {
    revealUi();
    if (index >= n - 1) onFinish();
    else go(index + 1, 1);
  }, [index, n, go, onFinish, revealUi]);

  const prev = useCallback(() => {
    revealUi();
    go(index - 1, -1);
  }, [index, go, revealUi]);

  const jump = (i: number) => {
    setTrayOpen(false);
    go(i, i > index ? 1 : -1);
  };

  // zoom resets by itself whenever the photo or the fit mode changes
  const { stageRef, zoom: z, dragX, zoomIn, zoomOut, reset: resetZoom, isZoomed, active: gesturing, handlers } = useGestures({
    contentSize: { w: frame.w, h: frame.h },
    enabled: !trayOpen,
    resetKey: `${index}:${fit}`,
    onSwipe: (dir) => (dir > 0 ? next() : prev()),
    onTap: (fx) => {
      if (fx < 0.3) prev();
      else if (fx > 0.7) next();
      else toggleUi();
    },
    onInteract: revealUi,
  });

  // ---- 15 s autoplay ----
  const running = playing && !trayOpen && !isZoomed && !!(photo && loaded[photo.id]) && !transitioning && n > 0;
  const autoNext = useCallback(() => {
    if (index >= n - 1) onFinish();
    else go(index + 1, 1);
  }, [index, n, go, onFinish]);
  const progress = useAutoplay(running, PHOTO_SECONDS * 1000, `${index}:${interactKey}`, autoNext);

  // when a zoom ends, give the photo a fresh 15 s
  const wasZoomed = useRef(false);
  useEffect(() => {
    if (wasZoomed.current && !isZoomed) bumpInteraction();
    wasZoomed.current = isZoomed;
  }, [isZoomed, bumpInteraction]);

  // ---- preload current + next only ----
  useEffect(() => {
    preload(photos[index + 1], sizes);
  }, [index, photos, sizes]);

  // ---- stage size ----
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); next(); break;
        case 'ArrowLeft': e.preventDefault(); prev(); break;
        case ' ':
        case 'Spacebar':
          if (t && t.tagName === 'BUTTON') return;
          e.preventDefault(); setPlaying((p) => !p); revealUi(); break;
        case 'Escape':
          if (trayOpen) setTrayOpen(false);
          else if (isZoomed) resetZoom();
          else if (immersive) setImmersive(false);
          break;
        case '+': case '=': zoomIn(); break;
        case '-': case '_': zoomOut(); break;
        case '0': resetZoom(); break;
        case 'f': case 'F': void toggleFullscreen(); break;
        case 'm': case 'M': onToggleMute(); break;
        case 't': case 'T': setTrayOpen((o) => !o); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, trayOpen, isZoomed, resetZoom, zoomIn, zoomOut, immersive, toggleFullscreen, onToggleMute, revealUi]);

  // keep the current thumbnail in view
  useEffect(() => {
    if (!trayOpen) return;
    trayRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [trayOpen, index]);

  if (!n || !photo) return <div className="viewer-empty">No hay fotos para mostrar.</div>;

  const bg = photo.color ?? '#8a6f5c';

  return (
    <div
      ref={rootRef}
      className={`viewer${fullscreenOn ? ' is-fullscreen' : ''}${hideUi ? ' ui-hidden' : ''}`}
      style={{ ['--photo-color' as string]: bg }}
      onMouseMove={fullscreenOn ? revealUi : undefined}
      data-testid="viewer"
      data-index={index}
      data-music={music.playing ? (music.muted ? 'muted' : 'playing') : 'stopped'}
      data-playing={playing ? 'yes' : 'no'}
    >
      <div className="viewer-bg" aria-hidden="true" />

      <header className="viewer-top">
        <div className="progress" role="progressbar" aria-label="Avance del libro" aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1}>
          <div className="progress-fill" style={{ transform: `scaleX(${(index + (playing ? progress : 0)) / n})` }} />
        </div>
        <p className="counter" aria-live="polite" data-testid="counter">Foto {index + 1} de {n}</p>
      </header>

      <div
        className={`stage${isZoomed ? ' is-zoomed' : ''}${gesturing ? ' is-gesturing' : ''}`}
        ref={stageRef}
        {...handlers}
        role="region"
        aria-roledescription="carrusel"
        aria-label="Fotografías del libro"
        data-testid="stage"
      >
        {layers.map((l) => {
          const isCur = !l.leaving;
          const p = l.photo;
          const pf: FitMode = fitOverride ?? p.fitMode ?? 'contain';
          const sideways = p.rotation === 90 || p.rotation === 270;
          const innerW = frame.w - frame.pad * 2;
          const innerH = frame.h - frame.pad * 2;
          const imgStyle: React.CSSProperties = {
            width: sideways ? innerH : innerW,
            height: sideways ? innerW : innerH,
            transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            objectFit: pf,
            objectPosition: `${p.focalPoint.x * 100}% ${p.focalPoint.y * 100}%`,
          };
          return (
            <div
              key={l.key}
              className={`layer ${l.leaving ? 'is-leaving' : 'is-current'} dir-${l.dir}`}
              style={isCur ? { transform: `translateX(${dragX}px)` } : undefined}
              aria-hidden={!isCur}
            >
              <figure
                className={`page fit-${pf}`}
                style={{
                  width: frame.w,
                  height: frame.h,
                  padding: frame.pad,
                  transform: isCur ? `translate(${z.x}px, ${z.y}px) scale(${z.scale})` : undefined,
                }}
              >
                <div className="page-inner">
                  {!loaded[p.id] && <div className="page-loading" aria-hidden="true" />}
                  <img
                    src={assetUrl(p.src)}
                    srcSet={srcSetFor(p)}
                    sizes={sizes}
                    alt={p.alt}
                    width={p.width}
                    height={p.height}
                    draggable={false}
                    decoding="async"
                    style={imgStyle}
                    data-photo-id={p.id}
                    onLoad={() => setLoaded((m) => (m[p.id] ? m : { ...m, [p.id]: true }))}
                    onError={() => setLoaded((m) => ({ ...m, [p.id]: true }))}
                  />
                </div>
              </figure>
            </div>
          );
        })}
      </div>

      {photo.caption ? <p className="caption">{photo.caption}</p> : null}

      <nav className="controls" aria-label="Controles del libro">
        <div className="controls-row main">
          <button className="ctl" onClick={prev} disabled={index === 0} aria-label="Anterior" title="Anterior (←)"><ChevronLeft /></button>
          <button
            className="ctl play"
            onClick={() => { setPlaying((p) => !p); revealUi(); }}
            aria-label={playing ? 'Pausar' : 'Reanudar'}
            aria-pressed={!playing}
            title={playing ? 'Pausar (espacio)' : 'Reanudar (espacio)'}
            data-testid="play"
            style={{ ['--p' as string]: playing ? progress : 0 }}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button className="ctl" onClick={next} aria-label="Siguiente" title="Siguiente (→)"><ChevronRight /></button>
          <span className="spacer" />
          <button className="ctl" onClick={() => setTrayOpen((o) => !o)} aria-label="Ver miniaturas" aria-expanded={trayOpen} title="Miniaturas (T)" data-testid="thumbs-toggle"><LayoutGrid /></button>
        </div>
        <div className="controls-row tools">
          <div className="vol">
            <button className="ctl" onClick={onToggleMute} aria-label={music.muted ? 'Activar música' : 'Silenciar música'} aria-pressed={music.muted} title="Música (M)" data-testid="mute">
              {music.muted ? <VolumeX /> : <Volume2 />}
            </button>
            <button className="ctl vol-more" onClick={() => setVolOpen((o) => !o)} aria-label="Volumen" aria-expanded={volOpen}>
              <span className="vol-level" style={{ ['--v' as string]: music.muted ? 0 : music.volume }} />
            </button>
            <input
              className={`vol-slider${volOpen ? ' open' : ''}`}
              type="range" min={0} max={1} step={0.05}
              value={music.muted ? 0 : music.volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              aria-label="Volumen de la música"
              data-testid="volume"
            />
          </div>
          <button className="ctl" onClick={zoomOut} disabled={!isZoomed} aria-label="Alejar" title="Alejar (−)"><ZoomOut /></button>
          <button className="ctl" onClick={zoomIn} aria-label="Acercar" title="Acercar (+)" data-testid="zoom-in"><ZoomIn /></button>
          <button className="ctl" onClick={resetZoom} disabled={!isZoomed} aria-label="Tamaño normal" title="Tamaño normal (0)" data-testid="zoom-reset"><Minimize2 /></button>
          <button
            className="ctl fit"
            onClick={() => { setFitOverride(fit === 'contain' ? 'cover' : 'contain'); resetZoom(); }}
            aria-label={fit === 'contain' ? 'Llenar la pantalla' : 'Encajar la foto completa'}
            title={fit === 'contain' ? 'Llenar' : 'Encajar'}
            data-testid="fit"
          >
            {fit === 'contain' ? <Expand /> : <Shrink />}<span>{fit === 'contain' ? 'Llenar' : 'Encajar'}</span>
          </button>
          <button className="ctl" onClick={toggleFullscreen} aria-label={fullscreenOn ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa (F)" data-testid="fullscreen">
            {fullscreenOn ? <Minimize /> : <Maximize />}
          </button>
        </div>
      </nav>

      {immersive && hideUi ? null : immersive ? (
        <button className="exit-immersive" onClick={() => setImmersive(false)} aria-label="Salir de pantalla completa"><X /></button>
      ) : null}

      <div className={`tray${trayOpen ? ' open' : ''}`} aria-hidden={!trayOpen} data-testid="tray">
        <div className="tray-head">
          <span>Todas las fotos</span>
          <button className="ctl" onClick={() => setTrayOpen(false)} aria-label="Cerrar miniaturas" tabIndex={trayOpen ? 0 : -1}><X /></button>
        </div>
        <div className="tray-list" ref={trayRef}>
          {trayOpen && photos.map((p, i) => (
            <button
              key={p.id}
              className="thumb"
              onClick={() => jump(i)}
              aria-current={i === index}
              aria-label={`Ir a la foto ${i + 1}`}
            >
              <img src={assetUrl(p.thumb)} alt="" loading="lazy" decoding="async" style={{ transform: `rotate(${p.rotation}deg)` }} />
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
