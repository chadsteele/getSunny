<script lang="ts">
  let menuOpen = false;
</script>

<header class="topbar">
  <button class="menu-button" aria-label="Open menu" aria-expanded={menuOpen} on:click={() => (menuOpen = !menuOpen)}>
    <span></span><span></span><span></span>
  </button>
  <div class="brand"><span></span></div>
  <div class="step"><span class="step-dot"></span> Step <strong>1</strong></div>

{#if menuOpen}
  <nav class="menu-popover" aria-label="Session menu">
    <a href="#session">How it works</a>
    <a href="#sound">Choose a sound</a>
  </nav>
{/if}
</header>