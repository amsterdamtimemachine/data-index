<script lang="ts">
	import { translate } from '#lib/utils/translations.js';
	import { resolve } from '$app/paths';
	import Nav from '#lib/components/Nav.svelte';
	import NavItem from '#lib/components/NavItem.svelte';
	import LogoGrid from '#lib/components/LogoGrid.svelte';
	import Content from './content.svx';
</script>

<div class="w-full bg-atm-sand-dark min-h-screen">
	<div class="w-full flex justify-center bg-atm-sand border-b border-atm-sand-border">
		<Nav class="max-w-4xl border-none px-4 sm:px-6 lg:px-8">
			<NavItem href={resolve('/(map)')} label="Data Index" />
			<NavItem href={resolve('/about')} label={translate('navAbout')} />
		</Nav>
	</div>
	<div class="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
		<Content />
		<LogoGrid class="mt-8" />
	</div>
</div>
