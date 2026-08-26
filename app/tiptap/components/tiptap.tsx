"use client";

import React, { useRef } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { Plugin } from "prosemirror-state";

import { toast } from "@/components/ui/toast";
import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return {
      types: ["textStyle"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]/g, ""),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
          ({ chain }) => {
            return chain().setMark("textStyle", { fontSize }).run();
          },
      unsetFontSize:
        () =>
          ({ chain }) => {
            return chain().setMark("textStyle", { fontSize: null }).run();
          },
    };
  },
});

const ImageUploadHandler = Extension.create({
  name: "imageUploadHandler",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop(view, event) {
            const hasFiles = event.dataTransfer?.files?.length;
            if (!hasFiles) return false;

            const images = Array.from(event.dataTransfer.files).filter((file) =>
              file.type.startsWith("image/")
            );
            if (images.length === 0) return false;

            event.preventDefault();
            images.forEach((file) => handleImageUpload(file, view));
            return true;
          },
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.files || []);
            const images = items.filter((file) => file.type.startsWith("image/"));
            if (images.length === 0) return false;

            event.preventDefault();
            images.forEach((file) => handleImageUpload(file, view));
            return true;
          },
        },
      }),
    ];
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleImageUpload(file: File, view: any) {
  const data = new FormData();
  data.append("files", file);

  const uploadPromise = fetch(`${UPLOAD_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPLOAD_TOKEN}`,
    },
    body: data,
  })
    .then((res) => {
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    })
    .then((response) => {
      const imageUrl = Array.isArray(response) ? response[0]?.url : response.url;
      const { schema } = view.state;
      const node = schema.nodes.image.create({ src: imageUrl });
      const transaction = view.state.tr.replaceSelectionWith(node);
      view.dispatch(transaction);
      return imageUrl;
    });

  toast.promise(uploadPromise, {
    loading: "Uploading image...",
    success: "Image uploaded successfully!",
    error: "Failed to upload image.",
  }).then(() => {});
}

const TiptapEditor = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    content: "<p>Tiptap</p>",
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: {},
        blockquote: {},
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "nofollow noreferrer noopener",
          target: "_blank",
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Youtube.configure({
        controls: true,
      }),
      ImageUploadHandler,
    ],
  });

  if (!editor) {
    return null;
  }

  const triggerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor?.view) {
      handleImageUpload(file, editor.view).then(() => {});
    }
  };

  return (
    <div className="border border-gray-300 rounded-md p-4 space-y-3">
      <div className="flex flex-wrap gap-2 border-b pb-3 items-center">
        <select
          onChange={(e) => {
            const level = Number(e.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else editor.chain().focus().toggleHeading({ level: level as any }).run();
          }}
          className="border rounded p-1 text-sm"
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
          <option value="5">Heading 5</option>
          <option value="6">Heading 6</option>
        </select>

        <select
          onChange={(e) =>
            e.target.value === "default"
              ? editor.chain().focus().unsetFontFamily().run()
              : editor.chain().focus().setFontFamily(e.target.value).run()
          }
          className="border rounded p-1 text-sm"
        >
          <option value="default">Font Family</option>
          <option value="Arial, Helvetica, sans-serif">Arial</option>
          <option value="Courier New, Courier, monospace">Courier New</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Times New Roman, Times, serif">Times New Roman</option>
          <option value="Verdana, Geneva, sans-serif">Verdana</option>
        </select>

        <select
          onChange={(e) =>
            e.target.value === "default"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (editor.commands as any).unsetFontSize()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : (editor.commands as any).setFontSize(e.target.value)
          }
          className="border rounded p-1 text-sm"
        >
          <option value="default">Font Size</option>
          <option value="10px">10px</option>
          <option value="11px">11px</option>
          <option value="12px">12px</option>
          <option value="13px">13px</option>
          <option value="14px">14px</option>
        </select>

        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 border rounded text-sm ${editor.isActive("bold") ? "bg-gray-200" : ""}`}
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 border rounded text-sm ${editor.isActive("italic") ? "bg-gray-200" : ""}`}
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-2 py-1 border rounded text-sm ${editor.isActive("underline") ? "bg-gray-200" : ""}`}
        >
          Underline
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`px-2 py-1 border rounded text-sm ${editor.isActive("strike") ? "bg-gray-200" : ""}`}
        >
          Strike
        </button>

        <button
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className="px-2 py-1 border rounded text-sm"
        >
          Left
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className="px-2 py-1 border rounded text-sm"
        >
          Center
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className="px-2 py-1 border rounded text-sm"
        >
          Right
        </button>

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="px-2 py-1 border rounded text-sm"
        >
          Bullet List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="px-2 py-1 border rounded text-sm"
        >
          Numbered List
        </button>

        <button
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="px-2 py-1 border rounded text-sm"
        >
          Table
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={triggerImageUpload}
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1 border rounded text-sm"
        >
          Upload Image
        </button>
      </div>

      <EditorContent editor={editor} className="min-h-50 outline-none" />
    </div>
  );
};

export default TiptapEditor;