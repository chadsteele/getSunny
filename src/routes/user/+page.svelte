<script lang="ts">
  import { onMount } from 'svelte';
  import { StytchClient } from '@stytch/vanilla-js/headless';
  import type { Session } from '@stytch/vanilla-js/headless';
  import Layout from '../../components/Layout.svelte';
  import {
    clearCurrentUserProfile,
    getCurrentUserProfile,
    saveCurrentUserProfile,
  } from '../../lib/user-profile';
  import '../../styles.css';

  let stytch: StytchClient | undefined;
  let session = $state<Session | null>(null);
  let firstName = $state('');
  let email = $state('');
  let code = $state('');
  let methodId = $state('');
  let loading = $state(true);
  let isConfigured = $state(false);
  let busy = $state(false);
  let profileSaveFailed = $state(false);
  let notice = $state('');
  let errorMessage = $state('');

  const pendingFirstNameKey = 'sunny-pending-first-name';
  const localFirstNameKey = (userId: string) => `sunny-first-name:${userId}`;
  const pendingSyncFirstNameKey = (userId: string) => `sunny-pending-profile:${userId}`;

  function showError(error: unknown) {
    console.error('[user] Account operation failed:', error);
    errorMessage =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : 'Account operation failed.';
  }

  onMount(() => {
    const publicToken = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN;
    if (!publicToken) {
      errorMessage = 'Stytch is not configured. Contact the site administrator.';
      loading = false;
      return;
    }

    stytch = new StytchClient(publicToken);
    isConfigured = true;
    session = stytch.session.getSync();
    try {
      const pendingFirstName = localStorage.getItem(pendingFirstNameKey);
      const pendingSyncFirstName =
        session && localStorage.getItem(pendingSyncFirstNameKey(session.user_id));
      const savedProfile = getCurrentUserProfile();
      firstName =
        pendingSyncFirstName ??
        (session && savedProfile?.userId === session.user_id ? savedProfile.firstName : null) ??
        (session && localStorage.getItem(localFirstNameKey(session.user_id))) ??
        pendingFirstName ??
        '';
      profileSaveFailed = Boolean(session && pendingSyncFirstName);
      if (session && firstName && savedProfile?.userId !== session.user_id) {
        saveCurrentUserProfile({ userId: session.user_id, firstName });
      }
    } catch (error) {
      showError(error);
    }
    loading = false;
    return stytch.session.onChange((nextSession) => {
      session = nextSession;
      if (nextSession) {
        try {
          const pendingSyncFirstName = localStorage.getItem(
            pendingSyncFirstNameKey(nextSession.user_id),
          );
          if (!methodId) {
            firstName =
              pendingSyncFirstName ??
              localStorage.getItem(localFirstNameKey(nextSession.user_id)) ??
              firstName;
            profileSaveFailed = Boolean(pendingSyncFirstName);
          }
        } catch (error) {
          showError(error);
        }
        methodId = '';
        code = '';
        notice = 'Signed in successfully.';
      }
    });
  });

  async function sendCode() {
    if (!stytch || busy) return;
    errorMessage = '';
    notice = '';
    if (!firstName.trim()) {
      errorMessage = 'First name is required.';
      return;
    }
    busy = true;
    try {
      localStorage.setItem(pendingFirstNameKey, firstName.trim());
      const response = await stytch.otps.email.loginOrCreate(email.trim(), {
        expiration_minutes: 5,
      });
      methodId = response.method_id;
      notice = 'Check your email for a one-time code.';
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function persistFirstName(userId: string, sessionToken: string | undefined) {
    const saveErrors: string[] = [];

    try {
      localStorage.setItem(localFirstNameKey(userId), firstName.trim());
      localStorage.setItem(pendingSyncFirstNameKey(userId), firstName.trim());
      localStorage.removeItem(pendingFirstNameKey);
      saveCurrentUserProfile({ userId, firstName: firstName.trim() });
    } catch (error) {
      console.error('[user] Could not save first name locally:', error);
      saveErrors.push('this browser');
    }

    try {
      if (!sessionToken) throw new Error('No Stytch session token is available.');
      const response = await fetch('/.netlify/functions/save-profile', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ firstName: firstName.trim() }),
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        console.error('[user] Profile function returned a non-JSON response:', response.status);
        throw new Error(
          `Profile service returned an unexpected response (HTTP ${response.status}).`,
        );
      }
      let result: { error?: string; user_id?: string };
      try {
        result = await response.json();
      } catch {
        throw new Error(`Profile service returned invalid JSON (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(result.error ?? 'Could not save your profile.');
      if (result.user_id !== userId) throw new Error('The saved profile user did not match.');
      try {
        localStorage.removeItem(pendingSyncFirstNameKey(userId));
      } catch (error) {
        console.error('[user] Could not clear the pending profile:', error);
        saveErrors.push('this browser');
      }
    } catch (error) {
      console.error('[user] Could not save first name to Supabase:', error);
      saveErrors.push('Supabase');
    }

    return saveErrors;
  }

  async function verifyCode() {
    if (!stytch || !methodId || busy) return;
    errorMessage = '';
    notice = '';
    busy = true;
    try {
      await stytch.otps.authenticate(code.trim(), methodId, {
        session_duration_minutes: 60,
      });
      session = stytch.session.getSync();
      if (!session) throw new Error('Stytch did not create an authenticated session.');
      const verifiedUserId = session.user_id;
      const tokens = stytch.session.getTokens();
      const saveErrors = await persistFirstName(verifiedUserId, tokens?.session_token);
      profileSaveFailed = saveErrors.length > 0;
      notice =
        saveErrors.length === 0
          ? 'Signed in successfully.'
          : `Signed in, but your first name could not be saved to ${saveErrors.join(' and ')}.`;
      methodId = '';
      code = '';
      if (saveErrors.length > 0) errorMessage = 'Please contact the site administrator for help.';
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function retryProfileSave() {
    if (!stytch || !session || busy) return;
    errorMessage = '';
    notice = '';
    busy = true;
    try {
      const tokens = stytch.session.getTokens();
      const saveErrors = await persistFirstName(session.user_id, tokens?.session_token);
      profileSaveFailed = saveErrors.length > 0;
      if (profileSaveFailed) {
        errorMessage = 'Please contact the site administrator for help.';
        notice = `Your first name could not be saved to ${saveErrors.join(' and ')}.`;
      } else {
        notice = 'First name saved.';
      }
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (!stytch || busy) return;
    errorMessage = '';
    notice = '';
    busy = true;
    try {
      await stytch.session.revoke();
      session = null;
      clearCurrentUserProfile();
      firstName = '';
      email = '';
      methodId = '';
      code = '';
      notice = 'Signed out.';
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Account | Sunny</title>
</svelte:head>

<Layout>
  <header class="account-header">
    <a href="/">← Back to Sunny</a>
    <h1>Account</h1>
  </header>
  <main class="account-main">
    {#if loading}
      <p>Loading account...</p>
    {:else}
      {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}
      {#if notice}<p class="message" role="status">{notice}</p>{/if}
      {#if !isConfigured}
        <p>Account access is unavailable.</p>
      {:else if session}
        <p>You're signed in.</p>
        {#if profileSaveFailed}
          <button type="button" disabled={busy} onclick={retryProfileSave}
            >Retry saving first name</button
          >
        {/if}
        <button class="secondary" type="button" disabled={busy} onclick={signOut}>Sign out</button>
      {:else if !methodId}
        <p>We'll email you a one-time sign-in code. No password is needed.</p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <label
            >First name <input
              bind:value={firstName}
              autocomplete="given-name"
              maxlength="100"
              required
            /></label
          >
          <label
            >Email <input bind:value={email} type="email" autocomplete="email" required /></label
          >
          <button type="submit" disabled={busy}
            >{busy ? 'Sending...' : 'Email me a sign-in code'}</button
          >
        </form>
      {:else}
        <p>Enter the one-time code sent to {email}.</p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          <label
            >One-time code <input
              bind:value={code}
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              required
            /></label
          >
          <button type="submit" disabled={busy || code.length !== 6}
            >{busy ? 'Verifying...' : 'Verify code'}</button
          >
        </form>
        <button class="secondary" type="button" disabled={busy} onclick={sendCode}
          >Resend code</button
        >
        <button
          class="secondary"
          type="button"
          disabled={busy}
          onclick={() => {
            methodId = '';
            code = '';
            notice = '';
            errorMessage = '';
          }}>Use a different email</button
        >
      {/if}
    {/if}
  </main>
</Layout>

<style>
  .account-header a {
    color: #eeb64e;
    font-size: 13px;
  }
  h1 {
    margin: 18px 0;
    color: #f3cf82;
    font-family: 'Playfair Display', serif;
    font-size: 27px;
  }
  .account-main {
    min-height: 0;
    overflow-y: auto;
    padding: 0 2px 16px;
    color: #f3cf82;
    font-size: 14px;
  }
  p {
    line-height: 1.5;
  }
  form {
    display: grid;
    gap: 14px;
    margin: 18px 0;
  }
  label {
    display: grid;
    gap: 6px;
  }
  input {
    width: 100%;
    padding: 10px;
    border: 1px solid #79551f;
    border-radius: 8px;
    background: #100b05;
    color: #fff0bd;
    font: inherit;
  }
  button {
    padding: 10px 12px;
    border: 1px solid #9a6a22;
    border-radius: 8px;
    background: #33200a;
    color: #fff0bd;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>
