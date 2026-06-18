import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          // near-black greens for the credit-terminal backdrop
          950: "#06090a",
          900: "#0a0f10",
          850: "#0d1314",
          800: "#10181a",
          700: "#16211f",
          600: "#1d2b28",
        },
        line: "rgba(120, 160, 150, 0.12)",
        lime: {
          // signature acid accent — "verified / TRUE"
          DEFAULT: "#b6ff3a",
          soft: "#d6ff8a",
          dim: "#7ba81f",
        },
        teal: {
          DEFAULT: "#35e0c0",
          dim: "#1f8f7c",
        },
        amber: {
          // "tamper / rejected / first-loss"
          DEFAULT: "#ff8a3d",
          soft: "#ffb784",
        },
        rose: {
          DEFAULT: "#ff5d6c",
        },
        chalk: {
          DEFAULT: "#e8efe9",
          dim: "#9fb1a8",
          faint: "#6a7c74",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(182,255,58,0.25), 0 0 40px -8px rgba(182,255,58,0.35)",
        "glow-amber":
          "0 0 0 1px rgba(255,138,61,0.3), 0 0 40px -8px rgba(255,138,61,0.4)",
        panel:
          "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 60px -30px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(182,255,58,0.5)" },
          "70%": { boxShadow: "0 0 0 12px rgba(182,255,58,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(182,255,58,0)" },
        },
        "ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "shimmer": {
          "100%": { transform: "translateX(100%)" },
        },
        "grow-x": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        scan: "scan 2.4s linear infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        ticker: "ticker 40s linear infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
