<script lang="ts">
	import { mergeCss } from '$utils/utils';

	interface Props {
		href?: string; // For svelte-markdown compatibility (image src)
		src?: string; // Standard img src prop
		title?: string; // Image title
		text?: string; // For svelte-markdown compatibility (alt text)
		alt?: string; // Standard img alt prop
		class?: string;
		loading?: 'lazy' | 'eager';
	}

	let {
		href,
		src,
		title,
		text,
		alt,
		class: className,
		loading = 'lazy'
	}: Props = $props();

	// Use href from svelte-markdown if available, otherwise use src
	const imageSrc = $derived(href ?? src ?? '');
	// Use text from svelte-markdown if available, otherwise use alt
	const imageAlt = $derived(text ?? alt ?? '');

	const baseClasses = 'h-auto rounded-md shadow-[0_0_20px_0_rgba(0,0,0,0.15)]';
	const figureClasses = 'mb-6 flex flex-col items-center';
	const captionClasses = 'text-base text-gray-600 mt-2 text-center italic';
</script>

<figure class={mergeCss(figureClasses, className)}>
	<img
		src={imageSrc}
		alt={imageAlt}
		{title}
		{loading}
		class={baseClasses}
	/>
	{#if imageAlt}
		<figcaption class={captionClasses}>
			{imageAlt}
		</figcaption>
	{/if}
</figure>
