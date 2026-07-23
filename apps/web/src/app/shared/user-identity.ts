// The signed-in identity as the JWT states it - the ONE source of truth for
// keying per-user client state (favorites cache, recent screens, view
// preferences). Never key such state by the loosely-managed localStorage
// 'userEmail' and never cache it for the app's lifetime: logout -> login is an
// in-app navigation (no page reload), so a singleton service that latches
// per-user state once will leak the PREVIOUS user's data into the next
// session (real bug, found 2026-07-23 with a fresh user inheriting the prior
// user's Quick access).

export interface UserIdentity {
  userId: string;
  companyId: string;
}

export function tokenIdentity(): UserIdentity | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.id !== 'string' || !payload.id) return null;
    return {
      userId: payload.id,
      companyId: typeof payload.companyId === 'string' ? payload.companyId : 'SYSTEM',
    };
  } catch {
    return null;
  }
}

/** A stable string for "who + which workspace", or null when signed out. */
export function identityKey(): string | null {
  const id = tokenIdentity();
  return id ? `${id.userId}:${id.companyId}` : null;
}
