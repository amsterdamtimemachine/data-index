/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				'link': '#6D5026',
				'link-hover': '#78481e',
				'atm-sand': '#fcf8f7',
				'atm-sand-darkish': '#f9f2f0',
				'atm-sand-dark': '#f6e8df',
				'atm-sand-darkest': '#af8e74', 
				'atm-sand-border': '#d7c5b8',
				'atm-gold': '#dcb27d', 
				'atm-gold-dark': '#cca36e', 
				'atm-gold-darkest': '#58401a',
				'atm-gold-gray': '#ebe1d6',
				'atm-gold-gray-dark': '#5e5954',
				'atm-red': '#ee5e00',
				'atm-red-light': '#f17562',
				'atm-blue':'#5e92f3',
				'atm-blue-light':'#c2d0fb',
				'status-error': 'ee3f00',
				'status-warning': '#fff',
				'status-success': '#fff',
				'status-info': '#5e92f3',
				'map-cell-value': '#0053fb',
				'map-background': '#f7ece4', //#f9efe9', //'dark sand #efd9ca', //' sand #fbf5f2', // '#bfd9c3' green // light sand ece7e4
				'map-water-fill': '#c5e0fd',
				'map-water-outline': '#c5e0fd',
				'map-transporation-outline': '#f7ece4',
			},
			fontFamily: {
				'sans': ['Satoshi', 'sans-serif'],
			}
		}
	},
	plugins: []
};
