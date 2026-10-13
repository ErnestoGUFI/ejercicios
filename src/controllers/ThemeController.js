import { THEME_KEY } from "../services/PersistenceService.js";

export default class ThemeController {
  constructor({
    select,
    root,
    persistence,
    themeColorMeta = null,
    eventTarget = globalThis.window,
    onChange = () => {},
  }) {
    this.select = select;
    this.root = root;
    this.persistence = persistence;
    this.themeColorMeta = themeColorMeta;
    this.eventTarget = eventTarget;
    this.onChange = onChange;
  }

  apply(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";
    this.root.dataset.theme = selectedTheme;
    this.select.value = selectedTheme;
    this.syncThemeColor();
  }

  // La barra del navegador toma el mismo color que el encabezado del tema activo.
  syncThemeColor() {
    const view = this.root.ownerDocument?.defaultView;
    const brandColor = view?.getComputedStyle(this.root).getPropertyValue("--color-brand").trim();
    if (this.themeColorMeta && brandColor) this.themeColorMeta.content = brandColor;
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
