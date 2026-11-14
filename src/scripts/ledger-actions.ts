import { displayDate, formatAmount, isNprInput, NPR_LABEL, parseAmount, parseOptionalAmount } from '../lib/format';
import {
  formatBytes,
  RECEIPT_IMAGE_MAX_BYTES,
  RECEIPT_IMAGE_MAX_EDGE,
  RECEIPT_IMAGE_TARGET_BYTES,
  RECEIPT_PDF_MAX_BYTES,
} from '../lib/receipt-limits';

const toggle = document.getElementById('download-toggle') as HTMLButtonElement | null;
const panel = document.getElementById('download-panel');
const status = document.getElementById('download-status');
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
  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    return field.defaultChecked ? '1' : '';
  }
  if (field instanceof HTMLSelectElement) {
    return [...field.options].find((option) => option.defaultSelected)?.value ?? field.options[0]?.value ?? '';
  }
  return field.defaultValue;
}

function currentValue(field: LedgerField) {
  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    return field.checked ? field.value || '1' : '';
  }
  return field.value;
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
  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    return value ? 'Yes' : 'No';
  }
  if (field instanceof HTMLInputElement && field.type === 'date') {
    return displayDate(value || null);
  }
  if (field.name === 'mobile' && value.trim()) {
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 ? `+91-${digits}` : value.trim();
  }
  if (isMoneyField(field)) {
    if (!value.trim()) return '—';
    if (field.name.startsWith('amount:') && isNprInput(value)) return NPR_LABEL;
    return formatAmount(parseAmount(value));
  }
  const text = value.trim();
  return text || '—';
}

function valuesMatch(field: LedgerField, previous: string, next: string) {
  if (field.name.startsWith('amount:')) {
    const prevEmpty = !previous.trim();
    const nextEmpty = !next.trim();
    if (prevEmpty || nextEmpty) return prevEmpty && nextEmpty;
    const prevNpr = isNprInput(previous);
    const nextNpr = isNprInput(next);
    if (prevNpr || nextNpr) return prevNpr && nextNpr;
    return parseAmount(previous) === parseAmount(next);
  }
  if (isMoneyField(field)) return parseAmount(previous) === parseAmount(next);
  if (field instanceof HTMLInputElement && field.type === 'date') return (previous || '') === (next || '');
  return previous.trim() === next.trim();
}

function collectChanges(form: HTMLFormElement, listAll: boolean) {
  const rows: ChangeRow[] = [];
  const fields = [...form.querySelectorAll<LedgerField>('input, select, textarea')];
  for (const field of fields) {
    if (field instanceof HTMLInputElement && (field.type === 'hidden' || field.type === 'submit')) continue;
    if (field.disabled && field.dataset.confirmInclude !== '1') continue;
    const previous = savedValue(field);
    const next = currentValue(field);
    const includeAlways = field.dataset.confirmInclude === '1';
    if (field.hasAttribute('data-npr-mode') && (previous === NPR_LABEL || next === NPR_LABEL)) continue;
    if (!listAll && !includeAlways && valuesMatch(field, previous, next)) continue;
    if (listAll && field.name === 'new_name' && !next.trim()) continue;
    rows.push({
      label: fieldLabel(field),
      from: listAll || includeAlways ? (valuesMatch(field, previous, next) ? '—' : displayValue(field, previous)) : displayValue(field, previous),
      to: displayValue(field, next),
    });
  }
  return rows;
}

function registeredExisting(form: HTMLFormElement) {
  const raw = form.dataset.registeredFlats;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const flatId = String(new FormData(form).get('flat_id') ?? '').trim();
    return map[flatId] || null;
  } catch {
    return null;
  }
}

function bindFlatPickers() {
  document.querySelectorAll<HTMLSelectElement>('[data-flat-picker]').forEach((select) => {
    const sourceId = select.dataset.flatPicker;
    const source = sourceId ? document.getElementById(sourceId) : null;
    if (!source) return;
    let flats: Array<{ id: string; resident: string; last4?: string | null }> = [];
    try {
      flats = JSON.parse(source.textContent || '[]') as typeof flats;
    } catch {
      return;
    }
    const form = select.form;
    const nameField = form?.querySelector<HTMLInputElement>('[data-fill-resident]');
    const mobileField = form?.querySelector<HTMLInputElement>('[data-fill-mobile]');
    const sync = () => {
      const flat = flats.find((item) => item.id === select.value);
      if (nameField) nameField.value = flat?.resident ?? '';
      if (mobileField) {
        const last4 = flat?.last4 ?? '';
        mobileField.value = last4 ? `•••• ${last4}` : '—';
      }
    };
    select.addEventListener('change', sync);
    sync();
  });
}

bindFlatPickers();

function todayInKolkata() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function bindMaintenanceCells() {
  document.querySelectorAll<HTMLInputElement>('input[data-cell-amount]').forEach((amount) => {
    const sibling = (prefix: string) =>
      amount.form?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${CSS.escape(amount.name.replace(/^amount:/, prefix))}"]`,
      ) ?? null;
    const select = sibling('mode:') as HTMLSelectElement | null;
    const date = sibling('paid:') as HTMLInputElement | null;
    const note = sibling('note:') as HTMLInputElement | null;
    let lastMode = !select || select.value === NPR_LABEL ? 'Cash' : select.value;

    select?.addEventListener('change', () => {
      if (select.value === NPR_LABEL) {
        amount.value = NPR_LABEL;
      } else {
        lastMode = select.value;
        if (isNprInput(amount.value)) amount.value = '';
      }
      amount.dispatchEvent(new Event('input', { bubbles: true }));
    });

    amount.addEventListener('input', () => {
      const npr = isNprInput(amount.value);
      const paid = !npr && (parseOptionalAmount(amount.value) ?? 0) > 0;
      if (select) {
        if (npr) {
          if (select.value !== NPR_LABEL) select.value = NPR_LABEL;
        } else if (select.value === NPR_LABEL) {
          select.value = lastMode;
        }
      }
      if (date) {
        date.hidden = !paid;
        if (paid && !date.value) {
          date.value = todayInKolkata();
          date.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (note) {
        note.hidden = !npr && !paid;
        note.placeholder = npr ? 'Why NPR?' : 'Note, e.g. why more or less';
      }
    });
  });
}

bindMaintenanceCells();

function bindCellTooltips() {
  const triggers = document.querySelectorAll<HTMLElement>('[data-cell-tip]');
  if (!triggers.length) return;
  const tip = document.createElement('div');
  tip.className = 'cell-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let active: HTMLElement | null = null;

  const hide = () => {
    tip.hidden = true;
    active = null;
  };
  const show = (trigger: HTMLElement) => {
    active = trigger;
    tip.textContent = trigger.dataset.cellTip ?? '';
    tip.hidden = false;
    const box = trigger.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = box.top - tip.offsetHeight - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= 8 ? above : box.bottom + 8}px`;
  };

  triggers.forEach((trigger) => {
    trigger.removeAttribute('title');
    trigger.addEventListener('mouseenter', () => show(trigger));
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('focus', () => show(trigger));
    trigger.addEventListener('blur', hide);
    trigger.addEventListener('click', () => (active === trigger && !tip.hidden ? hide() : show(trigger)));
  });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
}

bindCellTooltips();

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
      form.querySelectorAll<HTMLInputElement>('input[name="intent"][type="hidden"]').forEach((field) => {
        field.disabled = false;
      });
      dirty = false;
      return;
    }
    event.preventDefault();
    const submitter =
      event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
        ? event.submitter
        : null;
    const intent = intentOf(form, submitter);
    const overwriteLast4 = registeredExisting(form);
    const go = () => {
      form.dataset.confirmed = '1';
      const hiddenIntent = form.querySelector<HTMLInputElement>('input[name="intent"][type="hidden"]');
      const submitterSetsIntent =
        (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.name === 'intent';
      if (submitterSetsIntent && hiddenIntent) hiddenIntent.disabled = true;
      form.requestSubmit(submitter ?? undefined);
    };

    if (intent === 'delete') {
      const auditRows = collectChanges(form, true).map((row) => ({
        label: row.label,
        from: row.to,
        to: 'removed',
      }));
      openConfirm({
        title: 'Delete this row?',
        copy: 'This removes the entry from the ledger.',
        rows: auditRows,
        confirmLabel: 'Confirm delete',
        danger: true,
        onConfirm: () => go(),
      });
      return;
    }

    if (intent === 'refetch_cash_in_hand' || intent === 'refetch_cash_in_bank') {
      const fieldName = intent === 'refetch_cash_in_hand' ? 'cash_in_hand' : 'cash_in_bank';
      const field = form.querySelector<LedgerField>(`[name="${fieldName}"]`);
      if (!field) return;
      const computed = field.dataset.computed ?? '';
      if (valuesMatch(field, field.value, computed) && field.dataset.fromRecords === '1') {
        openConfirm({
          title: 'Already from records',
          copy: 'This closing balance already matches opening balances plus receipts minus expenses, including bank-to-cash withdrawals.',
          rows: [],
          confirmLabel: 'OK',
          onConfirm: () => undefined,
        });
        return;
      }
      const auditRows = [
        {
          label: fieldLabel(field),
          from: displayValue(field, field.value),
          to: displayValue(field, computed),
        },
      ];
      openConfirm({
        title: 'Reset from records?',
        copy: 'This clears any override and fetches the amount from opening balances, receipts, expenses, and bank-to-cash withdrawals.',
        rows: auditRows,
        confirmLabel: 'Confirm refetch',
        onConfirm: () => go(),
      });
      return;
    }

    const rows = collectChanges(form, intent === 'create');
    if (overwriteLast4) {
      const mobileRow = rows.find((row) => /mobile/i.test(row.label));
      if (mobileRow) mobileRow.from = `•••• ${overwriteLast4}`;
    }
    const customTitle = overwriteLast4
      ? form.dataset.overwriteTitle || 'Replace this mobile number?'
      : form.dataset.confirmTitle;
    const customCopy = overwriteLast4
      ? form.dataset.overwriteCopy || 'This overwrites the number already registered for this flat.'
      : form.dataset.confirmCopy;

    if (intent === 'create') {
      openConfirm({
        title: customTitle || 'Add this row?',
        copy: customCopy || 'Check the amount. An extra zero is saved as a much larger figure.',
        rows,
        confirmLabel: form.dataset.confirmLabel || 'Confirm add',
        onConfirm: () => go(),
      });
      return;
    }

    if (intent === 'approve') {
      openConfirm({
        title: customTitle || 'Approve this payment?',
        copy: customCopy || 'This records the bank details and updates the ledger.',
        rows,
        confirmLabel: form.dataset.confirmLabel || 'Confirm approve',
        onConfirm: () => go(),
      });
      return;
    }

    if (form.hasAttribute('data-confirm-action')) {
      let actionRows: ChangeRow[] = [];
      try {
        actionRows = JSON.parse(form.dataset.confirmRows || '[]') as ChangeRow[];
      } catch {
        actionRows = [];
      }
      openConfirm({
        title: customTitle || 'Continue?',
        copy: customCopy || '',
        rows: actionRows,
        confirmLabel: form.dataset.confirmLabel || 'Confirm',
        onConfirm: () => go(),
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
      title: customTitle || (rows.length === 1 ? 'Confirm this update?' : `Confirm these ${rows.length} updates?`),
      copy: customCopy || 'Nothing is saved until you confirm. Watch for an extra zero.',
      rows,
      confirmLabel: form.dataset.confirmLabel || 'Confirm save',
      onConfirm: () => go(),
    });
  });
});

(() => {
  const dwellPath = () => location.pathname + location.search;
  let dwellStart = Date.now();
  let lastPath = dwellPath();

  function sendDwell() {
    const path = lastPath;
    const sec = Math.round((Date.now() - dwellStart) / 1000);
    if (sec < 2 || !path.startsWith('/ledger')) return;
    const body = JSON.stringify({ path, duration_sec: sec });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/activity/dwell', new Blob([body], { type: 'application/json' }));
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendDwell();
      return;
    }
    dwellStart = Date.now();
    lastPath = dwellPath();
  });
  window.addEventListener('pagehide', sendDwell);
})();
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

function syncRpInputs() {
  const wide = window.matchMedia('(min-width: 1024px)').matches;
  document.querySelectorAll<HTMLElement>('[data-rp-inputs]').forEach((root) => {
    const disable = root.dataset.rpInputs === 'stack' ? wide : !wide;
    root
      .querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        'input, select, textarea, button[name="intent"]',
      )
      .forEach((field) => {
        field.disabled = disable;
      });
  });
}

syncRpInputs();
window.matchMedia('(min-width: 1024px)').addEventListener('change', syncRpInputs);

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrinks photos to a receipt-friendly JPEG; PDFs pass through if small enough. */
async function prepareReceipt(file: File): Promise<File> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > RECEIPT_PDF_MAX_BYTES) {
      throw new Error(`This PDF is ${formatBytes(file.size)}. PDFs must be 4 MB or less; scan at a lower quality or upload a photo.`);
    }
    return file;
  }
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error('This file could not be read. Choose a JPG, PNG, WebP photo or a PDF.');
  }
  const scale = Math.min(1, RECEIPT_IMAGE_MAX_EDGE / Math.max(decoded.width, decoded.height));
  const keep = scale === 1 && file.size <= RECEIPT_IMAGE_TARGET_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type);
  if (keep) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(decoded.width * scale);
  canvas.height = Math.round(decoded.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot compress photos. Try another browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

  let blob: Blob | null = null;
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= RECEIPT_IMAGE_TARGET_BYTES) break;
  }
  if (!blob || blob.size > RECEIPT_IMAGE_MAX_BYTES) {
    throw new Error('This photo is still too large after compression. Try a closer, simpler photo of the bill.');
  }
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

function bindReceiptForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-receipt-form]').forEach((form) => {
    const input = form.querySelector<HTMLInputElement>('[data-receipt-input]');
    const status = form.querySelector<HTMLElement>('[data-receipt-status]');
    form.querySelector<HTMLElement>('[data-receipt-submit]')?.setAttribute('hidden', '');
    if (!input) return;

    input.addEventListener('change', async () => {
      const picked = input.files?.[0];
      if (!picked) return;
      if (status) status.textContent = 'Preparing…';
      let file: File;
      try {
        file = await prepareReceipt(picked);
      } catch (error) {
        if (status) status.textContent = '';
        input.value = '';
        openConfirm({
          title: 'Cannot use this file',
          copy: error instanceof Error ? error.message : 'Choose another file.',
          rows: [],
          confirmLabel: 'OK',
          onConfirm: () => undefined,
        });
        return;
      }
      if (status) status.textContent = '';
      const existing = form.dataset.receiptExisting || '';
      const compressed = file !== picked ? ` · compressed from ${formatBytes(picked.size)}` : '';
      openConfirm({
        title: existing ? 'Replace this receipt?' : 'Attach this receipt?',
        copy: 'Residents can open it from the Expenses sheet.',
        rows: [
          {
            label: `${form.dataset.receiptLabel ?? 'Expense'} · receipt`,
            from: existing || '—',
            to: `${file.name} (${formatBytes(file.size)}${compressed})`,
          },
        ],
        confirmLabel: 'Confirm upload',
        onConfirm: async () => {
          if (status) status.textContent = 'Uploading…';
          const body = new FormData(form);
          body.set('receipt', file, file.name);
          try {
            const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
            window.location.assign(response.url || window.location.href);
          } catch {
            if (status) status.textContent = 'Upload failed. Check your connection and try again.';
          }
        },
      });
      input.value = '';
    });
  });

  document.querySelectorAll<HTMLFormElement>('form[data-receipt-delete]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (form.dataset.confirmed === '1') return;
      event.preventDefault();
      const bar = form.closest('.receipt-bar');
      const upload = bar?.querySelector<HTMLFormElement>('form[data-receipt-form]');
      openConfirm({
        title: 'Remove this receipt?',
        copy: 'The file is deleted. Residents will no longer see it.',
        rows: [
          {
            label: `${upload?.dataset.receiptLabel ?? 'Expense'} · receipt`,
            from: upload?.dataset.receiptExisting || 'Receipt',
            to: 'removed',
          },
        ],
        confirmLabel: 'Confirm remove',
        danger: true,
        onConfirm: () => {
          form.dataset.confirmed = '1';
          const button = form.querySelector<HTMLButtonElement>('button[name="intent"]');
          form.requestSubmit(button ?? undefined);
        },
      });
    });
  });
}

bindReceiptForms();

function bindReceiptViewer() {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[data-receipt-view]');
  if (!links.length) return;

  const root = document.createElement('div');
  root.className = 'receipt-viewer';
  root.hidden = true;
  root.innerHTML = `
    <div class="receipt-viewer-backdrop" data-viewer-close></div>
    <div class="receipt-viewer-panel" role="dialog" aria-modal="true" aria-labelledby="receipt-viewer-title">
      <div class="receipt-viewer-bar">
        <p class="receipt-viewer-title" id="receipt-viewer-title"></p>
        <a class="receipt-viewer-open" target="_blank" rel="noopener">Open in new tab</a>
        <button type="button" class="receipt-viewer-tool" data-viewer-rotate="-90" aria-label="Rotate left" title="Rotate left">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 4h4M4.6 7.6A6.5 6.5 0 1 1 3.5 11" />
          </svg>
        </button>
        <button type="button" class="receipt-viewer-tool" data-viewer-rotate="90" aria-label="Rotate right" title="Rotate right">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 8V4m0 4h-4m3.4-.4A6.5 6.5 0 1 0 16.5 11" />
          </svg>
        </button>
        <button type="button" class="receipt-viewer-tool" data-viewer-download aria-label="Download receipt" title="Download">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" />
          </svg>
        </button>
        <button type="button" class="receipt-viewer-close" data-viewer-close aria-label="Close receipt">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div class="receipt-viewer-body"></div>
    </div>`;
  document.body.append(root);

  const panel = root.querySelector<HTMLElement>('.receipt-viewer-panel')!;
  const body = root.querySelector<HTMLElement>('.receipt-viewer-body')!;
  const titleEl = root.querySelector<HTMLElement>('.receipt-viewer-title')!;
  const openTab = root.querySelector<HTMLAnchorElement>('.receipt-viewer-open')!;
  const closeButton = root.querySelector<HTMLButtonElement>('.receipt-viewer-close')!;
  const rotateButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-viewer-rotate]')];
  const downloadButton = root.querySelector<HTMLButtonElement>('[data-viewer-download]')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let opener: HTMLAnchorElement | null = null;
  let closing = false;
  let angle = 0;

  const currentImage = () => body.querySelector<HTMLImageElement>('.receipt-viewer-image');

  /** Turned sideways, the photo must fit the body with width and height swapped. */
  const applyRotation = () => {
    const image = currentImage();
    if (!image) return;
    const sideways = Math.abs(angle % 180) === 90;
    image.style.transform = angle ? `rotate(${angle}deg)` : '';
    image.style.maxWidth = sideways ? `${body.clientHeight}px` : '';
    image.style.maxHeight = sideways ? `${body.clientWidth}px` : '';
  };

  const fileBase = () =>
    `receipt-${(titleEl.textContent || 'receipt')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)}`;

  const saveFile = (href: string, name: string) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  /** Original file, or the photo as currently rotated. */
  const download = async () => {
    if (!opener) return;
    const image = currentImage();
    const type = opener.dataset.receiptView ?? '';
    const ext = type === 'application/pdf' ? 'pdf' : type.split('/')[1] || 'jpg';
    const turn = ((angle % 360) + 360) % 360;
    if (!image || !turn) {
      const url = new URL(opener.href);
      url.searchParams.set('download', '1');
      saveFile(url.toString(), `${fileBase()}.${ext}`);
      return;
    }
    await image.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    const sideways = turn === 90 || turn === 270;
    canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
    canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((turn * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    saveFile(href, `${fileBase()}-rotated.jpg`);
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  rotateButtons.forEach((button) =>
    button.addEventListener('click', () => {
      angle += Number(button.dataset.viewerRotate) || 0;
      applyRotation();
    }),
  );
  downloadButton.addEventListener('click', () => void download());
  window.addEventListener('resize', () => {
    if (!root.hidden) applyRotation();
  });

  const originFrom = (link: HTMLElement) => {
    const box = link.getBoundingClientRect();
    const left = (window.innerWidth - panel.offsetWidth) / 2;
    const top = (window.innerHeight - panel.offsetHeight) / 2;
    const x = box.left + box.width / 2 - left;
    const y = box.top + box.height / 2 - top;
    panel.style.transformOrigin = `${x}px ${y}px`;
  };

  const open = (link: HTMLAnchorElement) => {
    opener = link;
    closing = false;
    angle = 0;
    const type = link.dataset.receiptView ?? '';
    titleEl.textContent = link.dataset.receiptTitle || 'Receipt';
    openTab.href = link.href;
    rotateButtons.forEach((button) => (button.hidden = type === 'application/pdf'));
    body.replaceChildren();
    if (type === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.src = link.href;
      frame.title = titleEl.textContent;
      frame.className = 'receipt-viewer-pdf';
      body.append(frame);
    } else {
      const image = document.createElement('img');
      image.src = link.href;
      image.alt = `Receipt: ${titleEl.textContent}`;
      image.className = 'receipt-viewer-image';
      body.append(image);
    }
    root.hidden = false;
    document.body.classList.add('overflow-hidden');
    originFrom(link);
    requestAnimationFrame(() => root.classList.add('is-open'));
    closeButton.focus({ preventScroll: true });
  };

  const finishClose = () => {
    root.hidden = true;
    body.replaceChildren();
    document.body.classList.remove('overflow-hidden');
    opener?.focus({ preventScroll: true });
    opener = null;
    closing = false;
  };

  const close = () => {
    if (root.hidden || closing) return;
    closing = true;
    if (opener) originFrom(opener);
    root.classList.remove('is-open');
    if (reducedMotion.matches) {
      finishClose();
      return;
    }
    panel.addEventListener('transitionend', finishClose, { once: true });
    window.setTimeout(() => closing && finishClose(), 400);
  };

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(link);
    });
  });
  root.querySelectorAll('[data-viewer-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const focusables: HTMLElement[] = [openTab, ...rotateButtons.filter((button) => !button.hidden), downloadButton, closeButton];
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index + 1) % focusables.length;
      focusables[next].focus();
    }
  });
}

bindReceiptViewer();

const FESTIVAL_UPLOAD_WIDTHS = [400, 800, 1200, 1600];
const FESTIVAL_FALLBACK_WIDTHS = [300, 150];

/** Landing photos: a few JPEG widths made in the browser, so the server never resizes. */
async function festivalPhotoVariants(file: File) {
  const decoded = await decodeImage(file);
  let widths = FESTIVAL_UPLOAD_WIDTHS.filter((width) => width <= decoded.width);
  if (!widths.length) widths = FESTIVAL_FALLBACK_WIDTHS.filter((width) => width <= decoded.width).slice(0, 1);
  if (!widths.length) throw new Error('This photo is too small. Choose one at least 150 pixels wide.');
  const variants: Array<{ width: number; blob: Blob }> = [];
  for (const width of widths) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((decoded.height * width) / decoded.width);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare photos. Try another browser.');
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.82, 0.72, 0.6]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= RECEIPT_IMAGE_MAX_BYTES) break;
    }
    if (!blob || blob.size > RECEIPT_IMAGE_MAX_BYTES) throw new Error('This photo is too large even after compression.');
    variants.push({ width, blob });
  }
  return variants;
}

function bindFestivalUploads() {
  document.querySelectorAll<HTMLFormElement>('form[data-festival-upload]').forEach((form) => {
    const input = form.querySelector<HTMLInputElement>('[data-festival-file]');
    const status = form.querySelector<HTMLElement>('[data-festival-status]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = input?.files?.[0];
      if (!file) return;
      if (status) status.textContent = 'Preparing…';
      let variants: Array<{ width: number; blob: Blob }>;
      try {
        variants = await festivalPhotoVariants(file);
      } catch (error) {
        if (status) status.textContent = '';
        openConfirm({
          title: 'Cannot use this photo',
          copy: error instanceof Error ? error.message : 'Choose another photo.',
          rows: [],
          confirmLabel: 'OK',
          onConfirm: () => undefined,
        });
        return;
      }
      if (status) status.textContent = '';
      const total = variants.reduce((sum, variant) => sum + variant.blob.size, 0);
      openConfirm({
        title: 'Upload this festival photo?',
        copy: 'It joins the rotation on the landing page for this festival.',
        rows: [
          {
            label: form.dataset.festivalTitle ?? 'Festival',
            from: '—',
            to: `${file.name} (${variants.map((variant) => variant.width).join(', ')} px · ${formatBytes(total)})`,
          },
        ],
        confirmLabel: 'Upload photo',
        onConfirm: async () => {
          if (status) status.textContent = 'Uploading…';
          const body = new FormData(form);
          for (const variant of variants) body.set(`w${variant.width}`, variant.blob, `w${variant.width}.jpg`);
          try {
            const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
            window.location.assign(response.url || window.location.href);
          } catch {
            if (status) status.textContent = 'Upload failed. Check your connection and try again.';
          }
        },
      });
    });
  });
}

bindFestivalUploads();
