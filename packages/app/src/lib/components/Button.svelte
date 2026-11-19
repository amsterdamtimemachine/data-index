<!-- The app's button: an optional Phosphor icon, an optional label, and any button attribute passed on -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { mergeCss } from '#lib/utils/utils.js';
	import type { PhosphorIcon, PhosphorIconProps } from '@atm/shared/types';

	type Props = Omit<HTMLButtonAttributes, 'class' | 'color' | 'children'> & {
		class?: string;
		icon?: PhosphorIcon;
		size?: number;
		weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
		// the icon's colour
		color?: string;
		children?: Snippet;
	};

	// the rest carries any button attribute through; the app is not compiled to custom elements
	// svelte-ignore custom_element_props_identifier
	let { class: className, icon: Icon, size = 18, weight = 'bold', color = 'black', children, ...rest }: Props = $props();

	const iconProps: PhosphorIconProps = $derived({
		size,
		weight,
		color,
		mirrored: false
	});

	// every button shows the browser's own tooltip after a hover: its title, else its
	// label, else its visible text
	const title = $derived.by(() => {
		if (rest.title) {
			return rest.title;
		}
		return rest['aria-label'] ?? undefined;
	});

	// a button with neither a title nor a label takes its visible text, read when it mounts
	function titleFromText(node: HTMLButtonElement) {
		if (!node.title) {
			node.title = node.textContent?.trim() ?? '';
		}
	}

	const baseClasses =
		'focus-ring h-[32px] flex justify-center items-center bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark disabled:opacity-50 disabled:cursor-not-allowed text-sm';
	// icon-only and label-only stay a 32px square; a glyph with a label sizes to its text
	const shapeClasses = $derived.by(() => {
		if (Icon && children) {
			return 'px-2 gap-1';
		}
		if (Icon) {
			return 'w-[32px] p-1';
		}
		return 'w-[32px] px-3 py-2';
	});
</script>

<button {...rest} {title} use:titleFromText class={mergeCss(`${baseClasses} ${shapeClasses}`, className)}>
	{#if Icon}
		<Icon {...iconProps} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>
