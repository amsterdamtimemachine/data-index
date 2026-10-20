<script context="module">
	import Paragraph from '#lib/components/Paragraph.svelte';
	import Link from '#lib/components/Link.svelte';
	import Image from '#lib/components/Image.svelte';
	import List from '#lib/components/List.svelte';
	import ListItem from '#lib/components/ListItem.svelte';
	import Strong from '#lib/components/Strong.svelte';
	import Em from '#lib/components/Em.svelte';
	import H1 from '#lib/components/markdown/H1.svelte';
	import H2 from '#lib/components/markdown/H2.svelte';
	import H3 from '#lib/components/markdown/H3.svelte';
	import H4 from '#lib/components/markdown/H4.svelte';
	import H5 from '#lib/components/markdown/H5.svelte';
	import H6 from '#lib/components/markdown/H6.svelte';

	// Named exports matching HTML element names replace those elements in the .svx.
	export {
		H1 as h1, H2 as h2, H3 as h3, H4 as h4, H5 as h5, H6 as h6,
		Paragraph as p, Link as a, Image as img,
		List as ul, ListItem as li, Strong as strong, Em as em
	};
</script>

<slot />
