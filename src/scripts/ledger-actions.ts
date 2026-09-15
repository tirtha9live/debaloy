import { toPng } from 'html-to-image';
import { displayDate, formatAmount, parseAmount } from '../lib/format';

const toggle = document.getElementById('download-toggle') as HTMLButtonElement | null;
const panel = document.getElementById('download-panel');
const imageButton = document.getElementById('download-img') as HTMLButtonElement | null;
const status = document.getElementById('download-status');
const capture = document.getElementById('sheet-capture');
const excelLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-excel]')];
const backupLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-backup]')];
const importButton = document.getElementById('json-import') as HTMLButtonElement | null;
const importFile = document.getElementById('json-import-file') as HTMLInputElement | null;
const importRoot = document.getElementById('json-import-confirm');
const importLabel = document.getElementById('json-import-file-label');
const importCancel = document.getElementById('json-import-cancel');
const importMerge = document.getElementById('json-import-merge') as HTMLButtonElement | null;
const importOverwrite = document.getElementById('json-import-overwrite') as HTMLButtonElement | null;

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
  [...excelLinks, ...backupLinks].forEach((link) => {
    link.setAttribute('aria-disabled', String(busy));
    link.classList.toggle('pointer-events-none', busy);
  });
  if (imageButton) imageButton.disabled = busy;
  if (importButton) importButton.disabled = busy;
}

function triggerFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(header: string | null, fallback: string) {
  const match = header?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? fallback;
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

backupLinks.forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (toggle?.disabled) return;
    setMenuOpen(false);
    setBusy(true);
    if (status) status.textContent = 'Preparing JSON backup…';
    try {
      const response = await fetch('/api/export?kind=json');
      if (!response.ok) throw new Error('Backup failed');
      const filename = filenameFromDisposition(
        response.headers.get('Content-Disposition'),
        'debaloy-ledger.json',
      );
      triggerFile(await response.blob(), filename);
      if (status) status.textContent = 'JSON backup downloaded.';
    } catch {
      if (status) status.textContent = 'Could not download JSON backup. Try again.';
    } finally {
      setBusy(false);
    }
  });
});

function setImportOpen(open: boolean) {
  if (!importRoot) return;
  importRoot.classList.toggle('hidden', !open);
  importRoot.toggleAttribute('hidden', !open);
  importRoot.setAttribute('aria-hidden', String(!open));
}

function setImportBusy(busy: boolean) {
  if (importMerge) importMerge.disabled = busy;
  if (importOverwrite) importOverwrite.disabled = busy;
  if (importCancel) importCancel.toggleAttribute('disabled', busy);
}

async function restoreBackup(mode: 'merge' | 'overwrite') {
  const file = importFile?.files?.[0];
  if (!file) return;
  setImportBusy(true);
  setBusy(true, 'Restoring…');
  if (status) status.textContent = mode === 'overwrite' ? 'Overwriting from JSON…' : 'Merging JSON…';
  try {
    const body = new FormData();
    body.set('mode', mode);
    body.set('file', file);
    const response = await fetch('/api/backup/import', { method: 'POST', body, credentials: 'same-origin' });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || 'Restore failed');
    setImportOpen(false);
    if (status) status.textContent = mode === 'overwrite' ? 'Database overwritten from JSON.' : 'JSON merged into the database.';
    window.location.reload();
  } catch (error) {
    if (status) {
      status.textContent = error instanceof Error ? error.message : 'Could not restore that JSON.';
    }
    setImportBusy(false);
    setBusy(false);
  }
}

importButton?.addEventListener('click', () => {
  if (toggle?.disabled) return;
  setMenuOpen(false);
  importFile?.click();
});

importFile?.addEventListener('change', () => {
  const file = importFile.files?.[0];
  if (!file) return;
  if (importLabel) {
    importLabel.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '')) as { exportedAt?: string };
        if (parsed.exportedAt && importLabel) {
          importLabel.textContent = `${file.name} · exported ${parsed.exportedAt}`;
        }
      } catch {
        /* Filename is enough if the file is not previewable. */
      }
    };
    reader.readAsText(file.slice(0, 800));
  }
  setImportOpen(true);
});

importCancel?.addEventListener('click', () => {
  setImportOpen(false);
  if (importFile) importFile.value = '';
});
importRoot?.querySelector('[data-json-import-dismiss]')?.addEventListener('click', () => {
  setImportOpen(false);
  if (importFile) importFile.value = '';
});
importMerge?.addEventListener('click', () => void restoreBackup('merge'));
importOverwrite?.addEventListener('click', () => void restoreBackup('overwrite'));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || importRoot?.classList.contains('hidden')) return;
  setImportOpen(false);
  if (importFile) importFile.value = '';
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
    void fetch('/api/activity/download', { method: 'POST', credentials: 'same-origin' });
    if (status) status.textContent = 'Image downloaded.';
  } catch {
    if (status) status.textContent = 'Could not create the image. Try Excel formatted instead.';
  } finally {
    exportOnly.forEach((el) => el.classList.add('hidden'));
    setBusy(false);
  }
});

type LedgerField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type ChangeRow = {
  label: string;
  from: string;
  to: string;
};

const confirmRoot = document.getElementById('save-confirm');
const confirmTitle = document.getElementById('save-confirm-title');
const confirmCopy = document.getElementById('save-confirm-copy');
const confirmList = document.getElementById('save-confirm-list');
const confirmCancel = document.getElementById('save-confirm-cancel');
const confirmOk = document.getElementById('save-confirm-ok') as HTMLButtonElement | null;
let confirmAction: (() => void) | null = null;
let lastFocus: HTMLElement | null = null;

function isMoneyField(field: LedgerField) {
  return field.getAttribute('inputmode') === 'decimal' || /(?:^|:)amount$|^amount:|cash_in_/i.test(field.name);
}

function savedValue(field: LedgerField) {
  if (field instanceof HTMLSelectElement) {
    return [...field.options].find((option) => option.defaultSelected)?.value ?? field.options[0]?.value ?? '';
  }
  return field.defaultValue;
}

function fieldLabel(field: LedgerField) {
  const named = field.dataset.changeLabel?.trim();
  if (named) return named;
  const aria = field.getAttribute('aria-label')?.replace(/ (amount|mode)$/i, '').trim();
  if (aria) return aria;
  const wrap = field.closest('label')?.querySelector('.entry-label')?.textContent?.trim();
  if (wrap) return wrap;
  if (field.name === 'new_name') return 'New type';
  if (field.name.startsWith('name:')) return 'Type name';
  return field.name || 'Field';
}

function displayValue(field: LedgerField, value: string) {
  if (field instanceof HTMLInputElement && field.type === 'date') {
    return displayDate(value || null);
  }
  if (isMoneyField(field)) {
    return formatAmount(parseAmount(value)) || '0.00';
  }
  const text = value.trim();
  return text || '—';
}

function valuesMatch(field: LedgerField, previous: string, next: string) {
  if (isMoneyField(field)) return parseAmount(previous) === parseAmount(next);
  if (field instanceof HTMLInputElement && field.type === 'date') return (previous || '') === (next || '');
  return previous.trim() === next.trim();
}

function collectChanges(form: HTMLFormElement, listAll: boolean) {
  const rows: ChangeRow[] = [];
  const fields = [...form.querySelectorAll<LedgerField>('input, select, textarea')];
  for (const field of fields) {
    if (field instanceof HTMLInputElement && (field.type === 'hidden' || field.type === 'submit')) continue;
    if (field.disabled) continue;
    const previous = savedValue(field);
    const next = field.value;
    if (!listAll && valuesMatch(field, previous, next)) continue;
    if (listAll && field.name === 'new_name' && !next.trim()) continue;
    rows.push({
      label: fieldLabel(field),
      from: listAll ? '—' : displayValue(field, previous),
      to: displayValue(field, next),
    });
  }
  return rows;
}

function intentOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  if (submitter instanceof HTMLButtonElement && submitter.name === 'intent') return submitter.value;
  if (submitter instanceof HTMLInputElement && submitter.name === 'intent') return submitter.value;
  const hidden = form.querySelector<HTMLInputElement>('input[name="intent"][type="hidden"]');
  return hidden?.value || 'save';
}

function renderChanges(rows: ChangeRow[]) {
  if (!confirmList) return;
  if (!rows.length) {
    confirmList.innerHTML = '<p class="py-3 text-sm text-body dark:text-slate-300">No values have changed.</p>';
    return;
  }
  confirmList.innerHTML = rows
    .map(
      (row) => `<div class="border-b border-hairline py-3 last:border-b-0 dark:border-slate-800">
        <p class="text-sm text-body dark:text-slate-300">${escapeHtml(row.label)}</p>
        <p class="mt-1 font-mono text-sm tabular-nums">
          <span class="text-mute">${escapeHtml(row.from)}</span>
          <span class="sr-only"> to </span>
          <span aria-hidden="true" class="px-1 text-mute">→</span>
          <span class="font-medium text-ink dark:text-slate-100">${escapeHtml(row.to)}</span>
        </p>
      </div>`,
    )
    .join('');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setConfirmOpen(open: boolean) {
  if (!confirmRoot) return;
  confirmRoot.hidden = !open;
  confirmRoot.setAttribute('aria-hidden', open ? 'false' : 'true');
  confirmRoot.classList.toggle('hidden', !open);
  document.body.classList.toggle('overflow-hidden', open);
  if (open) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmOk?.focus();
  } else {
    lastFocus?.focus();
    lastFocus = null;
    confirmAction = null;
  }
}

function openConfirm(opts: {
  title: string;
  copy: string;
  rows: ChangeRow[];
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  if (!confirmRoot || !confirmTitle || !confirmCopy || !confirmOk) return;
  confirmTitle.textContent = opts.title;
  confirmCopy.textContent = opts.copy;
  confirmOk.textContent = opts.confirmLabel;
  confirmOk.classList.toggle('bg-error', Boolean(opts.danger));
  confirmOk.classList.toggle('text-white', Boolean(opts.danger));
  confirmOk.classList.toggle('dark:bg-red-400', Boolean(opts.danger));
  confirmOk.classList.toggle('dark:text-slate-950', Boolean(opts.danger));
  confirmOk.classList.toggle('bg-primary', !opts.danger);
  confirmOk.classList.toggle('text-on-primary', !opts.danger);
  confirmOk.classList.toggle('dark:bg-slate-100', !opts.danger);
  renderChanges(opts.rows);
  confirmAction = opts.onConfirm;
  setConfirmOpen(true);
}

confirmCancel?.addEventListener('click', () => setConfirmOpen(false));
confirmRoot?.querySelector('[data-save-confirm-dismiss]')?.addEventListener('click', () => setConfirmOpen(false));
confirmOk?.addEventListener('click', () => {
  const action = confirmAction;
  setConfirmOpen(false);
  action?.();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || confirmRoot?.classList.contains('hidden')) return;
  event.preventDefault();
  setConfirmOpen(false);
});

const ledgerForms = [...document.querySelectorAll<HTMLFormElement>('form[data-ledger-form]')];
let dirty = false;
ledgerForms.forEach((form) => {
  form.addEventListener('input', () => {
    dirty = true;
  });
  form.addEventListener('submit', (event) => {
    if (form.dataset.confirmed === '1') {
      delete form.dataset.confirmed;
      dirty = false;
      return;
    }
    event.preventDefault();
    const submitter =
      event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
        ? event.submitter
        : null;
    const intent = intentOf(form, submitter);
    const go = () => {
      form.dataset.confirmed = '1';
      form.requestSubmit(submitter ?? undefined);
    };

    if (intent === 'delete') {
      openConfirm({
        title: 'Delete this row?',
        copy: 'This removes the entry from the ledger.',
        rows: collectChanges(form, true).map((row) => ({
          label: row.label,
          from: row.to,
          to: 'removed',
        })),
        confirmLabel: 'Confirm delete',
        danger: true,
        onConfirm: go,
      });
      return;
    }

    const rows = collectChanges(form, intent === 'create');
    if (intent === 'create') {
      openConfirm({
        title: 'Add this row?',
        copy: 'Check the amount. An extra zero is saved as a much larger figure.',
        rows,
        confirmLabel: 'Confirm add',
        onConfirm: go,
      });
      return;
    }

    if (!rows.length) {
      openConfirm({
        title: 'Nothing to save',
        copy: 'No values have changed on this sheet.',
        rows: [],
        confirmLabel: 'OK',
        onConfirm: () => undefined,
      });
      return;
    }

    openConfirm({
      title: rows.length === 1 ? 'Confirm this update?' : `Confirm these ${rows.length} updates?`,
      copy: 'Nothing is saved until you confirm. Watch for an extra zero.',
      rows,
      confirmLabel: 'Confirm save',
      onConfirm: go,
    });
  });
});
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
