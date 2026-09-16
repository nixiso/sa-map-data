import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
  },
  optimizeDeps: {
    // maplibre-gl loads its worker as a sibling file next to its own
    // module URL; Vite's dependency pre-bundling breaks that lookup.
    exclude: ["maplibre-gl"],
  },
});
