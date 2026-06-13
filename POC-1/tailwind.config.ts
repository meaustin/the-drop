import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette carried forward from demo.html (the Phase 0 pitch demo)
        ink: "#0a0a0f",
        panel: "#14141c",
        panel2: "#1c1c28",
        edge: "#2a2a3a",
        muted: "#8b8b9e",
        drop: {
          DEFAULT: "#ff3d71", // the signature "drop" accent
          glow: "#ff6b94",
        },
        gold: "#ffc24b",
        good: "#34d399",
        bad: "#f87171",
        accent: "#7c5cff",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "drop-in": {
          "0%": { transform: "translateY(-16px) scale(0.96)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.25)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        "pop": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "drop-in": "drop-in 0.4s cubic-bezier(0.16,1,0.3,1)",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        "pop": "pop 0.35s cubic-bezier(0.16,1,0.3,1)",
        "shimmer": "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
