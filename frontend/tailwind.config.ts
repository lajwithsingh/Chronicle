import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mosaic: {
          bg: "#0a0a0a",
          accent: "#DFFF00", // Lime green
          card: "#1A1A1A",
          surface: "#262626",
          text: "#FFFFFF",
          muted: "#888888",
          border: "#333333",
        },
        chronicle: {
          bg: "#111111",
          "bg-card": "#1A1A1A",
          amber: "#CCFF00",
          "amber-dark": "#B3E600",
          text: "#FFFFFF",
          muted: "#888888",
          border: "#333333",
        },
      },
      fontFamily: {
        serif: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        mosaic: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.4s ease-out forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
