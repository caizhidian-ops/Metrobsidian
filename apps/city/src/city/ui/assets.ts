import { fetchBuildings } from '../api';
import { loadMeta } from '../../generator/storage';

export function setupAssets() {
  const dialog = required<HTMLDialogElement>('assets-dialog');
  const list = required<HTMLUListElement>('assets-list');
  const empty = required<HTMLElement>('assets-empty');
  required<HTMLButtonElement>('assets-trigger').addEventListener('click', () => {
    void refresh();
    dialog.showModal();
  });
  required<HTMLButtonElement>('assets-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  async function refresh(): Promise<void> {
    const remote = (await fetchBuildings())?.filter((building) => building.is_discovered && building.asset) ?? [];
    const local = loadMeta();
    const rows = [
      ...remote.map((asset) => ({ id: asset.id, name: asset.name, source: '文件投递生成', asset: asset.asset! })),
      ...local.filter((asset) => !remote.some((item) => item.id === asset.id)).map((asset) => ({ id: asset.id, name: asset.name, source: '文字生成', asset: '本地已缓存 GLB' })),
    ];
    list.replaceChildren(...rows.map((asset) => {
      const item = document.createElement('li');
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      const source = document.createElement('small');
      name.textContent = asset.name;
      source.textContent = asset.source;
      copy.append(name, source);
      const path = document.createElement('code');
      path.textContent = asset.asset;
      item.append(copy, path);
      return item;
    }));
    empty.hidden = rows.length > 0;
  }

  return { refresh };
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
