const initialUidKey = 'sunny-initial-uid';
const associationsKey = 'sunny-initial-uid-accounts';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getInitialUid(): string {
  if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  const stored = localStorage.getItem(initialUidKey);
  if (stored !== null) {
    if (!uuidPattern.test(stored)) throw new Error('The saved browser identifier is invalid.');
    return stored;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(initialUidKey, id);
  return id;
}

export function associateInitialUid(userId: string): void {
  if (!userId.trim()) throw new Error('A user ID is required.');
  const id = getInitialUid();
  const stored = localStorage.getItem(associationsKey);
  const value: unknown = stored === null ? {} : JSON.parse(stored);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved browser associations are invalid.');
  }
  localStorage.setItem(associationsKey, JSON.stringify({ ...value, [userId]: id }));
}
