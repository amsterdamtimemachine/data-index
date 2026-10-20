<!-- A picture of one of the app's glyph buttons, for text that points at it: the
     real Button, made inert so it is neither focusable nor clickable -->
<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { asset } from '$app/paths';
	import type { AssetPath } from '$app/types';

	interface Props {
		// glyph path under static, e.g. glyphs/ToggleLocalTimeline.svg
		glyph: AssetPath;
	}
	let { glyph }: Props = $props();
</script>

<span inert aria-hidden="true">
	<Button class="inline-flex align-middle mx-1 p-1">
		<img src={asset(glyph)} alt="" width="24" height="24" />
	</Button>
</span>
