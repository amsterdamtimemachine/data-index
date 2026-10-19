/**
 * A headless group of checkboxes: attributes to spread on the caller's own buttons,
 * the way the Melt builders do, with no state of its own. The parent's selection is
 * the truth; a press reports the next selection through onChange. Every checkbox is a
 * native button, so each is in the tab order and Space or Enter presses it.
 */
import { toggleSelection } from '$utils/toggle-selection';

type Options = {
	selected: () => string[];
	onChange: (next: string[]) => void;
	requireOne?: () => boolean;
	labelledBy?: () => string | undefined;
};

export class ToggleGroup {
	constructor(private readonly options: Options) {}

	private get requireOne(): boolean {
		if (this.options.requireOne) {
			return this.options.requireOne();
		}
		return false;
	}

	get root() {
		let labelledBy: string | undefined;
		if (this.options.labelledBy) {
			labelledBy = this.options.labelledBy();
		}
		return {
			role: 'group',
			'aria-labelledby': labelledBy
		};
	}

	item(value: string, disabled = false) {
		const checked = this.options.selected().includes(value);
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
			role: 'checkbox',
			'aria-checked': checked,
			'data-state': state,
			'data-value': value,
			'data-disabled': dataDisabled,
			disabled,
			onclick: () => this.press(value)
		};
	}

	private press(value: string) {
		const next = toggleSelection(this.options.selected(), value, this.requireOne);
		if (next !== this.options.selected()) {
			this.options.onChange(next);
		}
	}
}
