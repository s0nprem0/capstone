import { ACCOUNT_STATUS, APPROVAL_STATUS, INTERMENT_STATUS, LOT_STATUS, PAYMENT_STATUS, ROLES, label } from '../lib/terms'

const KINDS = {
  account: ACCOUNT_STATUS,
  approval: APPROVAL_STATUS,
  interment: INTERMENT_STATUS,
  lot: LOT_STATUS,
  payment: PAYMENT_STATUS,
  role: ROLES,
}

// The badge class keys off the raw value; the text is always the office's word
// for it, so a screen reader hears "Visitor/Client" rather than "user".
export default function StatusBadge({ kind, value }) {
  return <span className={`badge badge--${value}`}>{label(KINDS[kind], value)}</span>
}
