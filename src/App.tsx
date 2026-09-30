import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Gallery, Photo } from './lib/types';
import { assetUrl, loadGallery, visiblePhotos } from './lib/gallery';
import { MusicPlayer, type MusicState } from './lib/music';
import { loadPrefs, savePrefs } from './lib/prefs';
import { PLAYLIST } from './config';
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
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const player = useMemo(() => {
    const p = loadPrefs();
    return new MusicPlayer(PLAYLIST, p.volume, p.muted);
  }, []);
  const [music, setMusic] = useState<MusicState>(player.getState());
  const coverPreloaded = useRef(false);

  useEffect(() => player.subscribe(setMusic), [player]);
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

  const photos: Photo[] = useMemo(() => (gallery ? visiblePhotos(gallery) : []), [gallery]);

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

  // after publishing from the «+» sheet: load the new gallery; when the sheet closes, show the first new photo
  const onPublishedNew = async (firstNewId: string) => {
    try {
      setGallery(await loadGallery());
      setPendingJump(firstNewId);
    } catch {
      /* the new photos will show on the next visit */
    }
  };
  const closeAdding = () => {
    setAdding(null);
    if (pendingJump) {
      const i = photos.findIndex((p) => p.id === pendingJump);
      setPendingJump(null);
      if (i >= 0) {
        setStartIndex(i);
        setRun((r) => r + 1);
      }
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
        />
      )}
      {adding && gallery ? (
        <Suspense fallback={null}>
          <AddPhotos files={adding} gallery={gallery} onClose={closeAdding} onPublished={(id) => void onPublishedNew(id)} />
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
