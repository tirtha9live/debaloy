import { toPng } from 'html-to-image';

const toggle = document.getElementById('download-toggle') as HTMLButtonElement | null;
const panel = document.getElementById('download-panel');
const imageButton = document.getElementById('download-img') as HTMLButtonElement | null;
const status = document.getElementById('download-status');
const capture = document.getElementById('sheet-capture');
const excelLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-excel]')];

function setMenuOpen(open: boolean) {
  if (!toggle || !panel) return;
  toggle.setAttribute('aria-expanded', String(open));
  panel.classList.toggle('hidden', !open);
}

function setBusy(busy: boolean, busyLabel = 'Downloading…') {
  if (!toggle) return;
  const spinner = toggle.querySelector('.js-spinner');
  const label = toggle.querySelector('.js-label');
  const chevron = toggle.querySelector('.js-chevron');
  spinner?.classList.toggle('hidden', !busy);
  chevron?.classList.toggle('hidden', busy);
  if (label) label.textContent = busy ? busyLabel : 'Download';
  toggle.setAttribute('aria-busy', String(busy));
  toggle.disabled = busy;
  excelLinks.forEach((link) => {
    link.setAttribute('aria-disabled', String(busy));
    link.classList.toggle('pointer-events-none', busy);
  });
  if (imageButton) imageButton.disabled = busy;
}

function triggerFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  setMenuOpen(!open);
});

document.addEventListener('click', (event) => {
  const menu = document.getElementById('download-menu');
  if (!menu || menu.contains(event.target as Node)) return;
  setMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});

excelLinks.forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (toggle?.disabled) return;
    const kind = link.dataset.excel === 'raw' ? 'raw' : 'formatted';
    const filename = kind === 'raw' ? 'Debaloy_2026-27-raw.xlsx' : 'Debaloy_2026-27.xlsx';
    setMenuOpen(false);
    setBusy(true);
    if (status) status.textContent = kind === 'raw' ? 'Preparing Excel raw…' : 'Preparing Excel formatted…';
    try {
      const response = await fetch(`/api/export?kind=${kind}`);
      if (!response.ok) throw new Error('Export failed');
      triggerFile(await response.blob(), filename);
      if (status) status.textContent = `${kind === 'raw' ? 'Excel raw' : 'Excel formatted'} downloaded.`;
    } catch {
      if (status) status.textContent = 'Could not download Excel. Try again.';
    } finally {
      setBusy(false);
    }
  });
});

imageButton?.addEventListener('click', async () => {
  if (!capture || imageButton.disabled) return;
  const sheet = imageButton.dataset.sheet || 'ledger';
  const exportOnly = [...capture.querySelectorAll<HTMLElement>('[data-export-only]')];
  setMenuOpen(false);
  setBusy(true);
  if (status) status.textContent = 'Preparing image…';
  exportOnly.forEach((el) => el.classList.remove('hidden'));
  try {
    const dark = document.documentElement.classList.contains('dark');
    const dataUrl = await toPng(capture, {
      pixelRatio: 2,
      backgroundColor: dark ? '#020617' : '#fafafa',
      cacheBust: true,
    });
    const res = await fetch(dataUrl);
    triggerFile(await res.blob(), `debaloy-${sheet}.png`);
    if (status) status.textContent = 'Image downloaded.';
  } catch {
    if (status) status.textContent = 'Could not create the image. Try Excel formatted instead.';
  } finally {
    exportOnly.forEach((el) => el.classList.add('hidden'));
    setBusy(false);
  }
});

const form = document.querySelector<HTMLFormElement>('form[data-ledger-form]');
if (form) {
  let dirty = false;
  form.addEventListener('input', () => {
    dirty = true;
  });
  form.addEventListener('submit', () => {
    dirty = false;
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
