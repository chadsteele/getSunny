<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    muted: boolean;
    label: string;
    onclick: () => void | Promise<void>;
    children: Snippet;
  }

  let { muted, label, onclick, children }: Props = $props();
</script>

<button
  class:muted
  class="mute-button"
  type="button"
  aria-label={label}
  aria-pressed={muted}
  {onclick}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {@render children()}
  </svg>
</button>

<style>
  .mute-button {
    width: 56.25px;
    height: 56.25px;
    flex: 0 0 56.25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #5b3e16;
    border-radius: 50%;
    color: #eeb64e;
    background: #090704;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    box-shadow:
      inset 0 0 10px #6f4512,
      0 0 12px #6b3f12;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }
  .mute-button:hover,
  .mute-button:focus-visible {
    border-color: #e8ad3d;
    color: #fff0bd;
    transform: scale(1.05);
    box-shadow:
      inset 0 0 15px #9f6519,
      0 0 18px #9a5c14;
  }
  .mute-button.muted {
    border-color: #8e3e2d;
    color: #ff9a79;
  }
  svg {
    width: 28.5px;
    height: 28.5px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
  svg :global(.slash) {
    stroke-width: 2.2;
  }
</style>
