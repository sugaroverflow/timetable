import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

const md = new MarkdownIt({
  html: false, // never trust raw HTML in topic/comment markdown
  linkify: true,
  breaks: true,
});

const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
  "img",
  "h1",
  "h2",
]);

/** Render user markdown to sanitized HTML for safe display. */
export function renderMarkdown(source: string | null | undefined): string {
  const raw = md.render(source ?? "");
  return sanitizeHtml(raw, {
    allowedTags,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
