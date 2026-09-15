<script lang="ts">
	import { asset } from '$app/paths';
	import { mergeCss } from '$utils/utils';

	type Props = {
		class?: string;
	};

	let { class: className }: Props = $props();

	const logos = [
		{ name: "Amsterdam Time Machine", src: asset('/logos/atm_logo_big.png'), alt: "Amsterdam Time Machine logo", url: "https://amsterdamtimemachine.nl/" },
		{ name: "CREATE", src: asset('/logos/create.svg'), alt: "CREATE logo", url: "https://create.humanities.uva.nl/" },
		{ name: "Delpher", src: asset('/logos/delpher.svg'), alt: "Delpher logo", url: "https://www.delpher.nl/" },
		{ name: "Joods Cultureel Kwartier", src: asset('/logos/Joods_cultureel_kwartier.png'), alt: "Joods Cultureel Kwartier logo", url: "https://jck.nl/" },
		{ name: "Koninklijke Bibliotheek", src: asset('/logos/koninklijke_bibliotheek.svg'), alt: "Koninklijke Bibliotheek logo", url: "https://www.kb.nl/" },
		{ name: "Stadsarchief Amsterdam", src: asset('/logos/stadsarchief.svg'), alt: "Stadsarchief Amsterdam logo", url: "https://www.amsterdam.nl/stadsarchief/" },
		{ name: "Surf", src: asset('/logos/surf.svg'), alt: "Surf logo", url: "https://www.surf.nl/"},
		{ name: "Universiteit van Amsterdam", src: asset('/logos/uva_logo.png'), alt: "Universiteit van Amsterdam logo", url: "https://www.uva.nl/" }
	];
</script>

<div class={mergeCss(
	"grid gap-4 w-full",
	"grid-cols-1 sm:grid-cols-3", // Mobile: 1 col, Small+: 3 cols
	className
)}>
	{#each logos as logo}
		<a 
			href={logo.url}
			target="_blank"
			rel="noopener noreferrer"
			class="flex justify-center items-center p-4 bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark transition-colors"
		>
			<img 
				src={logo.src} 
				alt={logo.alt}
				class="max-w-full max-h-16 object-contain"
			/>
		</a>
	{/each}
</div>

<style>

</style>
