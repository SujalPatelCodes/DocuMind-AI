/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Exact palette from the dashboard design spec.
        page: "#FAFAFA",
        frame: "#F1F2F5",
        ink: "#050505",
        canvas: "#F8F8F8",
        pdfbg: "#F5F6F7",
        light: "#F3F4F6",
        selconv: "#F1F1F1",
        line: "#E5E7EB",
        maintext: "#171717",
        subtext: "#6B7280",
        placeholder: "#9CA3AF",
        accent: "#FFC928",
        status: "#22C55E",
        modaccent: "#A78BFA",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};