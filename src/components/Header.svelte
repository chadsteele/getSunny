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
  <div class="step">Step 1: Dreaming</div>

  {#if menuOpen}
    <nav class="menu-popover" aria-label="Session menu">
      <a href="https://mastermoney.ai">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
        Sign in
      </a>
      <a href="#settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m9.5 3 .6 2a7.5 7.5 0 0 1 3.8 0l.6-2 2.2.9-.6 2a7.5 7.5 0 0 1 2.7 2.7l2-.6.9 2.2-2 .6a7.5 7.5 0 0 1 0 3.8l2 .6-.9 2.2-2-.6a7.5 7.5 0 0 1-2.7 2.7l.6 2-2.2.9-.6-2a7.5 7.5 0 0 1-3.8 0l-.6 2-2.2-.9.6-2a7.5 7.5 0 0 1-2.7-2.7l-2 .6-.9-2.2 2-.6a7.5 7.5 0 0 1 0-3.8l-2-.6.9-2.2 2 .6a7.5 7.5 0 0 1 2.7-2.7l-.6-2L9.5 3Z"
          />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        Settings
      </a>
      <button type="button" class="menu-action" onclick={restoreChatHistory}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z"
          />
          <path d="M8 9h8M8 12h5" />
        </svg>
        Restore chat history
      </button>
      <button type="button" class="delete-chat-button" onclick={deleteChatHistory}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14M10 4h4l1 3H9l1-3ZM8 10v7m4-7v7m4-7v7M6 7l1 14h10l1-14" />
        </svg>
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
    display: flex;
    align-items: center;
    gap: 8px;
    color: #eeb64e;
    font-size: 13px;
    text-decoration: none;
  }
  .menu-action,
  .delete-chat-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    color: #eeb64e;
    background: transparent;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .menu-popover svg {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
  }
  .menu-action:hover,
  .menu-action:focus-visible,
  .delete-chat-button:hover,
  .delete-chat-button:focus-visible,
  .menu-popover a:hover {
    color: #fff0bd;
  }
</style>
