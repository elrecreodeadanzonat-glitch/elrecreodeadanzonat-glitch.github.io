import { useState } from 'react';
import { MessageCircle, RotateCw, EyeOff, Eye, Loader2 } from 'lucide-react';
import type { CloudPhoto } from '../lib/cloud';
import { rotateBy90 } from '../lib/gallery';
import { timeAgo } from '../lib/timeAgo';

interface Props {
  photo: CloudPhoto;
  /** page number in the book, or null when hidden */
  page: number | null;
  comments: number;
  onComments: (p: CloudPhoto) => void;
  /** resolves when done; throws with a message to show */
  onChange: (p: CloudPhoto, change: { hidden: boolean } | { rotation: CloudPhoto['rotation'] }) => Promise<void>;
  onAskHide: (p: CloudPhoto) => void;
}

/** A photo someone added from the book («+»). It lives in Firestore, after the photos of gallery.json. */
export function FamilyCard({ photo, page, comments, onComments, onChange, onAskHide }: Props) {
  const [busy, setBusy] = useState<'rotate' | 'show' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'rotate' | 'show', change: Parameters<Props['onChange']>[1]) => {
    setBusy(kind);
    setError(null);
    try {
      await onChange(photo, change);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className={`card family${photo.hidden ? ' is-hidden' : ''}`} data-testid="family-card" data-photo-id={photo.id}>
      <div className="card-top">
        <span className="num">{page ? `${page}` : 'Oculta'}</span>
        <span className="badge fam">De la familia</span>
        <button className={`card-comments${comments ? ' has' : ''}`} onClick={() => onComments(photo)} aria-label={`Comentarios (${comments})`} data-testid="card-comments">
          <MessageCircle aria-hidden="true" /> {comments}
        </button>
      </div>
      <div className="card-img">
        <img src={photo.thumb} alt="" loading="lazy" style={{ transform: `rotate(${photo.rotation}deg)`, objectFit: 'contain' }} />
      </div>
      <p className="fam-meta">
        Compartida por <b>{photo.author || 'alguien de la familia'}</b> · {timeAgo(photo.createdAt)}
      </p>
      {error ? <p className="fam-error" role="alert">{error}</p> : null}
      <div className="card-actions fam-actions">
        <button onClick={() => void run('rotate', { rotation: rotateBy90(photo.rotation) })} disabled={!!busy} aria-label="Rotar 90 grados" title="Rotar 90°">
          {busy === 'rotate' ? <Loader2 className="spin" /> : <RotateCw />}
        </button>
        {photo.hidden ? (
          <button className="restore" onClick={() => void run('show', { hidden: false })} disabled={!!busy} data-testid="family-show">
            {busy === 'show' ? <Loader2 className="spin" /> : <Eye />} Mostrar de nuevo
          </button>
        ) : (
          <button className="danger wide" onClick={() => onAskHide(photo)} disabled={!!busy} data-testid="family-hide">
            <EyeOff /> Ocultar del libro
          </button>
        )}
      </div>
    </li>
  );
}
