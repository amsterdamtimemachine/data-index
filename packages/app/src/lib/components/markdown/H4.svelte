<script lang="ts">
	import Heading from '#lib/components/Heading.svelte';
	let { children } = $props();
</script>

<Heading level={4}>{@render children?.()}</Heading>
