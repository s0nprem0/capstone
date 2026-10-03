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

export const PAYMENT_STATUS = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
}

export const APPROVAL_STATUS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

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