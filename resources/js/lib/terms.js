// Domain vocabulary. The raw enum values were being printed straight into
// table cells ('single', 'interred') while every status next to them got a
// properly cased badge, so the same table spoke two registers. One place to
// name a thing in this domain, in the words the cemetery office uses.

export const BURIAL_TYPES = {
  single: 'Single grave',
  double: 'Double plot',
  family: 'Family plot',
  cremation: 'Cremation',
}

export const INTERMENT_STATUS = {
  scheduled: 'Scheduled',
  interred: 'Interred',
}

export const LOT_TYPES = {
  single: 'Single',
  double: 'Double',
  family: 'Family',
}

export const LOT_STATUS = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  unavailable: 'Unavailable',
  maintenance: 'Maintenance',
}

// The three a plot moves through on the map; the other LOT_STATUS values are
// set by hand in the editors and never drawn.
export const PLOT_STATUSES = ['available', 'reserved', 'occupied']

export const APPROVAL_STATUS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const PAYMENT_METHODS = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
}

export const PAYMENT_STATUS = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
}

export const ROLES = {
  admin: 'Admin',
  staff: 'Staff',
  user: 'Visitor/Client',
}

export const ACCOUNT_STATUS = {
  active: 'Active',
  inactive: 'Inactive',
}

export const NOTIFICATION_TYPES = {
  reservation: 'Reservation',
  system: 'System',
}

// A vocabulary map as Select options, optionally led by an "all" choice.
export const optionsOf = (map, all) => [
  ...(all ? [{ value: '', label: all }] : []),
  ...Object.entries(map).map(([value, text]) => ({ value, label: text })),
]

export const label = (map, value) => (value == null ? '' : map[value] || value)

// A register prints a lifespan, not two loose dates. Handles a birth or death
// date that was never recorded, which the schema allows on both.
export const lifespan = (born, died) => {
  const year = (d) => (d ? String(d).slice(0, 4) : null)
  const b = year(born)
  const d = year(died)
  if (b && d) return `${b}–${d}`
  if (d) return `d. ${d}`
  if (b) return `b. ${b}`
  return null
}

// 2026-07-20 -> 20 Jul 2026. The register's own convention: day first, so the
// most significant part of a date sits where a reader starts scanning.
export const longDate = (value) => {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  if (!y || !m || !d) return String(value)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(m) - 1]
  return month ? `${Number(d)} ${month} ${y}` : String(value)
}
// Whole pesos print without centavos; a partial payment keeps both digits, so
// ₱1,234.50 never reads as ₱1,234.5.
export const money = (value) => {
  const n = Number(value) || 0
  const digits = Number.isInteger(n) ? 0 : 2
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

// 2026-07-20 14:05:00 -> 20 Jul 2026, 14:05
export const longDateTime = (value) => {
  if (!value) return '—'
  const time = String(value).slice(11, 16)
  return time ? `${longDate(value)}, ${time}` : longDate(value)
}

// Today (or `date`) as YYYY-MM-DD in local time. Not toISOString(): that is
// UTC, which is still yesterday for the Philippines until 8 a.m.
export const localISO = (date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}
