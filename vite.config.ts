import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the build works at any mount point,
  // including GitHub Pages project sites (https://<user>.github.io/Civgame/).
  base: "./",
});
