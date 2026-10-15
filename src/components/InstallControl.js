export const INSTALL_MESSAGES = {
  ios: "Para instalar Tech catálogo en iPhone o iPad, abre Compartir (en iOS 26 está en el menú ···) y elige «Agregar a Inicio».",
  unavailable: "Este navegador no ofrece instalar la app desde la página. Si ya la instalaste, ábrela desde tus aplicaciones; si no, busca «Instalar» en el menú del navegador. Todo sigue funcionando aquí.",
  dismissed: "Cancelaste la instalación. Puedes instalar la app más tarde desde el menú del navegador.",
  installed: "Tech catálogo quedó instalada. Ya puedes abrirla desde tus aplicaciones o desde la pantalla de inicio.",
};

export const INSTALL_HINT_KEY = "tech-catalog-install-hint-dismissed";

function readFlag(storage) {
  try {
    return storage?.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage) {
  try {
    storage?.setItem(INSTALL_HINT_KEY, "1");
  } catch {
    // Sin almacenamiento, el aviso solo se oculta hasta recargar.
  }
}

export default function initInstallControl({
  button,
  hint,
  installPrompt,
  storage,
  timers = globalThis,
  graceMs = 4000,
} = {}) {
  if (!installPrompt) return () => {};

  const message = hint?.querySelector("[data-install-message]");
  const dismissButton = hint?.querySelector("[data-install-dismiss]");
  let graceOver = false;
  let offered = installPrompt.getState().canPrompt;
  let notice = null;
  let installAnnounced = false;
  let hintDismissed = readFlag(storage);

  function messageFor(state) {
    if (state.runningInstalled) return null;
    if (notice) return notice;
    // Si el navegador ya ofreció la instalación (aunque el diálogo siga abierto), no aplica el plan B.
    if (state.canPrompt || offered || hintDismissed) return null;
    if (state.platform === "ios") return "ios";
    // Chrome y Edge entregan el evento poco después de cargar; se espera antes de dar el plan B.
    return graceOver ? "unavailable" : null;
  }

  function render(state = installPrompt.getState()) {
    if (button) button.hidden = !state.canPrompt || state.runningInstalled;

    const key = messageFor(state);
    if (hint) hint.hidden = key === null;
    if (message) message.textContent = key ? INSTALL_MESSAGES[key] : "";
  }

  const unsubscribe = installPrompt.subscribe((state) => {
    if (state.canPrompt) offered = true;
    if (state.installedThisSession && !installAnnounced) {
      installAnnounced = true;
      notice = "installed";
    } else if (state.canPrompt && notice === "dismissed") {
      notice = null;
    }
    render(state);
  });

  button?.addEventListener("click", async () => {
    button.disabled = true;
    const { outcome } = await installPrompt.promptInstall();
    button.disabled = false;
    if (outcome === "dismissed") notice = "dismissed";
    render();
  });

  dismissButton?.addEventListener("click", () => {
    notice = null;
    hintDismissed = true;
    writeFlag(storage);
    render();
  });

  const timer = hint
    ? timers.setTimeout?.(() => {
      graceOver = true;
      render();
    }, graceMs)
    : undefined;

  render();

  return () => {
    unsubscribe();
    if (timer !== undefined) timers.clearTimeout?.(timer);
  };
}
