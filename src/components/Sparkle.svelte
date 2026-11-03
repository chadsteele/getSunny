<script lang="ts">
  export let intensity = 0.18;
  export let isPlaying = false;

  $: scale = 0.86 + intensity * 0.34;
  $: glow = 0.52 + intensity * 0.48;
</script>

<div class:active={isPlaying} class="sparkle-stage" style={`--spark-scale: ${scale}; --spark-glow: ${glow}`}>
  <div class="rays rays-wide"></div>
  <div class="rays rays-fine"></div>
  <div class="spark-core">
    <div class="core-halo"></div>
    <div class="core"></div>
  </div>
</div>
