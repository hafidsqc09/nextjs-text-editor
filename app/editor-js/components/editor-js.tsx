"use client";

import * as React from "react";

import { toast } from "@/components/ui/toast";
import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

import type { OutputBlockData, OutputData } from "@editorjs/editorjs";
import { Loader2Icon } from "lucide-react";

interface EditorJSProps {
  data?: OutputData;
  onChange?: (html: string) => void;
}

const defaultInitialData: OutputData = {
  time: Date.now(),
  blocks: [
    {
      type: "paragraph",
      data: {
        text: "Editor.js",
      },
    },
  ],
  version: "2.30.0",
};

async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("files", file);

  const res = await fetch(`${UPLOAD_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPLOAD_TOKEN}`,
    },
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");
  const response = await res.json();

  let imageUrl = Array.isArray(response) ? response[0]?.url : response.url;
  if (!imageUrl) throw new Error("Invalid image URL returned from upload server");

  // Ensure relative URLs are prefixed with base upload domain
  if (!imageUrl.startsWith("http")) {
    imageUrl = `${UPLOAD_URL}${imageUrl}`;
  }

  return imageUrl;
}

// Google Docs marks every copy with this wrapper id — the standard signature
// used to detect a Google Docs paste (see e.g. docs-internal-guid discussions).
function isGoogleDocsHtml(html: string): boolean {
  return html.includes("docs-internal-guid");
}

// Google Docs represents bold/italic/underline as inline `style` on <span>
// elements instead of semantic tags, which Editor.js's paste sanitizer drops.
// Rewriting them to <strong>/<em>/<u> (and re-uploading embedded images,
// which otherwise stay linked to Google's CDN) lets Editor.js's own paste
// parser reconstruct the content faithfully.
async function cleanGoogleDocsHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const wrapper = doc.querySelector('b[id^="docs-internal-guid"]');
  if (wrapper) {
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  }

  // Reverse document order so an outer span's captured innerHTML already
  // contains any inner span's converted semantic tags.
  Array.from(doc.querySelectorAll("span[style]"))
    .reverse()
    .forEach((span) => {
      const style = span.getAttribute("style") ?? "";
      let innerHtml = span.innerHTML;

      if (/text-decoration:\s*underline/i.test(style)) innerHtml = `<u>${innerHtml}</u>`;
      if (/font-style:\s*italic/i.test(style)) innerHtml = `<em>${innerHtml}</em>`;
      if (/font-weight:\s*(bold|[7-9]00)/i.test(style)) innerHtml = `<strong>${innerHtml}</strong>`;

      span.outerHTML = innerHtml;
    });

  let imageUploadFailures = 0;

  await Promise.all(
    Array.from(doc.querySelectorAll("img")).map(async (img) => {
      try {
        const res = await fetch(img.src);
        if (!res.ok) throw new Error("Fetch failed");

        const blob = await res.blob();
        const extension = blob.type.split("/")[1] ?? "png";
        const file = new File([blob], `google-docs-image.${extension}`, { type: blob.type || "image/png" });

        img.src = await uploadImageFile(file);
      } catch (error) {
        // Cross-origin fetch of Google's CDN can be blocked by CORS — fall
        // back to the original URL so the image still renders.
        imageUploadFailures++;
        console.warn("Could not re-upload Google Docs image, keeping the original URL:", error);
      }
    })
  );

  if (imageUploadFailures > 0) {
    toast.add({
      title: imageUploadFailures > 1 ? `Kept ${imageUploadFailures} images linked to Google Docs.` : "Kept an image linked to Google Docs.",
      description: "It couldn't be re-uploaded to our server, likely due to cross-origin restrictions.",
      type: "warning",
    });
  }

  return doc.body.innerHTML;
}

// Feed cleaned HTML back through Editor.js's own paste pipeline by dispatching
// a synthetic ClipboardEvent at its actual paste target (the holder element),
// rather than reimplementing HTML-to-block parsing ourselves.
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

// editorjs-html ships no parser for the table tool we use, so provide one.
function tableParser({ data }: OutputBlockData) {
  const rows = (data.content as string[][]) ?? [];

  const rowsHtml = rows
    .map((row, rowIndex) => {
      const cellTag = data.withHeadings && rowIndex === 0 ? "th" : "td";
      return `<tr>${row.map((cell) => `<${cellTag}>${cell}</${cellTag}>`).join("")}</tr>`;
    })
    .join("");

  return `<table>${rowsHtml}</table>`;
}

const EditorJSComponent: React.FC<EditorJSProps> = ({
  data = defaultInitialData,
  onChange,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const holderRef = React.useRef<HTMLDivElement>(null);
  const holderId = React.useId().replace(/:/g, "");
  const [isUploading, setIsUploading] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const initEditor = async () => {
      const EditorJS = (await import("@editorjs/editorjs")).default;
      const Header = (await import("@editorjs/header")).default;
      const ImageTool = (await import("@editorjs/image")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Table = (await import("@editorjs/table")).default as any;
      const List = (await import("@editorjs/list")).default;
      const Code = (await import("@editorjs/code")).default;
      const InlineCode = (await import("@editorjs/inline-code")).default;
      const Quote = (await import("@editorjs/quote")).default;
      const Embed = (await import("@editorjs/embed")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Marker = (await import("@editorjs/marker")).default as any;
      const Underline = (await import("@editorjs/underline")).default;
      const Delimiter = (await import("@editorjs/delimiter")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AlignmentBlockTune = (await import("editorjs-text-alignment-blocktune")).default as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Hyperlink = (await import("editorjs-hyperlink")).default as any;
      const edjsHTML = (await import("editorjs-html")).default;

      if (!isMounted || editorRef.current) return;

      const htmlParser = edjsHTML({ table: tableParser });

      editorRef.current = new EditorJS({
        holder: `editorjs-${holderId}`,
        data: data,
        async onChange(api) {
          const outputData = await api.saver.save();
          console.log("Editor.js Content Changed (native):", outputData);

          const parsedHtml = htmlParser.parse(outputData);
          console.log("Editor.js Content Changed (HTML):", parsedHtml);

          if (onChange) {
            onChange(parsedHtml);
          }
        },
        tunes: ["anyTuneName"],
        tools: {
          anyTuneName: {
            class: AlignmentBlockTune,
            config: {
              default: "left",
              blocks: {
                header: "left",
                paragraph: "left",
                list: "left",
              },
            },
          },

          header: {
            class: Header,
            inlineToolbar: true,
            config: {
              placeholder: "Enter a heading",
              levels: [1, 2, 3, 4, 5, 6],
              defaultLevel: 2,
            },
          },

          image: {
            class: ImageTool,
            inlineToolbar: true,
            config: {
              uploader: {
                async uploadByFile(file: File) {
                  try {
                    const imageUrl = await uploadImageFile(file);

                    toast.add({
                      title: "Image uploaded successfully!",
                      type: "success",
                    });

                    return {
                      success: 1,
                      file: {
                        url: imageUrl,
                      },
                    };
                  } catch (error) {
                    console.error(error);
                    toast.add({
                      title: "Failed to upload image.",
                      description: "Please try again.",
                      type: "error",
                    })
                    return {
                      success: 0,
                    };
                  }
                },
                async uploadByUrl(url: string) {
                  return {
                    success: 1,
                    file: { url },
                  };
                },
              },
            },
          },

          embed: {
            class: Embed,
            inlineToolbar: true,
            config: {
              services: {
                youtube: true,
                vimeo: true,
                coub: true,
              },
            },
          },

          table: {
            class: Table,
            inlineToolbar: true,
            config: {
              rows: 2,
              cols: 3,
            },
          },

          list: {
            class: List,
            inlineToolbar: true,
            config: {
              defaultStyle: "unordered",
            },
          },

          code: Code,

          inlineCode: {
            class: InlineCode,
            shortcut: "CMD+SHIFT+M",
          },

          quote: {
            class: Quote,
            inlineToolbar: true,
            config: {
              quotePlaceholder: "Enter a quote",
              captionPlaceholder: "Quote's author",
            },
          },

          hyperlink: {
            class: Hyperlink,
            config: {
              shortcut: "CMD+K",
              target: "_blank",
              rel: "nofollow",
              availableTargets: ["_blank", "_self"],
              availableRels: ["nofollow", "noreferrer", "noopener"],
              validate: false,
            },
          },

          marker: {
            class: Marker,
            shortcut: "CMD+SHIFT+H",
          },

          underline: Underline,

          delimiter: Delimiter,
        },
      });
    };

    initEditor().then(() => {});

    return () => {
      isMounted = false;
      if (editorRef.current && typeof editorRef.current.destroy === "function") {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload every pasted image ourselves — Editor.js's built-in image paste
  // handling only reacts to the tool matching the currently focused block,
  // so a multi-file paste (e.g. several files copied from Finder) only
  // uploads one image — and Google Docs pastes carry no image files at all,
  // only HTML with <img> tags pointing at Google's CDN. Intercepting in the
  // capture phase lets us take over whenever either case applies and leave
  // plain text/HTML paste alone.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (event: ClipboardEvent) => {
      // Ignore the synthetic paste event we redispatch below, so Google Docs
      // pastes don't get processed twice / loop.
      if (!event.isTrusted) return;

      const html = event.clipboardData?.getData("text/html") ?? "";
      const isGoogleDocsPaste = isGoogleDocsHtml(html);

      const files = event.clipboardData?.files;
      const imageFiles = files
        ? Array.from(files).filter((file) => file.type.startsWith("image/"))
        : [];

      if (!isGoogleDocsPaste && imageFiles.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const editor = editorRef.current;
      if (!editor) return;

      // Editor.js resolves the "current block" from the paste event's
      // target by walking up to the enclosing block element, so the
      // synthetic paste below must be re-dispatched on the exact node the
      // user pasted into — dispatching on the holder itself resolves to no
      // block and Editor.js silently drops the event
      const pasteTarget = event.target instanceof HTMLElement ? event.target : null;

      setIsUploading(true);
      // Blur so keystrokes during the upload don't land in the editor. We
      // avoid Editor.js's own readOnly mode here because it detaches its
      // paste listener, which the Google Docs path below still needs.
      pasteTarget?.blur();

      if (isGoogleDocsPaste) {
        if (!pasteTarget) {
          setIsUploading(false);
          return;
        }

        cleanGoogleDocsHtml(html)
          .then((cleanedHtml) => dispatchClipboardPaste(pasteTarget, cleanedHtml))
          .catch((error) => {
            console.error("Failed to process Google Docs paste:", error);
            toast.add({
              title: "Failed to process pasted content.",
              description: "Please try again.",
              type: "error",
            });
          })
          .finally(() => setIsUploading(false));
        return;
      }

      (async () => {
        try {
          const results = await Promise.allSettled(imageFiles.map(uploadImageFile));

          let insertIndex = editor.blocks.getCurrentBlockIndex();
          insertIndex = insertIndex >= 0 ? insertIndex + 1 : editor.blocks.getBlocksCount();

          let successCount = 0;
          let failureCount = 0;

          for (const result of results) {
            if (result.status === "fulfilled") {
              editor.blocks.insert("image", { file: { url: result.value } }, undefined, insertIndex, true);
              insertIndex++;
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
          setIsUploading(false);
        }
      })();
    };

    container.addEventListener("paste", handlePaste, true);

    return () => {
      container.removeEventListener("paste", handlePaste, true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative prose border rounded-md p-4 bg-background [&_.embed-tool]:w-full [&_img]:max-w-full [&_img]:h-auto"
    >
      <div
        id={`editorjs-${holderId}`}
        ref={holderRef}
        className={isUploading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}
      />

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-background/60 backdrop-blur-[1px]">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Uploading…</span>
        </div>
      )}
    </div>
  );
};

export default EditorJSComponent;