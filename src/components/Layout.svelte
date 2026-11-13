<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="phone-frame">
  <div class="ambient ambient-left"></div>
  <div class="ambient ambient-right"></div>
  <div class="phone-content">
    {@render children()}
  </div>
</div>

<style>
  .phone-frame {
    width: 100%;
    height: 100svh;
    min-height: 100svh;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
    background: radial-gradient(circle at 50% 46%, #110b02 0, #050403 26%, #020202 58%);
  }
  .phone-content {
    --frame-gutter: 30px;
    --frame-bottom: 32px;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 28px var(--frame-gutter) var(--frame-bottom);
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .ambient {
    position: absolute;
    border: 1px solid #4d3418;
    opacity: 0.38;
    border-radius: 50%;
    pointer-events: none;
  }
  .ambient-left {
    width: 220px;
    height: 220px;
    left: -175px;
    top: 15%;
  }
  .ambient-right {
    width: 300px;
    height: 300px;
    right: -265px;
    bottom: 4%;
  }
  @media (min-width: 600px) {
    .phone-frame {
      width: min(393px, calc(100vw - 40px));
      height: min(852px, calc(100svh - 40px));
      min-height: 0;
      border: 1px solid #4b3b24;
      border-radius: 54px;
      box-shadow:
        0 0 0 4px #0e0b07,
        0 0 0 5px #5b4629,
        0 18px 80px #000;
    }
    .phone-content {
      --frame-gutter: 46px;
      --frame-bottom: 42px;
      min-height: 100%;
      padding-top: 34px;
    }
  }
</style>
