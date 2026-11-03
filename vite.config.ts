import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers', '@localmode/transformers', 'onnxruntime-web'],
  },
});
