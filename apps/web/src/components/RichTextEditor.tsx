"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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
          editor={editor}
          active={editor.isActive("bold")}
          label="B"
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={{ fontWeight: 700 }}
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("italic")}
          label="I"
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: "italic" }}
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("heading", { level: 2 })}
          label="H2"
          title="Heading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("heading", { level: 3 })}
          label="H3"
          title="Subheading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("bulletList")}
          label="•"
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("orderedList")}
          label="1."
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("blockquote")}
          label="❝"
          title="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          editor={editor}
          active={editor.isActive("link")}
          label="🔗"
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
          editor={editor}
          active={false}
          label="🖼"
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
  style,
}: {
  editor: Editor;
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? " rte-btn-active" : ""}`}
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={style}
    >
      {label}
    </button>
  );
}
