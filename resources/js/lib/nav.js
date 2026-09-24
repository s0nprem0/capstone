export function homePath(role) {
  if (role === 'admin') return '/admin'
  if (role === 'staff') return '/staff'
  return '/visitor/reserve'
}