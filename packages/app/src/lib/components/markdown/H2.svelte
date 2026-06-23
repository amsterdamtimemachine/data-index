<script lang="ts">
	import Heading from '$components/Heading.svelte';
	let { children } = $props();
</script>

<Heading level={2}>{@render children?.()}</Heading>
