import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Gallery, Photo } from './lib/types';
import { assetUrl, loadGallery, visiblePhotos } from './lib/gallery';
import { MusicPlayer, type MusicState } from './lib/music';
import { loadPrefs, savePrefs } from './lib/prefs';
import { PLAYLIST } from './config';
import { CloudStore, cloudPhotoAsPage, useCloudState } from './lib/cloudStore';
import { Cover } from './components/Cover';
import { Viewer } from './components/Viewer';
import { Outro } from './components/Outro';

const AddPhotos = lazy(() => import('./components/AddPhotos'));

type Phase = 'cover' | 'viewer' | 'outro';

export default function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('cover');
  const [run, setRun] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const [adding, setAdding] = useState<File[] | null>(null);
  const player = useMemo(() => {
    const p = loadPrefs();
    return new MusicPlayer(PLAYLIST, p.volume, p.muted);
  }, []);
  const [music, setMusic] = useState<MusicState>(player.getState());
  const cloud = useMemo(() => new CloudStore(), []);
  const cloudState = useCloudState(cloud);
  const coverPreloaded = useRef(false);

  useEffect(() => player.subscribe(setMusic), [player]);
  useEffect(() => {
    cloud.start();
    return () => cloud.stop();
  }, [cloud]);
  useEffect(() => savePrefs({ volume: music.volume, muted: music.muted }), [music.volume, music.muted]);

  useEffect(() => {
    const ac = new AbortController();
    loadGallery(ac.signal)
      .then(setGallery)
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setError('No pudimos cargar las fotos. Revisa tu conexión y vuelve a intentarlo.');
      });
    return () => ac.abort();
  }, []);

  // the book: photos from gallery.json, then the ones the family added from the «+» (oldest first)
  const photos: Photo[] = useMemo(() => {
    if (!gallery) return [];
    const book = visiblePhotos(gallery);
    const known = new Set(book.map((p) => p.id));
    const added = cloudState
      ? cloudState.photos.filter((c) => !c.hidden && !known.has(c.id)).map((c, i) => cloudPhotoAsPage(c, cloudState, book.length + i + 1))
      : [];
    return [...book, ...added];
  }, [gallery, cloudState]);

  // warm up only the first photo while the cover is on screen
  useEffect(() => {
    if (!photos.length || coverPreloaded.current) return;
    coverPreloaded.current = true;
    const img = new Image();
    img.src = assetUrl(photos[0].srcMd ?? photos[0].src);
  }, [photos]);

  const start = useCallback(() => {
    void player.start();
  }, [player]);

  const toggleMute = useCallback(() => {
    const s = player.getState();
    if (!s.started) void player.start();
    player.setMuted(!s.muted);
  }, [player]);

  const last = photos[photos.length - 1];

  // the «+» sheet closed: if photos were added, open the book on the first of them
  const closeAdding = (firstNewId?: string) => {
    setAdding(null);
    const i = firstNewId ? photos.findIndex((p) => p.id === firstNewId) : -1;
    if (i >= 0) {
      setStartIndex(i);
      setRun((r) => r + 1);
      setPhase('viewer');
    }
  };

  return (
    <>
      {phase === 'cover' && (
        <Cover ready={!!gallery && photos.length > 0} error={error} firstPhoto={photos[0] ? assetUrl(photos[0].srcMd ?? photos[0].src) : undefined} onStart={start} onOpened={() => { setStartIndex(0); setRun((r) => r + 1); setPhase('viewer'); }} />
      )}
      {phase === 'viewer' && (
        <Viewer
          key={run}
          photos={photos}
          music={music}
          onToggleMute={toggleMute}
          onVolume={(v) => player.setVolume(v)}
          onFinish={() => setPhase('outro')}
          startIndex={startIndex}
          onAddFiles={setAdding}
          blocked={!!adding}
          cloud={cloud}
        />
      )}
      {adding ? (
        <Suspense fallback={null}>
          <AddPhotos files={adding} store={cloud} onClose={closeAdding} />
        </Suspense>
      ) : null}
      {phase === 'outro' && (
        <Outro
          lastThumb={last ? assetUrl(last.srcMd ?? last.src) : undefined}
          onSwell={(l) => player.swell(l)}
          onRestart={() => setPhase('cover')}
          onReplay={() => { setStartIndex(0); setRun((r) => r + 1); setPhase('viewer'); }}
        />
      )}
    </>
  );
}
