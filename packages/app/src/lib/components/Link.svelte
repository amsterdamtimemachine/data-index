<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import { mergeCss } from '$utils/utils';

	interface PhosphorIconProps {
		color?: string;
		size?: number | string;
		weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
		mirrored?: boolean;
	}

	type PhosphorIcon = Component<PhosphorIconProps>;

	interface Props {
		href: string;
		title?: string; // For svelte-markdown compatibility
		target?: string;
		rel?: string;
		class?: string;
		icon?: PhosphorIcon;
		size?: number;
		weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
		color?: string;
		children?: Snippet;
	}

	let {
		href,
		title,
		target,
		rel,
		class: className,
		icon: Icon,
		size = 16,
		weight = 'regular',
		color = 'currentColor',
		children
	}: Props = $props();

	const iconProps: PhosphorIconProps = $derived({
		size,
		weight,
		color,
		mirrored: false
	});

	const baseClasses =
		'inline-flex items-center font-sans text-black hover:text-atm-gold-dark underline';
	const gapClass = $derived(Icon && children ? 'gap-1' : '');
</script>

<a {href} {title} {target} {rel} class={mergeCss(`${baseClasses} ${gapClass}`, className)}>
	{#if children}
		{@render children()}
	{/if}
	{#if Icon}
		<Icon {...iconProps} />
	{/if}
</a>
