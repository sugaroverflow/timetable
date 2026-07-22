"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
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
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ transformPastedText: true }),
    ],
    content: value,
    immediatelyRender: false,
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
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Link URL");
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
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
