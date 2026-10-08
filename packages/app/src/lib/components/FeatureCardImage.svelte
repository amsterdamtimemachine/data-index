<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import { translate } from '$utils/translations';
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
		<div class="relative w-full min-h-0 shrink overflow-hidden border-y border-atm-sand-border bg-atm-gold-gray" style:aspect-ratio={aspect}>
			<img
				src={thumbnail}
				{alt}
				class="absolute inset-0 w-full h-full object-contain rounded"
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
					aria-label="Expand image"
				>
					<div class="w-full aspect-[4/3] overflow-hidden rounded bg-atm-gold-gray">
						<img
							src={thumbnail}
							{alt}
							loading="lazy"
							class="w-full h-full object-cover"
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
						class="w-full h-full object-cover"
						onload={handleImageLoad}
						onerror={handleImageError}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
