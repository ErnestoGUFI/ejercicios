export default function showPersistenceWarning(notice, mechanism) {
  if (!notice) return;

  notice.textContent = `No se pudo usar ${mechanism}. La aplicación seguirá funcionando sin guardar ese dato.`;
  notice.hidden = false;
}
