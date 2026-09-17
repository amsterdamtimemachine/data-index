<script lang="ts">
	import type { Snippet } from 'svelte';
	import { mergeCss } from '$utils/utils';
	import { melt, type AnyMeltElement } from '@melt-ui/svelte';
	import type { PhosphorIcon, PhosphorIconProps } from '@atm/shared/types';

	interface Props {
		onclick?: () => void;
		class?: string;
		disabled?: boolean;
		icon?: PhosphorIcon;
		size?: number;
		weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
		color?: string;
		children?: Snippet;
		'aria-label'?: string;
		meltAction?: any; // Melt UI action - type varies by context
	}

	let {
		onclick,
		class: className,
		disabled = false,
		icon: Icon,
		size = 18,
		weight = 'bold',
		color = 'black',
		children,
		'aria-label': ariaLabel,
		meltAction
	}: Props = $props();

	const iconProps: PhosphorIconProps = $derived({
		size,
		weight,
		color,
		mirrored: false
	});

	const baseClasses =
		'h-[32px] flex justify-center items-center bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark disabled:opacity-50 disabled:cursor-not-allowed text-sm';
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

{#if meltAction}
	<button
		{onclick}
		{disabled}
		class={mergeCss(`${baseClasses} ${shapeClasses}`, className)}
		aria-label={ariaLabel}
		use:melt={meltAction}
	>
		{#if Icon}
			<Icon {...iconProps} />
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</button>
{:else}
	<button
		{onclick}
		{disabled}
		class={mergeCss(`${baseClasses} ${shapeClasses}`, className)}
		aria-label={ariaLabel}
	>
		{#if Icon}
			<Icon {...iconProps} />
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</button>
{/if}
