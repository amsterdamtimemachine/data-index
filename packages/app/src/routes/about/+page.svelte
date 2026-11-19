<script lang="ts">
	import { translate, currentLanguage } from '#lib/utils/translations.js';
	import { resolve } from '$app/paths';
	import Nav from '#lib/components/Nav.svelte';
	import NavItem from '#lib/components/NavItem.svelte';
	import LogoGrid from '#lib/components/LogoGrid.svelte';
	import LanguageSwitch from '#lib/components/LanguageSwitch.svelte';
	import ContentNl from './content.nl.svx';
	import ContentEn from './content.en.svx';

	const language = currentLanguage();
</script>

<div class="w-full bg-atm-sand-dark min-h-screen">
	<div class="w-full flex justify-center bg-atm-sand border-b border-atm-sand-border">
		<Nav class="max-w-4xl border-none px-4 sm:px-6 lg:px-8">
			<NavItem href={resolve('/(map)')} label="Data Index" />
			<NavItem href={resolve('/about')} label={translate('navAbout')} />
			<LanguageSwitch />
		</Nav>
	</div>
	<div class="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
		{#if language === 'en'}
			<ContentEn />
		{:else}
			<ContentNl />
		{/if}
		<LogoGrid class="mt-8" />
	</div>
</div>
