<script lang="ts">
	import type { Snippet } from 'svelte';
	import { mergeCss } from '$utils/utils';
	import { translate } from '$utils/translations';
	import type { PhosphorIcon, PhosphorIconProps } from '@atm/shared/types';

	interface Props {
		href: string;
		title?: string;
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

	const newWindow = $derived(target === '_blank');
	// a description, not part of the name: spoken on focus after a pause, not while the
	// content around the link is read through
	const noteId = $props.id();
	const describedBy = $derived.by(() => {
		if (newWindow) {
			return noteId;
		}
		return undefined;
	});

	const iconProps: PhosphorIconProps = $derived({
		size,
		weight,
		color,
		mirrored: false
	});

	const baseClasses =
		'focus-ring inline-flex items-center font-sans text-black hover:text-atm-gold-dark underline';
	const gapClass = $derived.by(() => {
		if (Icon && children) {
			return 'gap-1';
		}
		return '';
	});
</script>

<a {href} {title} {target} {rel} aria-describedby={describedBy} class={mergeCss(`${baseClasses} ${gapClass}`, className)}>
	{#if children}
		{@render children()}
	{/if}
	{#if Icon}
		<Icon {...iconProps} />
	{/if}
	{#if newWindow}
		<span id={noteId} hidden>{translate('opensInNewWindow')}</span>
	{/if}
</a>
