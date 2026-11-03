import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    svelte(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*',
          dest: 'piper/onnx',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.*',
          dest: 'piper/phonemize',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: [
      '@huggingface/transformers',
      '@localmode/transformers',
      '@realtimex/piper-tts-web',
      'onnxruntime-web',
      'vad-web',
    ],
  },
});
