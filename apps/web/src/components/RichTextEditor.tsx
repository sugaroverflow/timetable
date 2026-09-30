"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  DOMParser as PMDOMParser,
  Slice,
  type ResolvedPos,
} from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Markdown } from "tiptap-markdown";

/**
 * Plain-text paste (Ed, QA 2026-09-30). tiptap-markdown parses pasted text
 * as ONE inline run with whitespace preserved, so every newline became a
 * hard break — a triple-click copy (which carries the line ending) pasted
 * as a line plus stray breaks, and pasted paragraphs collapsed into
 * <br>s. Instead: trim the surrounding blank lines, parse as ordinary
 * Markdown (blank lines → paragraphs), and open the slice fully so a
 * single line joins the paragraph you paste into, as rich pastes do.
 * Shift-paste (`plain`) keeps ProseMirror's own plain handling.
 */
function parsePastedText(
  text: string,
  context: ResolvedPos,
  plain: boolean,
  view: EditorView,
): Slice {
  const editor = (view.dom as HTMLElement & { editor?: Editor }).editor;
  const trimmed = text.replace(/^\s*\n|\n\s*$/g, "");
  // ProseMirror's own reading of plain text, for shift-paste and the
  // cases this parser can't handle.
  const fallback = () => {
    // One paragraph per line, as ProseMirror itself reads plain text.
    const dom = document.createElement("div");
    for (const line of trimmed.split(/\r?\n/)) {
      dom.append(
        Object.assign(document.createElement("p"), { textContent: line }),
      );
    }
    return PMDOMParser.fromSchema(view.state.schema).parseSlice(dom, {
      context,
    });
  };
  if (plain || !editor || !trimmed) return Slice.maxOpen(fallback().content);
  const storage = editor.storage as {
    markdown?: { parser: { parse(md: string): string } };
  };
  const html = storage.markdown?.parser.parse(trimmed);
  if (html === undefined) return Slice.maxOpen(fallback().content);
  // An inert document, never innerHTML on a live element: pasted text is
  // untrusted, and a live <img onerror> would run even detached.
  const dom = new window.DOMParser().parseFromString(html, "text/html").body;
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(dom, {
    context,
  });
  return Slice.maxOpen(slice.content);
}

/** WYSIWYG editor for topic descriptions (QA #59). Off-the-shelf TipTap;
 * markdown stays the source of truth — the Markdown extension round-trips
 * it, and the server-side sanitizer remains the safety boundary. */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write…",
  minHeight = 420,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  // Tracks what the editor last emitted so external resets (e.g. Discard,
  // post-save clear) can be told apart from our own onUpdate echoes.
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      // inclusive:false is the documented one-liner for "I kept typing and
      // the link got longer" (user bug 2026-07-29): TipTap ties mark
      // inclusivity to the autolink option, so by default text typed at a
      // link's edge joins the link. This keeps autolink but stops the growth.
      Link.extend({ inclusive: false }).configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ transformPastedText: true }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: { clipboardTextParser: parsePastedText },
    onUpdate: ({ editor: e }) => {
      const md = getMarkdown(e);
      lastEmitted.current = md;
      onChange(md);
    },
  });

  // External value change (Discard / cleared after submit): reset content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value);
  }, [editor, value]);

  if (!editor) {
    return <div className="rte" style={{ minHeight }} aria-busy="true" />;
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        <ToolButton
          active={editor.isActive("bold")}
          label={<Bold size={16} aria-hidden />}
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          active={editor.isActive("italic")}
          label={<Italic size={16} aria-hidden />}
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          active={editor.isActive("heading", { level: 2 })}
          label={<Heading2 size={16} aria-hidden />}
          title="Heading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolButton
          active={editor.isActive("heading", { level: 3 })}
          label={<Heading3 size={16} aria-hidden />}
          title="Subheading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
        <ToolButton
          active={editor.isActive("bulletList")}
          label={<List size={16} aria-hidden />}
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          active={editor.isActive("orderedList")}
          label={<ListOrdered size={16} aria-hidden />}
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          active={editor.isActive("blockquote")}
          label={<Quote size={16} aria-hidden />}
          title="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          active={editor.isActive("link")}
          label={<Link2 size={16} aria-hidden />}
          title="Link"
          onClick={() => {
            // Inside a link the button EDITS it (prefilled; clear the URL
            // to remove) instead of silently deleting the whole link —
            // the other half of the 2026-07-29 user bug. extendMarkRange
            // applies the change to the whole link from a bare cursor.
            const previous = editor.getAttributes("link").href as
              | string
              | undefined;
            const url = window.prompt("Link URL (empty removes)", previous);
            if (url === null) return;
            const chain = editor.chain().focus().extendMarkRange("link");
            if (url.trim()) chain.setLink({ href: url.trim() }).run();
            else chain.unsetLink().run();
          }}
        />
        <ToolButton
          active={false}
          label={<ImageIcon size={16} aria-hidden />}
          title="Image from URL"
          onClick={() => {
            const url = window.prompt("Image URL");
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
        />
      </div>
      <EditorContent
        editor={editor}
        className="rte-content"
        style={{ minHeight }}
      />
    </div>
  );
}

function getMarkdown(editor: Editor): string {
  return (
    editor.storage as { markdown?: { getMarkdown: () => string } }
  ).markdown!.getMarkdown();
}

function ToolButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? " rte-btn-active" : ""}`}
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
