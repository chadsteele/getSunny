<script lang="ts">
  export let intensity = 0.18;

  $: scale = 0.06 + intensity * 0.94;
  $: glow = 0.02 + intensity * 0.78;
</script>

<div class="sparkle-stage" style={`--spark-scale: ${scale}; --spark-glow: ${glow}`}>
  <div class="rays rays-wide"></div>
  <div class="rays rays-fine"></div>
  <div class="spark-core">
    <div class="core-halo"></div>
    <div class="core"></div>
  </div>
</div>
