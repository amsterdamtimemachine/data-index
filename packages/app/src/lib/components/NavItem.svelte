<script lang="ts">
	import ButtonLink from './ButtonLink.svelte';
	import { page } from '$app/state';
	import { withLanguage } from '#lib/utils/translations.js';

	interface Props {
		href: string;
		label: string;
		target?: string;
		rel?: string;
	}

	let { href, label, target = '', rel = '' }: Props = $props();

	// Check if this nav item is active based on current route
	const isActive = $derived(
		page.url.pathname === href || (href === '/' && page.url.pathname === '/')
	);
</script>

<ButtonLink href={withLanguage(href)} {target} {rel} active={isActive}>
	{label}
</ButtonLink>
