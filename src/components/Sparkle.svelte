<script lang="ts">
  interface Props {
    intensity?: number;
  }

  let { intensity = 0.18 }: Props = $props();
  let scale = $derived(0.06 + intensity * 0.94);
  let glow = $derived(0.02 + intensity * 0.78);
</script>

<div class="sparkle-stage" style={`--spark-scale: ${scale}; --spark-glow: ${glow}`}>
  <div class="rays rays-wide"></div>
  <div class="rays rays-fine"></div>
  <div class="spark-core">
    <div class="core-halo"></div>
    <div class="core"></div>
  </div>
</div>

<style>
  .sparkle-stage {
    --size: min(78vw, 350px);
    width: var(--size);
    max-width: 100%;
    aspect-ratio: 1;
    position: relative;
    justify-self: center;
    margin-inline: auto;
    transform: scale(var(--spark-scale));
    transition: transform 160ms ease-out;
    animation: breathe 1.65s ease-in-out infinite;
  }

  .rays,
  .spark-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }

  .rays::before,
  .rays::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(
      from 2deg,
      transparent 0deg 8deg,
      #f2b83f 8.5deg 9deg,
      transparent 9.5deg 17deg
    );
    mask-image: radial-gradient(circle, black 0 18%, transparent 62%);
    opacity: 0.2;
  }

  .rays-fine {
    transform: rotate(12deg) scale(0.8);
    opacity: 0.75;
    filter: blur(0.4px);
  }

  .rays-fine::before {
    background: repeating-conic-gradient(
      from 0deg,
      transparent 0deg 3deg,
      #ffc84e 3.2deg 3.55deg,
      transparent 4deg 9deg
    );
    mask-image: radial-gradient(circle, black 0 16%, transparent 69%);
    opacity: 0.25;
  }

  .rays-wide::after {
    transform: rotate(45deg);
    mask-image: radial-gradient(ellipse, black 0 9%, transparent 54%);
    opacity: 0.42;
  }

  .spark-core {
    display: grid;
    place-items: center;
  }

  .core-halo {
    position: absolute;
    width: 52%;
    aspect-ratio: 1;
    background: #e99e18;
    border-radius: 50%;
    filter: blur(25px);
    opacity: var(--spark-glow);
  }

  .core {
    width: 18%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff9d8;
    box-shadow:
      0 0 12px 6px #fff3a3,
      0 0 35px 20px #ffc844,
      0 0 75px 30px #dc8e16;
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(calc(var(--spark-scale) * 0.96));
    }

    50% {
      transform: scale(calc(var(--spark-scale) * 1.07));
    }
  }
</style>
