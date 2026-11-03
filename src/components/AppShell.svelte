<script lang="ts">
  export let children: import('svelte').Snippet;
</script>

<div class="phone-frame">
  <div class="ambient ambient-left"></div>
  <div class="ambient ambient-right"></div>
  <div class="phone-content">
    {@render children()}
  </div>
</div>
