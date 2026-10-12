const OFFLINE_MESSAGE = "Sin conexión. Se mostrará el contenido que ya está guardado en este dispositivo.";

export default function initNetworkStatusNotice({
  notice,
  eventTarget = globalThis.window,
  navigatorObject = globalThis.navigator,
} = {}) {
  if (!notice || !eventTarget) return () => {};

  const updateNotice = (isOnline) => {
    notice.hidden = isOnline;
    notice.textContent = isOnline ? "" : OFFLINE_MESSAGE;
  };
  const handleOnline = () => updateNotice(true);
  const handleOffline = () => updateNotice(false);

  eventTarget.addEventListener("online", handleOnline);
  eventTarget.addEventListener("offline", handleOffline);
  updateNotice(navigatorObject?.onLine !== false);

  return () => {
    eventTarget.removeEventListener("online", handleOnline);
    eventTarget.removeEventListener("offline", handleOffline);
  };
}
