/** When a form has hidden intent plus a submit button intent, `form.get('intent')` is unreliable. */
const INTENT_PRIORITY = [
  'delete',
  'refetch_cash_in_hand',
  'refetch_cash_in_bank',
  'update_end',
  'close',
  'update',
  'create',
  'save',
] as const;

export function readFormIntent(form: FormData, fallback = 'save') {
  const values = [
    ...new Set(
      form
        .getAll('intent')
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
  for (const preferred of INTENT_PRIORITY) {
    if (values.includes(preferred)) return preferred;
  }
  return values[0] ?? fallback;
}
