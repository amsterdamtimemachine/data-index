<!--
	The app's one polite live region, mounted once in the layout so it exists before
	anything is announced. Atomic, so the whole sentence is read, not only what changed.
-->
<script lang="ts">
	import { announcer } from './announcer.svelte';
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true">{announcer.message}</p>
