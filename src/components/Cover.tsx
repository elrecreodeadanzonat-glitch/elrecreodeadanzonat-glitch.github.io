import { useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Book, type BookHandle } from './Book';
import { Floaters } from './Floaters';

interface Props {
  /** starts the music; called synchronously inside the click so browsers allow audio */
  onStart: () => void;
  /** called once the book has opened and the camera has flown into the page */
  onOpened: () => void;
  ready: boolean;
  error: string | null;
  /** first photo, shown on the right-hand page as the book opens */
  firstPhoto?: string;
}

export const INTRO_TEXT = 'Algunos buenos recuerdos de nuestro libro de la vida…';

export function Cover({ onStart, onOpened, ready, error, firstPhoto }: Props) {
  const book = useRef<BookHandle>(null);
  const [state, setState] = useState<'idle' | 'opening' | 'entering'>('idle');

  const open = async () => {
    if (state !== 'idle' || !ready) return;
    onStart();
    setState('opening');
    await book.current?.open();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    await new Promise((r) => window.setTimeout(r, reduced ? 0 : 380));
    setState('entering');
    window.setTimeout(onOpened, reduced ? 50 : 700);
  };

  return (
    <main className={`cover-screen state-${state}`} data-testid="cover">
      <Floaters />
      <div className="cover-stage">
        <Book ref={book} pagePhoto={firstPhoto} />
      </div>
      <div className="cover-copy">
        <h1 className="sr-only">Libro de mamá</h1>
        <p className="cover-text">{INTRO_TEXT}</p>
        <button className="open-btn" onClick={open} disabled={state !== 'idle' || !ready} data-testid="open-book">
          <BookOpen aria-hidden="true" />
          <span>{ready ? 'Abrir el libro' : 'Preparando…'}</span>
        </button>
        {error ? <p className="cover-error" role="alert">{error}</p> : null}
      </div>
    </main>
  );
}
