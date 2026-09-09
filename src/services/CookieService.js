export function setCookie(
  name,
  value,
  days,
  cookieDocument = globalThis.document,
  onError = () => {},
) {
  try {
    const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
    const cookiePair = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    cookieDocument.cookie = `${cookiePair}; Expires=${expires}; Path=/; SameSite=Lax`;
    if (!cookieDocument.cookie.split("; ").includes(cookiePair)) {
      throw new Error("Cookie rejected");
    }
    return true;
  } catch {
    onError("guardar");
    return false;
  }
}

export function getCookie(
  name,
  cookieDocument = globalThis.document,
  onError = () => {},
) {
  try {
    const encodedName = `${encodeURIComponent(name)}=`;
    const cookie = cookieDocument.cookie
      .split("; ")
      .find((item) => item.startsWith(encodedName));

    return cookie ? decodeURIComponent(cookie.slice(encodedName.length)) : null;
  } catch {
    onError("leer");
    return null;
  }
}

export function deleteCookie(
  name,
  cookieDocument = globalThis.document,
  onError = () => {},
) {
  try {
    const encodedName = `${encodeURIComponent(name)}=`;
    cookieDocument.cookie = `${encodedName}; Max-Age=0; Path=/; SameSite=Lax`;
    if (cookieDocument.cookie.split("; ").some((item) => item.startsWith(encodedName))) {
      throw new Error("Cookie not deleted");
    }
    return true;
  } catch {
    onError("eliminar");
    return false;
  }
}
