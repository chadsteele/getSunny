<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import Layout from '../../components/Layout.svelte';
  import outline from '../../lib/sessions/outline';
  import {
    availableSessionPaths,
    completedSessionEnds,
    currentSession,
    groupSessions,
    hasSessionHistory,
    selectSessionForChat,
  } from '../../lib/session-manager';
  import type { BabyStep } from '../../lib/sessions/types';
  import '../../styles.css';

  const groups = groupSessions(outline);
  let started = $state<string[]>([]);
  let available = $state<string[]>([]);
  let selected = $state<BabyStep | null>(null);
  let errorMessage = $state('');
  let storageError = $state(false);
  let loading = $state(true);
  let continueButton = $state<HTMLButtonElement>();

  function isEnabled(session: BabyStep) {
    return available.includes(session.path);
  }

  function refreshSessions() {
    const now = new Date();
    const startedPaths = outline.filter(hasSessionHistory).map((session) => session.path);
    const paths = availableSessionPaths(
      outline,
      startedPaths,
      currentSession().path,
      completedSessionEnds(now),
      now,
      window.location.hostname,
    );
    started = startedPaths;
    available = paths;
    storageError = false;
  }

  function updateSessions() {
    try {
      refreshSessions();
    } catch (error) {
      console.error('[Sessions] Unable to read saved sessions:', error);
      storageError = true;
      errorMessage = 'Unable to read session progress from browser storage.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    updateSessions();
    const timer = setInterval(updateSessions, 60_000);
    window.addEventListener('storage', updateSessions);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', updateSessions);
    };
  });

  async function openSession(session: BabyStep, restart: boolean) {
    try {
      refreshSessions();
      if (!isEnabled(session)) throw new Error('This session is not available yet.');
      selectSessionForChat(session, restart);
      await goto('/');
    } catch (error) {
      console.error('[Sessions] Unable to open session:', error);
      errorMessage = error instanceof Error ? error.message : 'Unable to open the session.';
    }
  }

  async function chooseSession(session: BabyStep) {
    errorMessage = '';
    if (started.includes(session.path)) {
      selected = session;
      await tick();
      continueButton?.focus();
    } else void openSession(session, false);
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') selected = null;
  }}
/>

<svelte:head>
  <title>Sessions | Sunny</title>
</svelte:head>

<Layout>
  <header class="sessions-header">
    <a href="/">← Back to Sunny</a>
    <h1>Sessions</h1>
  </header>
  <main class="sessions-main">
    <p>Choose an available session. Previously started sessions can be continued or restarted.</p>
    <p>
      After rating a completed session, use Report in the menu to save it. The next session unlocks
      18 hours after the session ends.
    </p>
    {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
    {#if loading}
      <p>Loading sessions...</p>
    {:else}
      <ul class="outline">
        {#each groups as step (step.name)}
          <li>
            <h2>{step.name}</h2>
            <ul>
              {#each step.phases as phase (phase.name)}
                <li>
                  <h3>{phase.name}</h3>
                  <ul>
                    {#each phase.sessions as session (session.path)}
                      <li>
                        <button
                          class="session-button"
                          disabled={storageError || !isEnabled(session)}
                          onclick={() => void chooseSession(session)}
                        >
                          {session.name}
                          {#if started.includes(session.path)}<span>Started</span>{/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
  {#if selected}
    <div class="modal-backdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="session-choice-title" class="modal">
        <h2 id="session-choice-title">{selected.name}</h2>
        <p>
          Continue your saved chat or start over? Starting over marks the old messages as deleted.
        </p>
        <div class="actions">
          <button
            bind:this={continueButton}
            onclick={() => selected && void openSession(selected, false)}>Continue</button
          >
          <button onclick={() => selected && void openSession(selected, true)}>Start over</button>
          <button onclick={() => (selected = null)}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</Layout>

<style>
  .sessions-header a {
    color: #eeb64e;
    font-size: 13px;
  }
  h1 {
    margin: 18px 0;
    color: #f3cf82;
    font-family: 'Playfair Display', serif;
    font-size: 27px;
  }
  .sessions-main {
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
    color: #f3cf82;
    font-size: 14px;
  }
  p {
    line-height: 1.5;
  }
  ul {
    list-style: none;
    padding-left: 16px;
    margin: 0;
  }
  .outline {
    padding: 0;
  }
  h2 {
    font-size: 18px;
    margin: 20px 0 8px;
  }
  h3 {
    font-size: 15px;
    margin: 12px 0 6px;
  }
  button {
    border: 1px solid #9a6a22;
    border-radius: 8px;
    background: #33200a;
    color: #fff0bd;
    cursor: pointer;
    padding: 10px 12px;
  }
  .session-button {
    display: flex;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    margin: 4px 0;
  }
  .session-button span {
    color: #eeb64e;
    font-size: 12px;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: transparent;
  }
  .error {
    color: #ff9a87;
  }
  .modal-backdrop {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #000c;
  }
  .modal {
    width: 100%;
    max-width: 340px;
    padding: 20px;
    border: 1px solid #79551f;
    border-radius: 12px;
    background: #100b05;
    color: #f3cf82;
  }
  .actions {
    display: grid;
    gap: 8px;
  }
</style>
