<!-- A link drawn as the app's button; any other anchor attribute is passed on -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { mergeCss } from '#lib/utils/utils.js';

	type Props = Omit<HTMLAnchorAttributes, 'class' | 'children'> & {
		href: string;
		target?: string;
		rel?: string;
		class?: string;
		active?: boolean;
		children?: Snippet;
	};

	let {
		href,
		target = '_blank',
		rel = 'noopener noreferrer',
		class: className,
		active = false,
		children,
		...rest
	}: Props = $props();

	const baseClasses = $derived(
		active
			? 'h-[32px] px-2 inline-flex justify-center items-center bg-atm-gold rounded border border-atm-gold border-[1px] text-base cursor-default'
			: 'h-[32px] px-2 inline-flex justify-center items-center bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark text-base'
	);
</script>

<a {...rest} class={mergeCss(baseClasses, className)} {href} {target} {rel}>
	<span>
		{@render children?.()}
	</span>
</a>
