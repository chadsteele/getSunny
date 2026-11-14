<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import Layout from '../../components/Layout.svelte';
  import { consumeAuthRedirectError, supabase } from '../../lib/supabase';
  import '../../styles.css';

  type Profile = { name: string; phone: string; mailing_address: string };
  let session = $state<Session | null>(null);
  let mode = $state<'sign-in' | 'register'>('sign-in');
  let email = $state('');
  let name = $state('');
  let phone = $state('');
  let mailingAddress = $state('');
  let loading = $state(true);
  let busy = $state(false);
  let profileLoadFailed = $state(false);
  let notice = $state('');
  let errorMessage = $state('');
  let sessionVersion = 0;

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

  async function loadProfile(currentSession: Session, version: number) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, phone, mailing_address')
        .eq('id', currentSession.user.id)
        .maybeSingle<Profile>();
      if (version !== sessionVersion) return;
      if (error) throw error;
      profileLoadFailed = false;
      name = data?.name ?? '';
      phone = data?.phone ?? '';
      mailingAddress = data?.mailing_address ?? '';
      if (!data) notice = 'Please complete your profile.';
    } catch (error) {
      if (version !== sessionVersion) return;
      profileLoadFailed = true;
      showError(error);
    }
  }

  async function setSession(next: Session | null) {
    if (session && next && session.user.id === next.user.id) {
      session = next;
      return;
    }
    const version = ++sessionVersion;
    session = next;
    profileLoadFailed = false;
    name = '';
    phone = '';
    mailingAddress = '';
    if (next) await loadProfile(next, version);
    if (version === sessionVersion) loading = false;
  }

  async function retryProfile() {
    if (!session || busy) return;
    errorMessage = '';
    busy = true;
    try {
      await loadProfile(session, sessionVersion);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    const authRedirectError = consumeAuthRedirectError();
    if (authRedirectError) errorMessage = `Sign-in link failed: ${authRedirectError}`;
    if (!supabase) {
      errorMessage = 'Supabase is not configured. Contact the site administrator.';
      loading = false;
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      void Promise.resolve().then(() => setSession(next));
    });
    return () => {
      sessionVersion += 1;
      data.subscription.unsubscribe();
    };
  });

  async function sendLink() {
    if (!supabase || busy) return;
    errorMessage = '';
    notice = '';
    if (mode === 'register' && (!name.trim() || !phone.trim() || !mailingAddress.trim())) {
      errorMessage = 'Name, phone, and mailing address are required.';
      return;
    }
    busy = true;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: mode === 'register',
          emailRedirectTo: `${window.location.origin}/user`,
          ...(mode === 'register'
            ? {
                data: {
                  name: name.trim(),
                  phone: phone.trim(),
                  mailing_address: mailingAddress.trim(),
                },
              }
            : {}),
        },
      });
      if (error) throw error;
      notice = 'Check your email for a sign-in link. Open it on this device to continue.';
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function saveProfile() {
    if (!supabase || !session || busy) return;
    errorMessage = '';
    notice = '';
    if (!name.trim() || !phone.trim() || !mailingAddress.trim()) {
      errorMessage = 'Name, phone, and mailing address are required.';
      return;
    }
    busy = true;
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        name: name.trim(),
        phone: phone.trim(),
        mailing_address: mailingAddress.trim(),
      });
      if (error) throw error;
      notice = 'Profile saved.';
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (!supabase || busy) return;
    errorMessage = '';
    notice = '';
    busy = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      email = '';
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
      {#if !supabase}
        <p>Account access is unavailable.</p>
      {:else if session}
        <p>Signed in as {session.user.email}</p>
        {#if profileLoadFailed}
          <button type="button" disabled={busy} onclick={retryProfile}>Retry loading profile</button
          >
        {:else}
          <form
            onsubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <label
              >Name <input bind:value={name} autocomplete="name" maxlength="200" required /></label
            >
            <label
              >Phone <input
                bind:value={phone}
                type="tel"
                autocomplete="tel"
                maxlength="50"
                required
              /></label
            >
            <label
              >Mailing address <textarea
                bind:value={mailingAddress}
                autocomplete="street-address"
                maxlength="1000"
                required></textarea></label
            >
            <button type="submit" disabled={busy}>Save profile</button>
          </form>
        {/if}
        <button class="secondary" type="button" disabled={busy} onclick={signOut}>Sign out</button>
      {:else}
        <div class="mode-switch">
          <button
            type="button"
            class:active={mode === 'sign-in'}
            aria-pressed={mode === 'sign-in'}
            onclick={() => {
              mode = 'sign-in';
              notice = '';
              errorMessage = '';
            }}>Sign in</button
          >
          <button
            type="button"
            class:active={mode === 'register'}
            aria-pressed={mode === 'register'}
            onclick={() => {
              mode = 'register';
              notice = '';
              errorMessage = '';
            }}>Register</button
          >
        </div>
        <p>We'll email you a secure sign-in link. No password is needed.</p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void sendLink();
          }}
        >
          {#if mode === 'register'}
            <label
              >Name <input bind:value={name} autocomplete="name" maxlength="200" required /></label
            >
          {/if}
          <label
            >Email <input bind:value={email} type="email" autocomplete="email" required /></label
          >
          {#if mode === 'register'}
            <label
              >Phone <input
                bind:value={phone}
                type="tel"
                autocomplete="tel"
                maxlength="50"
                required
              /></label
            >
            <label
              >Mailing address <textarea
                bind:value={mailingAddress}
                autocomplete="street-address"
                maxlength="1000"
                required></textarea></label
            >
          {/if}
          <button type="submit" disabled={busy}
            >{busy ? 'Sending...' : 'Email me a sign-in link'}</button
          >
        </form>
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
  input,
  textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #79551f;
    border-radius: 8px;
    background: #100b05;
    color: #fff0bd;
    font: inherit;
  }
  textarea {
    min-height: 85px;
    resize: vertical;
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
  .mode-switch {
    display: flex;
    gap: 8px;
  }
  .mode-switch button {
    flex: 1;
    background: transparent;
  }
  .mode-switch .active {
    background: #33200a;
    border-color: #eeb64e;
  }
  .secondary {
    background: transparent;
  }
  .message {
    overflow-wrap: anywhere;
  }
  .error {
    color: #ff9a79;
  }
</style>
