import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import '@designcodeio/threeui/style.css';
import './office-gallery.css';

const ARTWORKS = [
  ['/assets/gallery/public-01.svg', 'Orbit and threshold — original Metrobsidian study'],
  ['/assets/gallery/public-02.svg', 'Archive window — original Metrobsidian study'],
  ['/assets/gallery/public-03.svg', 'Rising field — original Metrobsidian study'],
  ['/assets/gallery/public-04.svg', 'Rotating rooms — original Metrobsidian study'],
  ['/assets/gallery/public-05.svg', 'Memory current — original Metrobsidian study'],
  ['/assets/gallery/public-06.svg', 'Three agents — original Metrobsidian study'],
  ['/assets/gallery/public-07.svg', 'City signal — original Metrobsidian study'],
] as const;

function OfficeGallery() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const orbitRotationRef = useRef(0);
  const dragXRef = useRef<number | null>(null);

  useEffect(() => {
    const trigger = document.getElementById('gallery-toggle');
    if (!(trigger instanceof HTMLButtonElement)) return undefined;

    const showGallery = () => setOpen(true);
    trigger.addEventListener('click', showGallery);
    return () => trigger.removeEventListener('click', showGallery);
  }, []);

  useEffect(() => {
    const trigger = document.getElementById('gallery-toggle');
    const app = document.getElementById('office-app');
    trigger?.setAttribute('aria-pressed', String(open));
    document.body.classList.toggle('office-gallery-is-open', open);
    if (app instanceof HTMLElement) app.inert = open;

    if (!open) return undefined;
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);

  useEffect(() => {
    if (!open || !orbitRef.current) return undefined;
    const orbit = orbitRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let previousTime = performance.now();

    const render = (time: number) => {
      const elapsed = Math.min(time - previousTime, 40);
      previousTime = time;
      if (!reduceMotion && dragXRef.current === null) orbitRotationRef.current -= elapsed * 0.0045;
      orbit.style.setProperty('--orbit-rotation', `${orbitRotationRef.current}deg`);
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const startOrbitDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveOrbit = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragXRef.current === null) return;
    orbitRotationRef.current += (event.clientX - dragXRef.current) * 0.24;
    dragXRef.current = event.clientX;
  };

  const stopOrbitDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragXRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const rotateWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? 1 : -1;
    orbitRotationRef.current += direction * (360 / ARTWORKS.length);
  };

  if (!open) return null;

  return (
    <section
      className="office-gallery"
      role="dialog"
      aria-modal="true"
      aria-labelledby="office-gallery-title"
    >
      <div
        className="office-gallery__orbit-stage"
        aria-label="公司画廊中的七件环形展品，可左右拖动"
        role="group"
        tabIndex={0}
        onKeyDown={rotateWithKeyboard}
        onPointerDown={startOrbitDrag}
        onPointerMove={moveOrbit}
        onPointerUp={stopOrbitDrag}
        onPointerCancel={stopOrbitDrag}
      >
        <div ref={orbitRef} className="office-gallery__orbit">
          {ARTWORKS.map(([src, alt], index) => (
            <figure
              key={src}
              style={{ '--art-angle': `${index * (360 / ARTWORKS.length)}deg` } as CSSProperties}
            >
              <img src={src} alt={alt} draggable="false" />
            </figure>
          ))}
        </div>
      </div>
      <div className="office-gallery__scrim" />
      <header className="office-gallery__header">
        <p>METROBSIDIAN / COMPANY ARCHIVE</p>
        <h1 id="office-gallery-title">画廊</h1>
        <span>位置：公司中庭 · 前台与主走廊之间</span>
      </header>
      <div className="office-gallery__index" aria-hidden="true">01 — 07 · 拖动环游</div>
      <button
        ref={closeButtonRef}
        className="office-gallery__close"
        type="button"
        onClick={() => setOpen(false)}
      >
        返回办公室 <span aria-hidden="true">✕</span>
      </button>
    </section>
  );
}

export function mountOfficeGallery(): void {
  const container = document.getElementById('office-gallery-root');
  if (!container) return;
  createRoot(container).render(<OfficeGallery />);
}
