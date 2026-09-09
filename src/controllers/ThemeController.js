import { THEME_KEY } from "../services/PersistenceService.js";

export default class ThemeController {
  constructor({
    select,
    root,
    persistence,
    eventTarget = globalThis.window,
    onChange = () => {},
  }) {
    this.select = select;
    this.root = root;
    this.persistence = persistence;
    this.eventTarget = eventTarget;
    this.onChange = onChange;
  }

  apply(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";
    this.root.dataset.theme = selectedTheme;
    this.select.value = selectedTheme;
  }

  init() {
    this.apply(this.persistence.getTheme());

    this.select.addEventListener("change", (event) => {
      this.apply(event.target.value);
      this.persistence.setTheme(event.target.value);
      this.onChange(event.target.value);
    });

    this.eventTarget?.addEventListener("storage", (event) => {
      if (event.key !== THEME_KEY) return;
      this.apply(event.newValue);
      this.onChange(event.newValue);
    });
  }
}
