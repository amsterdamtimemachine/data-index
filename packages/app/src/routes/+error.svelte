<!-- The app's error page: what went wrong in plain words, and the way back to the map.
     The status and the raw message go to the console. -->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { translate } from '$utils/translations';
	import Heading from '$components/Heading.svelte';
	import Link from '$components/Link.svelte';

	const title = $derived.by(() => {
		if (page.status === 404) {
			return translate('pageNotFound');
		}
		return translate('somethingWentWrong');
	});

	if (browser) {
		console.error(page.status, page.error);
	}
</script>

<div class="min-h-screen bg-atm-sand flex flex-col items-center justify-center gap-4 p-6 text-center">
	<Heading level={1}>{title}</Heading>
	<Link href={resolve('/')}>{translate('backToMap')}</Link>
</div>
