import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-muted": "var(--panel-muted)",
        text: "var(--text)",
        muted: "var(--muted)",
        border: "var(--border)",
        primary: "var(--primary)",
        "primary-dark": "var(--primary-dark)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(36, 50, 80, 0.10), 0 1px 0 rgba(255, 255, 255, 0.72) inset",
        nav: "0 -14px 36px rgba(36, 50, 80, 0.10)",
      },
      borderRadius: {
        card: "24px",
      },
      maxWidth: {
        app: "480px",
      },
    },
  },
  plugins: [],
};

export default config;
