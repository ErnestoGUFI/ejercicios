import escapeHtml from "../utils/escapeHtml.js";

export const SHARE_LABELS = Object.freeze({
  native: "Compartir tema",
  copy: "Copiar enlace del tema",
});

export default function ShareControl({ topicId, url, mode = "native" }) {
  const label = SHARE_LABELS[mode] ?? SHARE_LABELS.native;

  return `
    <div class="share-control">
      <button class="sw-button sw-button-secondary" type="button" data-share-topic="${escapeHtml(topicId)}">${label}</button>
      <p class="saved-resource-feedback" data-share-feedback role="status" hidden></p>
      <div class="form-field share-fallback" data-share-fallback hidden>
        <label for="share-link">Enlace del tema</label>
        <input id="share-link" type="text" readonly value="${escapeHtml(url)}" data-share-link>
      </div>
    </div>
  `;
}
