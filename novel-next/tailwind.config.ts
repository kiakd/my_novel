import type { Config } from 'tailwindcss';

// พอร์ตตรงจาก design (Novel Studio.html → tailwind.config)
// แก้สี/ฟอนต์/เงา ที่นี่ที่เดียว มีผลทั้งแอป
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FBF6EC',
        canvas: '#F4ECDE',
        ink: '#4A4138',
        muted: '#988C7C',
        line: '#ECE2D1',
        grape: '#7C6FE8',
        coral: '#FB8C6E',
        mint: '#33BD8E',
        sun: '#F2B23E',
        sky: '#5FA8EE',
        bubble: '#F07FB0',
        lilac: '#A98AEE',
        slate: '#8A93A6',
      },
      fontFamily: {
        display: ['var(--font-fredoka)', 'Fredoka', 'sans-serif'],
        sans: ['var(--font-nunito)', 'Nunito', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '1.75rem',
        '5xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 2px 0 0 rgba(124,100,60,.04), 0 10px 22px -14px rgba(124,100,60,.45)',
        pop: '0 12px 34px -12px rgba(124,100,60,.5)',
      },
      keyframes: {
        pop: { from: { opacity: '0', transform: 'scale(.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        rise: { from: { transform: 'translateY(10px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        pop: 'pop .22s cubic-bezier(.34,1.56,.64,1)',
        fadein: 'fadein .18s ease',
        floaty: 'floaty 4s ease-in-out infinite',
        rise: 'rise .3s ease both',
        spin: 'spin .7s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
