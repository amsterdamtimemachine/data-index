import { Toaster } from 'melt/builders';

export type ToastData = {
	title: string;
	description: string;
	type?: 'success' | 'error' | 'warning' | 'info';
};

// App-wide singleton: any component imports addToast to fire a toast; Toaster.svelte
// renders toaster.toasts. The builder shows/hides the native popover on its own, and
// auto-dismisses each toast after closeDelay (paused while hovered).
export const toaster = new Toaster<ToastData>({ closeDelay: 10000 });
export const addToast = toaster.addToast;
