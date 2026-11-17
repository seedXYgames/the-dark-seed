import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, sourcemap: false,
    rollupOptions: { output: { manualChunks: (id: string) => id.endsWith('/src/render/assets/patrol-car.json') ? 'patrol-car' : undefined } },
  },
  // il worker della voce neurale carica onnxruntime con import(): serve un worker modulo
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
} as any);
