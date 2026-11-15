/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        emerald: "#0d312b",
        gold: "#c5a36d",
        ivory: "#f5f2eb",
      },
    },
  },
  plugins: [],
};
