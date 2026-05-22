import { defineConfig } from "vite";

// Vite's default 500 KB chunk-size warning fires on the mammoth lazy chunk
// (~502 KB minified / ~131 KB gzipped — bluebird, @xmldom, jszip, etc.) even
// though the only thing on the critical path is the ~186 KB entry. Bumping
// the limit silences the warning so the build output is honest about what
// matters; if a future change makes the *entry* chunk grow past this limit,
// the warning will fire again and that IS a real regression worth fixing.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
  },
});
