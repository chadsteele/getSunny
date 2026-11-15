const STORAGE_KEY = 'sunny-current-user';

export type User = {
  userId: string;
  firstName: string;
  settings: Record<string, string | number | boolean | null>;
};

export type LocalUserProfile = Omit<User, 'settings'> & { settings?: User['settings'] };

function isLocalUserProfile(value: unknown): value is LocalUserProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Partial<LocalUserProfile>;
  return (
    typeof profile.userId === 'string' &&
    profile.userId.length > 0 &&
    typeof profile.firstName === 'string' &&
    profile.firstName.length > 0 &&
    (profile.settings === undefined ||
      (typeof profile.settings === 'object' &&
        profile.settings !== null &&
        !Array.isArray(profile.settings) &&
        Object.values(profile.settings).every(
          (setting) =>
            setting === null ||
            typeof setting === 'string' ||
            typeof setting === 'boolean' ||
            (typeof setting === 'number' && Number.isFinite(setting)),
        )))
  );
}

export function getCurrentUserProfile(): User | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const profile: unknown = JSON.parse(stored);
    if (isLocalUserProfile(profile)) return { ...profile, settings: profile.settings ?? {} };
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
  if (!isLocalUserProfile(profile)) throw new Error('Invalid user profile.');
  const previous = getCurrentUserProfile();
  const settings =
    profile.settings ?? (previous?.userId === profile.userId ? previous.settings : undefined) ?? {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, settings }));
}

export function clearCurrentUserProfile(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
