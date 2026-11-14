<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  interface Props {
    showingLogs: boolean;
    onToggleView: () => void;
    onReport: () => void;
  }

  let { showingLogs, onToggleView, onReport }: Props = $props();
  let menuOpen = $state(false);
  let deleteConfirmOpen = $state(false);
  let menuButton: HTMLButtonElement;

  function closeMenu() {
    menuOpen = false;
    menuButton?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && menuOpen) closeMenu();
  }

  function drawerTransition(node: Element) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return fly(node, {
      x: -node.getBoundingClientRect().width,
      opacity: 1,
      duration: reducedMotion ? 0 : 260,
      easing: cubicOut,
    });
  }

  function backdropTransition(node: Element) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return fade(node, { duration: reducedMotion ? 0 : 260 });
  }

  function requestDeleteChatHistory() {
    deleteConfirmOpen = true;
    menuOpen = false;
  }

  function deleteChatHistory() {
    localStorage.removeItem('sunny-chat-thread');
    window.dispatchEvent(new CustomEvent('sunny-chat-cleared'));
    deleteConfirmOpen = false;
  }

  function restoreChatHistory() {
    window.dispatchEvent(new CustomEvent('sunny-chat-restore'));
    menuOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<header class="topbar">
  <button
    bind:this={menuButton}
    type="button"
    class="menu-button"
    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={menuOpen}
    aria-controls="session-menu"
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span></span><span></span><span></span>
  </button>
  <div class="brand"><span></span></div>
  <div class="step">Step 1: Dreaming</div>
</header>

<div class="drawer-layer" class:open={menuOpen} inert={!menuOpen}>
  {#if menuOpen}
    <button
      class="drawer-backdrop"
      type="button"
      aria-label="Close menu"
      onclick={closeMenu}
      transition:backdropTransition
    ></button>
    <nav
      id="session-menu"
      class="menu-drawer"
      aria-label="Session menu"
      transition:drawerTransition
    >
      <a href="/user">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
        Sign in
      </a>
      <a href="#settings" onclick={() => (menuOpen = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m9.5 3 .6 2a7.5 7.5 0 0 1 3.8 0l.6-2 2.2.9-.6 2a7.5 7.5 0 0 1 2.7 2.7l2-.6.9 2.2-2 .6a7.5 7.5 0 0 1 0 3.8l2 .6-.9 2.2-2-.6a7.5 7.5 0 0 1-2.7 2.7l.6 2-2.2.9-.6-2a7.5 7.5 0 0 1-3.8 0l-.6 2-2.2-.9.6-2a7.5 7.5 0 0 1-2.7-2.7l-2 .6-.9-2.2 2-.6a7.5 7.5 0 0 1 0-3.8l-2-.6.9-2.2 2 .6a7.5 7.5 0 0 1 2.7-2.7l-.6-2L9.5 3Z"
          />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        Settings
      </a>
      <button
        type="button"
        class="menu-action"
        onclick={() => {
          onToggleView();
          closeMenu();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v14H4zM7 9h10M7 12h10M7 15h7" />
        </svg>
        {showingLogs ? 'Show chat' : 'Show logger'}
      </button>
      <button
        type="button"
        class="menu-action"
        onclick={() => {
          onReport();
          closeMenu();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8" />
        </svg>
        Report
      </button>
      <button type="button" class="menu-action" onclick={restoreChatHistory}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z"
          />
          <path d="M8 9h8M8 12h5" />
        </svg>
        Restore chat history
      </button>
      <button type="button" class="delete-chat-button" onclick={requestDeleteChatHistory}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14M10 4h4l1 3H9l1-3ZM8 10v7m4-7v7m4-7v7M6 7l1 14h10l1-14" />
        </svg>
        Delete chat history
      </button>
    </nav>
  {/if}
</div>

{#if deleteConfirmOpen}
  <div class="modal-backdrop" role="presentation">
    <div
      class="confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-chat-title"
      aria-describedby="delete-chat-description"
    >
      <h2 id="delete-chat-title">Delete chat history?</h2>
      <p id="delete-chat-description">
        All saved conversation history will be permanently deleted. This cannot be undone.
      </p>
      <div class="modal-actions">
        <button type="button" class="cancel-button" onclick={() => (deleteConfirmOpen = false)}>
          Cancel
        </button>
        <button type="button" class="confirm-delete-button" onclick={deleteChatHistory}>
          Delete history
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  button,
  .menu-drawer a {
    -webkit-tap-highlight-color: transparent;
  }
  .menu-drawer a {
    user-select: none;
    -webkit-user-select: none;
  }
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
    transition:
      transform 260ms cubic-bezier(0.215, 0.61, 0.355, 1),
      opacity 260ms ease;
  }
  .menu-button[aria-expanded='true'] span:first-child {
    transform: translateY(9px) rotate(45deg);
  }
  .menu-button[aria-expanded='true'] span:nth-child(2) {
    opacity: 0;
  }
  .menu-button[aria-expanded='true'] span:last-child {
    transform: translateY(-9px) rotate(-45deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .menu-button span {
      transition: none;
    }
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
  .drawer-layer {
    grid-row: 2;
    grid-column: 1;
    position: relative;
    z-index: 10;
    margin: 0 calc(-1 * var(--frame-gutter)) calc(-1 * var(--frame-bottom));
    pointer-events: none;
  }
  .drawer-layer.open {
    pointer-events: auto;
  }
  .drawer-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: #0009;
    cursor: pointer;
  }
  .menu-drawer {
    position: relative;
    width: min(280px, 85%);
    height: 100%;
    display: grid;
    align-content: start;
    gap: 22px;
    overflow-y: auto;
    padding: 25px 24px;
    border-right: 1px solid #5b3e16;
    background: #0c0905;
    box-shadow: 12px 0 30px #0008;
  }
  .menu-drawer a {
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
  .menu-drawer svg {
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
  .menu-drawer a:hover,
  .menu-drawer a:focus-visible {
    color: #fff0bd;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #000b;
  }
  .confirm-modal {
    width: min(100%, 340px);
    padding: 22px;
    border: 1px solid #79551f;
    border-radius: 14px;
    background: #100b05;
    box-shadow: 0 18px 50px #000;
  }
  .confirm-modal h2 {
    margin: 0;
    color: #fff0bd;
    font-size: 19px;
    font-weight: 500;
  }
  .confirm-modal p {
    margin: 12px 0 20px;
    color: #c29b55;
    font-size: 13px;
    line-height: 1.5;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .modal-actions button {
    padding: 9px 13px;
    border: 1px solid #79551f;
    border-radius: 7px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .cancel-button {
    color: #eeb64e;
    background: transparent;
  }
  .confirm-delete-button {
    color: #fff0bd;
    background: #7c3022;
  }
  .modal-actions button:hover,
  .modal-actions button:focus-visible {
    border-color: #efb64d;
    box-shadow: 0 0 10px #eeb64e66;
  }
</style>
