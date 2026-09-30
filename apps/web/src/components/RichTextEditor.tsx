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
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "tiptap-markdown";

import { useToast } from "@/components/Toast";
import {
  ACCEPTED_IMAGE_TYPES,
  shrinkImage,
  uploadImageFile,
} from "@/lib/uploadImage";

/** Image files carried by a paste or a drop, if any. */
function imageFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) =>
    f.type.startsWith("image/"),
  );
}

/** WYSIWYG editor for topic descriptions (QA #59). Off-the-shelf TipTap;
 * markdown stays the source of truth — the Markdown extension round-trips
 * it, and the server-side sanitizer remains the safety boundary. */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write…",
  minHeight = 420,
  uploadForum,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** The forum whose storage takes images (hosts and admins may upload):
   * the image button uploads, and pasting or dropping an image does too.
   * Without it the button asks for an image's web address. */
  uploadForum?: string;
}) {
  // Paste/drop handlers are fixed when the editor is created, so they call
  // through a ref that ImageControl keeps pointed at the live uploader.
  const upload = useRef<((file: File) => void) | null>(null);
  const setUploader = useCallback((fn: ((file: File) => void) | null) => {
    upload.current = fn;
  }, []);
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
    editorProps: {
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData);
        if (files.length === 0 || !upload.current) return false;
        event.preventDefault();
        for (const f of files) upload.current(f);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        const files = imageFiles(event.dataTransfer);
        if (moved || files.length === 0 || !upload.current) return false;
        event.preventDefault();
        for (const f of files) upload.current(f);
        return true;
      },
    },
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
        <ImageControl
          editor={editor}
          uploadForum={uploadForum}
          onUploader={setUploader}
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

/** The toolbar's image button. With a forum to upload into it opens a file
 * picker (and keeps `upload` — what paste and drop call — pointed at the
 * uploader); without one it asks for an image's web address. Photos are
 * shrunk in the browser before they go up. */
function ImageControl({
  editor,
  uploadForum,
  onUploader,
}: {
  editor: Editor;
  uploadForum?: string;
  onUploader: (fn: ((file: File) => void) | null) => void;
}) {
  const { toastError } = useToast();
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploader = useCallback(
    (file: File) => {
      if (!uploadForum) return;
      setUploading((n) => n + 1);
      shrinkImage(file)
        .then((small) => uploadImageFile(small, "post-image", uploadForum))
        .then((src) => editor.chain().focus().setImage({ src }).run())
        .catch((err: unknown) =>
          toastError(err instanceof Error ? err.message : "Upload failed"),
        )
        .finally(() => setUploading((n) => n - 1));
    },
    [editor, uploadForum, toastError],
  );

  useEffect(() => {
    onUploader(uploadForum ? uploader : null);
    return () => onUploader(null);
  }, [uploadForum, uploader, onUploader]);

  if (!uploadForum) {
    return (
      <ToolButton
        active={false}
        label={<ImageIcon size={16} aria-hidden />}
        title="Image from URL"
        onClick={() => {
          const url = window.prompt("Image URL");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
      />
    );
  }
  return (
    <>
      <ToolButton
        active={false}
        label={<ImageIcon size={16} aria-hidden />}
        title={uploading > 0 ? "Uploading image…" : "Add an image"}
        onClick={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        hidden
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) {
            uploader(f);
          }
          e.target.value = "";
        }}
      />
      {uploading > 0 ? (
        <span className="rte-status" role="status">
          Uploading image…
        </span>
      ) : null}
    </>
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
