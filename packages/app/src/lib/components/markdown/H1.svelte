<script lang="ts">
	import Heading from '$components/Heading.svelte';
	let { children } = $props();
</script>

<Heading level={1}>{@render children?.()}</Heading>
