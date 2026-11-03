import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    sveltekit(),
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
    ],
  },
});
