<script lang="ts">
  let menuOpen = false;

  function deleteChatHistory() {
    if (!confirm('Delete all saved chat history? This cannot be undone.')) return;
    localStorage.removeItem('sunny-chat-thread');
    window.dispatchEvent(new CustomEvent('sunny-chat-cleared'));
    menuOpen = false;
  }

  function restoreChatHistory() {
    window.dispatchEvent(new CustomEvent('sunny-chat-restore'));
    menuOpen = false;
  }
</script>

<header class="topbar">
  <button
    class="menu-button"
    aria-label="Open menu"
    aria-expanded={menuOpen}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span></span><span></span><span></span>
  </button>
  <div class="brand"><span></span></div>
  <div class="step"><span class="step-dot"></span> Step <strong>1</strong></div>

  {#if menuOpen}
    <nav class="menu-popover" aria-label="Session menu">
      <a href="#session">How it works</a>
      <a href="#sound">Choose a sound</a>
      <button type="button" class="menu-action" onclick={restoreChatHistory}>
        Restore chat history
      </button>
      <button type="button" class="delete-chat-button" onclick={deleteChatHistory}>
        Delete chat history
      </button>
    </nav>
  {/if}
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 5;
    padding-block: 4px;
    background: #020202e6;
  }
  .menu-button {
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    padding: 9px 5px;
    cursor: pointer;
    display: grid;
    align-content: center;
    gap: 6px;
  }
  .menu-button span {
    display: block;
    width: 31px;
    height: 3px;
    border-radius: 2px;
    background: #eab44d;
    box-shadow: 0 0 8px #d8922f;
  }
  .brand {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Playfair Display', serif;
    font-size: 25px;
    letter-spacing: 0.03em;
    color: #f3c35c;
  }
  .brand span {
    color: #f8df99;
  }
  .step {
    font-size: 16px;
    letter-spacing: 0.01em;
    color: #f0bf55;
  }
  .step strong {
    font-weight: 500;
  }
  .step-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    background: #e5a839;
    border-radius: 50%;
    margin: 0 0 3px 7px;
  }
  .menu-popover {
    position: absolute;
    top: 76px;
    left: 29px;
    z-index: 4;
    display: grid;
    gap: 13px;
    padding: 17px 20px;
    border: 1px solid #5b3e16;
    background: #0c0905;
    border-radius: 12px;
    box-shadow: 0 15px 40px #000;
  }
  .menu-popover a {
    color: #eeb64e;
    font-size: 13px;
    text-decoration: none;
  }
  .menu-action,
  .delete-chat-button {
    padding: 0;
    border: 0;
    color: #eeb64e;
    background: transparent;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .menu-action:hover,
  .menu-action:focus-visible,
  .delete-chat-button:hover,
  .delete-chat-button:focus-visible,
  .menu-popover a:hover {
    color: #fff0bd;
  }
</style>
