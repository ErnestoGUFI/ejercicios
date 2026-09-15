export default function safeUrl(value) {
  const candidate = String(value).trim();

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? candidate : "#";
  } catch {
    return "#";
  }
}
