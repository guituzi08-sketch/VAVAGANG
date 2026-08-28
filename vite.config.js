import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === "production" ? "/VAVAGANG/" : "/",
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase/")) return "firebase";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          return undefined;
        },
      },
    },
  },
});