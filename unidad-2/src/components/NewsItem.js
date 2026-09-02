function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoryUrl(story) {
  try {
    const url = new URL(story.url);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // La URL de respaldo conserva el acceso a la noticia en Hacker News.
  }

  return `https://news.ycombinator.com/item?id=${encodeURIComponent(story.id)}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(new Date(timestamp * 1000));
}

export default function NewsItem(story) {
  const storyUrl = escapeHtml(getStoryUrl(story));
  const title = escapeHtml(story.title);
  const author = escapeHtml(story.author);
  const publishedAt = new Date(story.publishedAt * 1000).toISOString();

  return `
    <li class="news-item">
      <article>
        <h2>
          <a href="${storyUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h2>
        <p class="news-meta">
          por ${author} ·
          <time datetime="${publishedAt}">${formatDate(story.publishedAt)}</time>
        </p>
      </article>
    </li>
  `;
}
