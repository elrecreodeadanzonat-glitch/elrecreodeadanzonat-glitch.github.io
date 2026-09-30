import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCw, Crosshair, Trash2, Undo2, Expand, Shrink, MessageCircle,
} from 'lucide-react';
import type { Photo } from '../lib/types';
import type { Op } from './store';

interface Props {
  photo: Photo;
  position: number;
  total: number;
  thumbUrl: string;
  selected: boolean;
  isNew: boolean;
  onSelect: (id: string, on: boolean) => void;
  onOp: (op: Op) => void;
  onAskHide: (ids: string[]) => void;
  onFocal: (p: Photo) => void;
  trash?: boolean;
  /** number of comments on this photo; with onComments, a button opens them */
  comments?: number;
  onComments?: (p: Photo) => void;
}

export function PhotoCard({ photo, position, total, thumbUrl, selected, isNew, onSelect, onOp, onAskHide, onFocal, trash, comments = 0, onComments }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id, disabled: trash });
  const [caption, setCaption] = useState(photo.caption);
  const [captionSrc, setCaptionSrc] = useState(photo.caption);
  if (captionSrc !== photo.caption) {
    // the caption changed from outside (undo/redo): show it
    setCaptionSrc(photo.caption);
    setCaption(photo.caption);
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const commitCaption = () => onOp({ type: 'caption', id: photo.id, caption: caption.trim() });
  const fill = photo.fitMode === 'cover';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`card${isDragging ? ' dragging' : ''}${selected ? ' selected' : ''}`}
      data-testid="admin-card"
      data-photo-id={photo.id}
    >
      <div className="card-top">
        {!trash ? (
          <button className="grip" {...attributes} {...listeners} aria-label={`Arrastrar la foto ${position} para cambiar su lugar`}>
            <GripVertical />
          </button>
        ) : null}
        <span className="num">{trash ? 'Papelera' : `${position}`}</span>
        {isNew ? <span className="badge">Nueva</span> : null}
        {onComments ? (
          <button className={`card-comments${comments ? ' has' : ''}`} onClick={() => onComments(photo)} aria-label={`Comentarios de la foto ${position} (${comments})`} data-testid="card-comments">
            <MessageCircle aria-hidden="true" /> {comments}
          </button>
        ) : null}
        {!trash ? (
          <label className="check">
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(photo.id, e.target.checked)} aria-label={`Seleccionar la foto ${position}`} />
          </label>
        ) : null}
      </div>

      <div className={`card-img fit-${photo.fitMode}`}>
        <img
          src={thumbUrl}
          alt={photo.alt}
          loading="lazy"
          style={{ transform: `rotate(${photo.rotation}deg)`, objectFit: photo.fitMode, objectPosition: `${photo.focalPoint.x * 100}% ${photo.focalPoint.y * 100}%` }}
        />
        {fill ? <span className="focal-dot" style={{ left: `${photo.focalPoint.x * 100}%`, top: `${photo.focalPoint.y * 100}%` }} /> : null}
      </div>

      {!trash ? (
        <>
          <input
            className="caption-input"
            value={caption}
            placeholder="Pie de foto (opcional)"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={commitCaption}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label={`Pie de foto ${position}`}
            maxLength={160}
          />
          <div className="card-actions">
            <button onClick={() => onOp({ type: 'move', id: photo.id, to: 'start' })} disabled={position === 1} aria-label="Mover al inicio" title="Mover al inicio"><ChevronsLeft /></button>
            <button onClick={() => onOp({ type: 'move', id: photo.id, to: 'left' })} disabled={position === 1} aria-label="Mover a la izquierda" title="Mover antes"><ChevronLeft /></button>
            <button onClick={() => onOp({ type: 'move', id: photo.id, to: 'right' })} disabled={position === total} aria-label="Mover a la derecha" title="Mover después"><ChevronRight /></button>
            <button onClick={() => onOp({ type: 'move', id: photo.id, to: 'end' })} disabled={position === total} aria-label="Mover al final" title="Mover al final"><ChevronsRight /></button>
            <button onClick={() => onOp({ type: 'rotate', id: photo.id })} aria-label="Rotar 90 grados" title="Rotar 90°"><RotateCw /></button>
            <button onClick={() => onOp({ type: 'fit', id: photo.id, fitMode: fill ? 'contain' : 'cover' })} aria-label={fill ? 'Cambiar a Encajar' : 'Cambiar a Llenar'} title={fill ? 'Ahora: Llenar' : 'Ahora: Encajar'} className={fill ? 'on' : ''}>
              {fill ? <Shrink /> : <Expand />}
            </button>
            <button onClick={() => onFocal(photo)} aria-label="Ajustar punto focal" title="Punto focal (para «Llenar»)"><Crosshair /></button>
            <button className="danger" onClick={() => onAskHide([photo.id])} aria-label="Quitar (va a la papelera)" title="Quitar"><Trash2 /></button>
          </div>
        </>
      ) : (
        <div className="card-actions">
          <button className="restore" onClick={() => onOp({ type: 'restore', id: photo.id })} data-testid="restore"><Undo2 /> Restaurar</button>
        </div>
      )}
    </li>
  );
}
