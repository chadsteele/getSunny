const STORAGE_KEY = 'sunny-current-user';

export type LocalUserProfile = {
  userId: string;
  firstName: string;
};

function isLocalUserProfile(value: unknown): value is LocalUserProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Partial<LocalUserProfile>;
  return (
    typeof profile.userId === 'string' &&
    profile.userId.length > 0 &&
    typeof profile.firstName === 'string' &&
    profile.firstName.length > 0
  );
}

export function getCurrentUserProfile(): LocalUserProfile | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const profile: unknown = JSON.parse(stored);
    if (isLocalUserProfile(profile)) return profile;
  } catch (error) {
    console.warn('[Sunny] Unable to read the saved user profile:', error);
    return null;
  }

  console.warn('[Sunny] Ignoring an invalid saved user profile.');
  return null;
}

export function saveCurrentUserProfile(profile: LocalUserProfile): void {
  if (typeof localStorage === 'undefined') {
    throw new Error('Browser storage is unavailable.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearCurrentUserProfile(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
