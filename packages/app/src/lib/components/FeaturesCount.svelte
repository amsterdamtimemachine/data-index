<!--
	A count line. The component owns the number: the total, or the shown range of a
	page when page props are given. The parent words the sentence around it through
	the children snippet, which receives the number as text.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		count: number;
		currentPage?: number;
		perPage?: number;
		class?: string;
		children: Snippet<[shown: string]>;
	}

	let { count, currentPage, perPage, class: className, children }: Props = $props();

	const shown = $derived.by(() => {
		if (currentPage === undefined || perPage === undefined || count <= perPage) {
			return String(count);
		}
		const start = (currentPage - 1) * perPage + 1;
		const end = Math.min(currentPage * perPage, count);
		return `${start}-${end} / ${count}`;
	});
</script>

<p class="text-base text-gray-700 {className || ''}">
	{@render children(shown)}
</p>
