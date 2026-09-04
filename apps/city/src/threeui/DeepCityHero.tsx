import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './deep-city-hero.css';

const ENTRY_SESSION_KEY = 'deep-city-entered';

function DeepCityHero({ onEnter }: { onEnter: () => void }) {
  const [visible, setVisible] = useState(() => sessionStorage.getItem(ENTRY_SESSION_KEY) !== 'true');

  useEffect(() => {
    if (!visible) onEnter();
  }, []);

  if (!visible) return null;

  const enterCity = () => {
    sessionStorage.setItem(ENTRY_SESSION_KEY, 'true');
    onEnter();
    setVisible(false);
  };

  return (
    <section className="deepcity-hero" aria-labelledby="deepcity-cta">
      <div className="shader-frame" aria-hidden="true">
        <iframe
          src="/knowledge-text-loop.html"
          title="知识都市"
          loading="eager"
          scrolling="no"
          tabIndex={-1}
        />
      </div>
      <div className="deepcity-hero__veil" />
      <div className="deepcity-hero__content">
        <p>INTERACTIVE KNOWLEDGE CITY</p>
        <button type="button" id="deepcity-cta" onClick={enterCity}>
          <span>进入城市</span>
          <span aria-hidden="true">↘</span>
        </button>
      </div>
      <p className="deepcity-hero__hint">点击进入 · 拖动探索城市</p>
    </section>
  );
}

export function mountDeepCityHero(onEnter: () => void): void {
  const container = document.getElementById('city-entry-root');
  if (!container) return;
  createRoot(container).render(<DeepCityHero onEnter={onEnter} />);
}