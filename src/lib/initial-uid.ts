const initialUidKey = 'sunny-initial-uid';
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

