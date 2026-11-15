<script lang="ts">
  import { onMount } from 'svelte';
  import Layout from '../components/Layout.svelte';
  import Header from '../components/Header.svelte';
  import VoiceAgent from '../components/VoiceAgent.svelte';
  import { currentSession } from '../lib/session-manager';
  import { getInitialUid } from '../lib/initial-uid';
  import type { BabyStep } from '../lib/sessions/types';
  import '../styles.css';

  let showingLogs = $state(false);
  let session = $state<BabyStep | null>(null);
  let loadError = $state('');
  let voiceAgent = $state<VoiceAgent>();

  onMount(() => {
    try {
      getInitialUid();
      session = currentSession();
    } catch (error) {
      console.error('[Sunny] Unable to load the current session:', error);
      loadError = 'Unable to load your session from browser storage.';
    }
  });
</script>

<Layout>
  {#if session}
    <Header
      {session}
      {showingLogs}
      onToggleView={() => (showingLogs = !showingLogs)}
      onReport={() => {
        showingLogs = true;
        void voiceAgent?.generateReport();
      }}
    />
    {#key session.path}
      <VoiceAgent bind:this={voiceAgent} {showingLogs} {session} />
    {/key}
  {:else if loadError}
    <p role="alert">{loadError}</p>
  {/if}
</Layout>
