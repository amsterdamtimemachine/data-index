<script lang="ts">
	import { mergeCss } from '#lib/utils/utils.js';
	import { translate } from '#lib/utils/translations.js';
	type Props = {
		thumbnail: string;
		alt?: string;
		expanded?: boolean;
		// part of a larger content, such as a page of text, rather than a picture of its own
		inline?: boolean;
		onExpand?: () => void;
	};

	let { thumbnail, alt, expanded = false, inline = false, onExpand }: Props = $props();

	let imageError = $state(false);
	const errorHeight = $derived.by(() => {
		if (expanded) {
			return 'h-64';
		}
		return 'h-32';
	});
	let imageLoading = $state(true);
	// the picture's own width / height, once it has loaded; the expanded box takes this shape
	let aspect = $state(4 / 3);
	// expanded, a tall picture's box is at most this many times as tall as it is wide
	const MAX_PORTRAIT_HEIGHT = 1.25;

	const expandedAspect = $derived(Math.max(aspect, 1 / MAX_PORTRAIT_HEIGHT));
	// collapsed, the box holds a 4:3 place until the picture loads, then takes the picture's height
	const collapsedPlaceholder = $derived.by(() => {
		if (imageLoading) {
			return 'aspect-[4/3]';
		}
		return '';
	});

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
	{:else if inline}
		<!-- in the flow of a text: the picture at its own height, aligned with the text -->
		<div class="px-2 py-3 flex justify-center">
			<img
				src={thumbnail}
				{alt}
				class="max-w-full max-h-[70vh] object-contain"
				onload={handleImageLoad}
				onerror={handleImageError}
			/>
		</div>
	{:else if expanded}
		<!-- a box of the picture's shape, which shrinks when the card runs out of room;
		     the picture is drawn whole inside it -->
		<!-- a tall picture's box is capped in height, the picture fitted whole with bands at
		     its sides; it is never drawn larger than its own pixels, so a small scan stays sharp -->
		<div class="relative w-full min-h-0 max-h-[70vh] shrink overflow-hidden border-y border-atm-sand-border bg-atm-sand-mat flex items-center justify-center" style:aspect-ratio={expandedAspect}>
			<img
				src={thumbnail}
				{alt}
				class="max-w-full max-h-full object-contain"
				class:hidden={imageLoading}
				onload={handleImageLoad}
				onerror={handleImageError}
			/>
		</div>
	{:else}
		<!-- Collapsed grid thumbnail: the picture sizes the box, at most 4:3 of its width tall
		     (75cqw); before it loads, the box holds a 4:3 place, which the masonry layout
		     measures. Lazy so an off-screen page of 100 cards doesn't fetch every thumbnail
		     up front. -->
		<div class="relative w-full">
			{#if onExpand}
				<button
					type="button"
					class="w-full block cursor-pointer hover:opacity-80 transition-opacity"
					onclick={onExpand}
					aria-label={translate('expandImage')}
					title={translate('expandImage')}
				>
					<div class={mergeCss('w-full overflow-hidden bg-atm-sand-mat flex items-center justify-center [container-type:inline-size]', collapsedPlaceholder)}>
						<img
							src={thumbnail}
							{alt}
							loading="lazy"
							class="max-w-full max-h-[75cqw] object-contain"
							onload={handleImageLoad}
							onerror={handleImageError}
						/>
					</div>
				</button>
			{:else}
				<div class={mergeCss('w-full overflow-hidden bg-atm-sand-mat flex items-center justify-center [container-type:inline-size]', collapsedPlaceholder)}>
					<img
						src={thumbnail}
						{alt}
						loading="lazy"
						class="max-w-full max-h-[75cqw] object-contain"
						onload={handleImageLoad}
						onerror={handleImageError}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
