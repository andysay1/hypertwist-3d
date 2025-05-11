/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}', // важная строка: путь до всех компонентов
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
