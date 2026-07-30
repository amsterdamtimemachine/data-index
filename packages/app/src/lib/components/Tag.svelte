<script lang="ts">
	import { mergeCss } from '$utils/utils';

	interface Props {
		class?: string;
		variant?: 'default' | 'selected' | 'outline' | 'selected-outline' | 'link';
		disabled?: boolean;
		interactive?: boolean;
		children: import('svelte').Snippet;
	}

	let { class: className, variant = 'default', disabled = false, interactive = false, children }: Props = $props();

	const baseClasses = 'text-base px-1 py-0.5 rounded transition-colors select-none';

	const variantClasses = $derived.by(() => {
		let classes = '';
		
		if (disabled) {
			classes = 'bg-atm-gold-gray text-gray-800';
		} else if (variant === 'selected') {
			classes = 'bg-atm-blue-light text-black';
			if (interactive) classes += ' hover:bg-atm-blue';
		} else if (variant === 'outline') {
			classes = 'border border-atm-gold-gray-dark text-black bg-transparent';
			if (interactive) classes += ' hover:bg-atm-gold/50';
		} else if (variant === 'selected-outline') {
			classes = 'border border-atm-blue text-black bg-transparent';
			if (interactive) classes += ' hover:bg-atm-blue/50';
		} else if (variant === 'link') {
			// Gold outline signals the tag links to its source record.
			classes = 'border border-atm-gold text-black bg-transparent';
			if (interactive) classes += ' hover:bg-atm-gold/50';
		} else {
			classes = 'bg-atm-gold-gray text-black';
			if (interactive) classes += ' hover:bg-atm-gold';
		}
		
		return classes;
	});
</script>

<span class={mergeCss(`${baseClasses} ${variantClasses}`, className)}>
	{@render children()}
</span>
