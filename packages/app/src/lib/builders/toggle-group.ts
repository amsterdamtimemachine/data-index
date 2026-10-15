/**
 * A headless toggle group: attributes to spread on the caller's own elements, the
 * way the Melt builders do, with no state of its own. The parent's selection is the
 * truth; a press reports the next selection through onChange.
 *
 * Checkboxes (multiple) are each in the tab order. Radios (single) have one tab
 * stop, the checked one, and the arrow keys move between them; with nothing
 * checked every radio is tabbable.
 */
import { toggleSelection, type ToggleType } from '$utils/toggle-selection';

type Orientation = 'horizontal' | 'vertical';

type Options = {
	selected: () => string[];
	onChange: (next: string[]) => void;
	type?: () => ToggleType;
	requireOne?: () => boolean;
	orientation?: () => Orientation;
	labelledBy?: () => string | undefined;
};

const ITEM = 'data-toggle-item';

export class ToggleGroup {
	constructor(private readonly options: Options) {}

	private get type(): ToggleType {
		if (this.options.type) {
			return this.options.type();
		}
		return 'multiple';
	}

	private get orientation(): Orientation {
		if (this.options.orientation) {
			return this.options.orientation();
		}
		return 'vertical';
	}

	private get requireOne(): boolean {
		if (this.options.requireOne) {
			return this.options.requireOne();
		}
		return false;
	}

	get root() {
		let role = 'group';
		if (this.type === 'single') {
			role = 'radiogroup';
		}
		let labelledBy: string | undefined;
		if (this.options.labelledBy) {
			labelledBy = this.options.labelledBy();
		}
		return {
			role,
			'aria-labelledby': labelledBy,
			'data-orientation': this.orientation,
			onkeydown: (event: KeyboardEvent) => this.navigate(event)
		};
	}

	item(value: string, disabled = false) {
		const selected = this.options.selected();
		const checked = selected.includes(value);
		let role = 'checkbox';
		if (this.type === 'single') {
			role = 'radio';
		}
		let tabindex = 0;
		if (this.type === 'single' && selected.length > 0 && !checked) {
			tabindex = -1;
		}
		let state = 'off';
		if (checked) {
			state = 'on';
		}
		let dataDisabled: '' | undefined;
		if (disabled) {
			dataDisabled = '';
		}
		return {
			type: 'button' as const,
			role,
			'aria-checked': checked,
			'data-state': state,
			'data-value': value,
			'data-disabled': dataDisabled,
			[ITEM]: '',
			disabled,
			tabindex,
			onclick: () => this.press(value)
		};
	}

	private press(value: string) {
		const next = toggleSelection(this.options.selected(), value, this.type, this.requireOne);
		if (next !== this.options.selected()) {
			this.options.onChange(next);
		}
	}

	// radios: the arrow keys along the orientation, Home and End, looping
	private navigate(event: KeyboardEvent) {
		if (this.type !== 'single') {
			return;
		}
		const root = event.currentTarget;
		const current = event.target;
		if (!(root instanceof HTMLElement) || !(current instanceof HTMLElement)) {
			return;
		}
		const items = Array.from(root.querySelectorAll<HTMLElement>(`[${ITEM}]:not([disabled])`));
		const index = items.indexOf(current);
		if (index === -1 || items.length === 0) {
			return;
		}
		let nextKey = 'ArrowDown';
		let prevKey = 'ArrowUp';
		if (this.orientation === 'horizontal') {
			nextKey = 'ArrowRight';
			prevKey = 'ArrowLeft';
		}
		let target: number | undefined;
		if (event.key === nextKey) {
			target = (index + 1) % items.length;
		} else if (event.key === prevKey) {
			target = (index - 1 + items.length) % items.length;
		} else if (event.key === 'Home') {
			target = 0;
		} else if (event.key === 'End') {
			target = items.length - 1;
		}
		if (target === undefined) {
			return;
		}
		event.preventDefault();
		items[target].focus();
	}
}
