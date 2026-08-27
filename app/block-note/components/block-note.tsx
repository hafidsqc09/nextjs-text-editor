"use client";

import * as React from "react";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

import { Loader2Icon } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

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

// Feed cleaned HTML back through BlockNote's own paste pipeline by
// dispatching a synthetic ClipboardEvent at its actual paste target, rather
// than reimplementing HTML-to-block parsing ourselves.
function dispatchClipboardPaste(target: HTMLElement, html: string) {
  const plainText = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/html", html);
  dataTransfer.setData("text/plain", plainText);

  target.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    })
  );
}

export default function BlockNoteEditor() {
  const [uploadCount, setUploadCount] = React.useState(0);
  const isUploading = uploadCount > 0;

  const handleUploadStart = React.useCallback(() => {
    setUploadCount((count) => count + 1);
  }, []);

  const handleUploadEnd = React.useCallback(() => {
    setUploadCount((count) => Math.max(0, count - 1));
  }, []);

  const uploadFileWithProgress = React.useCallback(
    async (file: File): Promise<string> => {
      handleUploadStart();

      const uploadPromise = uploadFile(file);

      toast.promise(uploadPromise, {
        loading: "Uploading image...",
        success: "Image uploaded successfully!",
        error: "Failed to upload image.",
      }).then(() => {});

      try {
        return await uploadPromise;
      } finally {
        handleUploadEnd();
      }
    },
    [handleUploadStart, handleUploadEnd]
  );

  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "paragraph",
        content: "Block Note",
      },
    ],
    uploadFile: uploadFileWithProgress,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      // Ignore the synthetic paste event we redispatch below, so a cleaned
      // Office/Google Docs paste doesn't get processed twice / loop — let it
      // fall through to BlockNote's own HTML-to-block parsing, preferring
      // the (now cleaned) HTML over the plain-text fallback.
      if (!event.isTrusted) {
        return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
      }

      const items = event.clipboardData?.items;
      const imageFiles: File[] = [];
      if (items) {
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }
      }

      // Upload every pasted image file ourselves — e.g. several files
      // copied from Finder — inserting one image block per file.
      if (imageFiles.length > 0) {
        event.preventDefault();
        handleUploadStart();

        (async () => {
          try {
            const results = await Promise.allSettled(imageFiles.map(uploadFile));

            let successCount = 0;
            let failureCount = 0;

            for (const result of results) {
              if (result.status === "fulfilled") {
                editor.insertBlocks(
                  [{ type: "image", props: { url: result.value } }],
                  editor.getTextCursorPosition().block,
                  "after"
                );
                successCount++;
              } else {
                console.error("Failed to upload pasted image:", result.reason);
                failureCount++;
              }
            }

            if (successCount > 0) {
              toast.add({
                title: successCount > 1 ? `${successCount} images uploaded successfully!` : "Image uploaded successfully!",
                type: "success",
              });
            }

            if (failureCount > 0) {
              toast.add({
                title: failureCount > 1 ? `Failed to upload ${failureCount} images.` : "Failed to upload image.",
                description: "Please try again.",
                type: "error",
              });
            }
          } finally {
            handleUploadEnd();
          }
        })();

        return true;
      }

      const html = event.clipboardData?.getData("text/html") ?? "";
      if (!html) return defaultPasteHandler();

      const parsedDoc = new DOMParser().parseFromString(html, "text/html");
      const isOfficePaste = isOfficePasteHtml(html);
      if (isOfficePaste) cleanOfficePasteDocument(parsedDoc);

      const foreignImages = collectForeignImages(parsedDoc.body);
      if (!isOfficePaste && foreignImages.length === 0) return defaultPasteHandler();

      const pasteTarget = event.target instanceof HTMLElement ? event.target : null;
      if (!pasteTarget) return defaultPasteHandler();

      event.preventDefault();
      handleUploadStart();

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

          dispatchClipboardPaste(pasteTarget, parsedDoc.body.innerHTML);
        } catch (error) {
          console.error("Failed to process pasted content:", error);
          toast.add({
            title: "Failed to process pasted content.",
            description: "Please try again.",
            type: "error",
          });
        } finally {
          handleUploadEnd();
        }
      })();

      return true;
    },
  });

  return (
    <div className="relative w-full border rounded-md p-2">
      <div className={isUploading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={() => {
            console.log("Document changed via view:", editor.document);

            const getHtml = async () => console.log("HTML", editor.blocksToHTMLLossy());
            getHtml().then(() => {});

            const getMarkdown = async () => console.log("MD", editor.blocksToMarkdownLossy());
            getMarkdown().then(() => {});
          }}
        />
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
  );
}
