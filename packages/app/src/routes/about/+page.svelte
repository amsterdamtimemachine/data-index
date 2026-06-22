<script lang="ts">
	import Nav from '$components/Nav.svelte';
	import NavItem from '$components/NavItem.svelte';
	import LogoGrid from '$components/LogoGrid.svelte';
	import Content from './content.svx';
</script>

<div class="w-full bg-atm-sand-dark min-h-screen">
	<div class="w-full flex justify-center bg-atm-sand border-b border-atm-sand-border">
		<Nav class="max-w-4xl border-none px-4 sm:px-6 lg:px-8">
			<NavItem href="/" label="Data Index" />
			<NavItem href="/about" label="Over" />
		</Nav>
	</div>
	<div class="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
		<div class="prose prose-slate max-w-none prose-a:text-atm-gold-dark">
			<Content />
		</div>
		<LogoGrid class="mt-8" />
	</div>
</div>
