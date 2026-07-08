// Tiny external store for the mobile sidebar drawer (QA #59 round 3): the
// hamburger lives in the topbar (app layout) while the drawer lives in the
// timetable shell, so they share state through this module.
let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

export function subscribeSidebar(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isSidebarOpen(): boolean {
  return open;
}

export function toggleSidebar(): void {
  open = !open;
  emit();
}

export function closeSidebar(): void {
  if (!open) return;
  open = false;
  emit();
}
