"use client";

import React, { useRef } from "react";

import { toast } from "@/components/ui/toast";
import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

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
import { Loader2Icon } from "lucide-react";
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";


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

async function uploadFile(file: File): Promise<string> {
  const data = new FormData();
  data.append("files", file);

  const res = await fetch(`${UPLOAD_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPLOAD_TOKEN}`,
    },
    body: data,
  });

  if (!res.ok) throw new Error("Upload failed");
  const response = await res.json();

  let imageUrl = Array.isArray(response) ? response[0]?.url : response.url;
  if (!imageUrl) throw new Error("Invalid image URL returned from upload server");

  if (!imageUrl.startsWith("http")) {
    imageUrl = `${UPLOAD_URL}${imageUrl}`;
  }

  return imageUrl;
}

// Uploads a single file and inserts it as an image node at the current
// selection, wrapping the whole thing in upload-progress bookkeeping and a
// toast so every entry point (toolbar button, drag-drop, plain file paste)
// behaves identically.
function insertUploadedImage(file: File, view: EditorView, onUploadStart: () => void, onUploadEnd: () => void) {
  onUploadStart();

  const uploadPromise = uploadFile(file).then((imageUrl) => {
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

  uploadPromise.finally(onUploadEnd);

  return uploadPromise;
}

// Google Docs marks every copy with this wrapper id, and MS Word/Word Online
// pastes carry Office XML namespaces and `mso-*` styles — the standard
// signatures used to detect a paste from either app.
function isOfficePasteHtml(html: string): boolean {
  return /docs-internal-guid|urn:schemas-microsoft-com:office|w:WordDocument|mso-/i.test(html);
}

function isForeignImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) && !(UPLOAD_URL && src.startsWith(UPLOAD_URL));
}

// Word/Google Docs represent formatting as presentational `style`/`class`
// soup on `<span>`/`<font>` elements instead of semantic tags. Converting the
// styles the editor's own toolbar can express into semantic tags, then
// stripping the rest, keeps pasted content consistent with content typed
// directly into the editor. Mutates `doc` in place.
function cleanOfficePasteDocument(doc: Document) {
  const gdocsWrapper = doc.querySelector('b[id^="docs-internal-guid"]');
  if (gdocsWrapper) gdocsWrapper.replaceWith(...Array.from(gdocsWrapper.childNodes));

  // Unwrap Word's namespaced elements (o:p, w:sdt, ...) while keeping their content.
  Array.from(doc.body.querySelectorAll("*"))
    .filter((el) => el.tagName.includes(":"))
    .forEach((el) => el.replaceWith(...Array.from(el.childNodes)));

  // Convert style-based emphasis into semantic tags before the styles
  // themselves are dropped. Reverse document order so an outer span's
  // captured innerHTML already contains any inner span's converted tags.
  Array.from(doc.body.querySelectorAll<HTMLElement>("span[style], font[style]"))
    .reverse()
    .forEach((el) => {
      const { style } = el;
      const isUnderline = /underline/i.test(style.textDecoration ?? "");
      const isItalic = (style.fontStyle ?? "").trim().toLowerCase() === "italic";
      const isBold = /^(bold|[7-9]00)$/i.test((style.fontWeight ?? "").trim());

      let innerHtml = el.innerHTML;
      if (isUnderline) innerHtml = `<u>${innerHtml}</u>`;
      if (isItalic) innerHtml = `<em>${innerHtml}</em>`;
      if (isBold) innerHtml = `<strong>${innerHtml}</strong>`;

      if (innerHtml !== el.innerHTML) el.outerHTML = innerHtml;
    });

  // Strip remaining presentational cruft.
  Array.from(doc.body.querySelectorAll("[class], [style], [lang]")).forEach((el) => {
    el.removeAttribute("class");
    el.removeAttribute("style");
    el.removeAttribute("lang");
  });

  // Unwrap now-inert span/font wrappers left with no attributes.
  Array.from(doc.body.querySelectorAll("span, font")).forEach((el) => {
    if (el.attributes.length === 0) el.replaceWith(...Array.from(el.childNodes));
  });

  // Drop empty paragraphs Word/Google Docs use as spacing artifacts.
  Array.from(doc.body.querySelectorAll("p")).forEach((p) => {
    const hasImage = p.querySelector("img") !== null;
    const hasText = (p.textContent ?? "").trim().length > 0;
    if (!hasImage && !hasText) p.remove();
  });
}

// Not limited to Office pastes: any pasted content — Figma, a random web
// page, another app entirely — can carry `<img>` tags pointing at a
// third-party host, so those stay hotlinked unless we catch them here too.
function collectForeignImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll("img")).filter((img) => isForeignImageSrc(img.getAttribute("src") ?? ""));
}

// Re-upload images pasted by URL rather than as embedded files, mutating the
// existing <img> elements' `src` in place. Routed through our own
// same-origin proxy route since third-party CDNs don't consistently send
// Access-Control-Allow-Origin.
async function reuploadForeignImages(imgElements: HTMLImageElement[]): Promise<number> {
  let failures = 0;

  await Promise.all(
    imgElements.map(async (img) => {
      const src = img.getAttribute("src") ?? "";

      try {
        const res = await fetch(`/api/fetch-image?url=${encodeURIComponent(src)}`);
        if (!res.ok) throw new Error("Fetch failed");

        const blob = await res.blob();
        const extension = blob.type.split("/")[1] ?? "png";
        const file = new File([blob], `pasted-image.${extension}`, { type: blob.type || "image/png" });

        img.setAttribute("src", await uploadFile(file));
      } catch (error) {
        failures++;
        console.warn("Could not re-upload pasted image, keeping the original URL:", error);
      }
    })
  );

  return failures;
}

function createImageDropPastePlugin(onUploadStart: () => void, onUploadEnd: () => void) {
  return new Plugin({
    props: {
      handleDrop(view, event) {
        const hasFiles = event.dataTransfer?.files?.length;
        if (!hasFiles) return false;

        const images = Array.from(event.dataTransfer.files).filter((file) =>
          file.type.startsWith("image/")
        );
        if (images.length === 0) return false;

        event.preventDefault();
        images.forEach((file) => insertUploadedImage(file, view, onUploadStart, onUploadEnd));
        return true;
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.files || []);
        const images = items.filter((file) => file.type.startsWith("image/"));
        if (images.length === 0) return false;

        event.preventDefault();
        images.forEach((file) => insertUploadedImage(file, view, onUploadStart, onUploadEnd));
        return true;
      },
    },
  });
}

// Handles pastes that carry HTML instead of (or in addition to) image files:
// Word/Google Docs formatting cleanup, and re-uploading any pasted <img>
// pointing at a third-party host. Runs only when there's something to do —
// a plain paste falls through to ProseMirror's own schema-based HTML parsing.
function createPasteCleanupPlugin(onUploadStart: () => void, onUploadEnd: () => void) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (!html) return false;

        const parsedDoc = new DOMParser().parseFromString(html, "text/html");
        const isOfficePaste = isOfficePasteHtml(html);
        if (isOfficePaste) cleanOfficePasteDocument(parsedDoc);

        const foreignImages = collectForeignImages(parsedDoc.body);
        if (!isOfficePaste && foreignImages.length === 0) return false;

        event.preventDefault();
        onUploadStart();

        (async () => {
          try {
            if (foreignImages.length > 0) {
              const failures = await reuploadForeignImages(foreignImages);
              if (failures > 0) {
                toast.add({
                  title:
                    failures > 1
                      ? `Kept ${failures} images linked to their original source.`
                      : "Kept an image linked to its original source.",
                  description: "It couldn't be re-uploaded to our server, likely due to cross-origin restrictions.",
                  type: "warning",
                });
              }
            }

            const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(parsedDoc.body, {
              preserveWhitespace: true,
            });
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          } catch (error) {
            console.error("Failed to process pasted content:", error);
            toast.add({
              title: "Failed to process pasted content.",
              description: "Please try again.",
              type: "error",
            });
          } finally {
            onUploadEnd();
          }
        })();

        return true;
      },
    },
  });
}

function createImageHandlingExtension(onUploadStart: () => void, onUploadEnd: () => void) {
  return Extension.create({
    name: "imageHandling",
    addProseMirrorPlugins() {
      return [
        createImageDropPastePlugin(onUploadStart, onUploadEnd),
        createPasteCleanupPlugin(onUploadStart, onUploadEnd),
      ];
    },
  });
}

const TiptapEditor = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCount, setUploadCount] = React.useState(0);
  const isUploading = uploadCount > 0;

  const handleUploadStart = React.useCallback(() => {
    setUploadCount((count) => count + 1);
  }, []);

  const handleUploadEnd = React.useCallback(() => {
    setUploadCount((count) => Math.max(0, count - 1));
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    content: "<p>Tiptap</p>",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      console.log("Tiptap Content Changed (HTML):", html);

      const json = editor.getJSON();
      console.log("Tiptap Content Changed (JSON):", json);
    },
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
      createImageHandlingExtension(handleUploadStart, handleUploadEnd),
    ],
  });

  React.useEffect(() => {
    editor?.setEditable(!isUploading);
  }, [editor, isUploading]);

  if (!editor) {
    return null;
  }

  const triggerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor?.view) {
      insertUploadedImage(file, editor.view, handleUploadStart, handleUploadEnd).then(() => {});
    }
    e.target.value = "";
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

      <div className="relative">
        <div className={isUploading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          <EditorContent editor={editor} className="min-h-50 outline-none" />
        </div>

        {isUploading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
            <span className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 shadow-sm">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Uploading…</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TiptapEditor;
