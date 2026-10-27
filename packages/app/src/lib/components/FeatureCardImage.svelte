<script lang="ts">
	import { mergeCss } from '#lib/utils/utils.js';
	import { translate } from '#lib/utils/translations.js';
	type Props = {
		thumbnail: string;
		alt?: string;
		expanded?: boolean;
		onExpand?: () => void;
	};

	let { thumbnail, alt, expanded = false, onExpand }: Props = $props();

	let imageError = $state(false);
	const errorHeight = $derived.by(() => {
		if (expanded) {
			return 'h-64';
		}
		return 'h-32';
	});
	let imageLoading = $state(true);
	// the picture's own width / height, once it has loaded; the box takes this shape
	let aspect = $state(4 / 3);
	// the collapsed frame; a picture taller than it is fitted whole, a wider one fills it
	const COLLAPSED_ASPECT = 4 / 3;
	// expanded, a tall picture's box is at most this many times as tall as it is wide
	const MAX_PORTRAIT_HEIGHT = 1.25;

	const collapsedFit = $derived.by(() => {
		if (aspect < COLLAPSED_ASPECT) {
			return 'object-contain';
		}
		return 'object-cover';
	});
	const expandedAspect = $derived(Math.max(aspect, 1 / MAX_PORTRAIT_HEIGHT));

	const handleImageLoad = (event: Event) => {
		const img = event.currentTarget as HTMLImageElement;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			aspect = img.naturalWidth / img.naturalHeight;
		}
		imageLoading = false;
	};

	const handleImageError = () => {
		imageError = true;
		imageLoading = false;
	};
</script>

<div class="flex-1 min-h-0 flex flex-col">
	{#if imageError}
		<div class={mergeCss('w-full flex items-center justify-center text-base text-black', errorHeight)}>
			{translate('imageUnavailable')}
		</div>
	{:else if expanded}
		<!-- a box of the picture's shape, which shrinks when the card runs out of room;
		     the picture is drawn whole inside it, on a gold-gray passe-partout -->
		<!-- a tall picture's box is capped in height, the picture fitted whole with bands at
		     its sides; it is never drawn larger than its own pixels, so a small scan stays sharp -->
		<div class="relative w-full min-h-0 max-h-[70vh] shrink overflow-hidden border-y border-atm-sand-border bg-atm-gold-gray flex items-center justify-center" style:aspect-ratio={expandedAspect}>
			<img
				src={thumbnail}
				{alt}
				class="max-w-full max-h-full object-contain rounded"
				class:hidden={imageLoading}
				onload={handleImageLoad}
				onerror={handleImageError}
			/>
		</div>
	{:else}
		<!-- Collapsed grid thumbnail: a fixed-aspect box reserves the card's final height
		     before the image loads, so the masonry layout measures true heights and never
		     shifts when images stream in. Lazy so an off-screen page of 100 cards doesn't
		     fetch every thumbnail up front. -->
		<div class="relative w-full border-y border-atm-sand-border">
			{#if onExpand}
				<button
					type="button"
					class="w-full block cursor-pointer hover:opacity-80 transition-opacity"
					onclick={onExpand}
					aria-label={translate('expandImage')}
					title={translate('expandImage')}
				>
					<div class="w-full aspect-[4/3] overflow-hidden rounded bg-atm-gold-gray">
						<img
							src={thumbnail}
							{alt}
							loading="lazy"
							class={mergeCss('w-full h-full', collapsedFit)}
							onload={handleImageLoad}
							onerror={handleImageError}
						/>
					</div>
				</button>
			{:else}
				<div class="w-full aspect-[4/3] overflow-hidden rounded bg-atm-gold-gray">
					<img
						src={thumbnail}
						{alt}
						loading="lazy"
						class={mergeCss('w-full h-full', collapsedFit)}
						onload={handleImageLoad}
						onerror={handleImageError}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
