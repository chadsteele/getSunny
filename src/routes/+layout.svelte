<script lang="ts">
  import { onMount } from 'svelte';
  import { redirectToLoginIfNeeded } from '../lib/auth-guard';

  let authError = $state('');

  onMount(() => {
    try {
      redirectToLoginIfNeeded();
    } catch (error) {
      console.error('[Sunny] Authentication setup failed:', error);
      authError = error instanceof Error ? error.message : 'Authentication setup failed.';
    }
  });
</script>

{#if authError}
  <p role="alert">{authError}</p>
{:else}
  <slot />
{/if}
