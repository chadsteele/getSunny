<script lang="ts">
  import Layout from '../components/Layout.svelte';
  import Header from '../components/Header.svelte';
  import VoiceAgent from '../components/VoiceAgent.svelte';
  import '../styles.css';

  let showingLogs = $state(false);
</script>

<svelte:head>
  <link
    rel="icon"
    href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☀️</text></svg>"
  />
</svelte:head>

<Layout>
  <Header {showingLogs} onToggleView={() => (showingLogs = !showingLogs)} />
  <VoiceAgent {showingLogs} />
</Layout>
