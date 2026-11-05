<!--
	A text link: underlined, in the link's colours. To a URL it is an anchor; with an
	onclick and no URL it is a button that reads the same, for a light action in text
	where a boxed button would weigh too much.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MouseEventHandler } from 'svelte/elements';
	import { mergeCss } from '#lib/utils/utils.js';
	import { translate } from '#lib/utils/translations.js';
	import type { PhosphorIcon, PhosphorIconProps } from '@atm/shared/types';

	interface Props {
		href?: string;
		onclick?: MouseEventHandler<HTMLButtonElement>;
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
		onclick,
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
		'focus-ring inline-flex items-center font-sans text-black hover:text-atm-gold-darkest underline';
	const gapClass = $derived.by(() => {
		if (Icon && children) {
			return 'gap-1';
		}
		return '';
	});
</script>

{#snippet content()}
	{#if children}
		{@render children()}
	{/if}
	{#if Icon}
		<Icon {...iconProps} />
	{/if}
{/snippet}

{#if href}
	<a {href} {title} {target} {rel} aria-describedby={describedBy} class={mergeCss(`${baseClasses} ${gapClass}`, className)}>
		{@render content()}
		{#if newWindow}
			<span id={noteId} hidden>{translate('opensInNewWindow')}</span>
		{/if}
	</a>
{:else}
	<button type="button" {onclick} {title} class={mergeCss(`${baseClasses} ${gapClass} cursor-pointer`, className)}>{@render content()}</button>
{/if}
