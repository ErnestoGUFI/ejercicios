const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

export default function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}
