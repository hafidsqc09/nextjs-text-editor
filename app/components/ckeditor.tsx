"use client";

import React from "react";

import { Loader2Icon } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  ClassicEditor,
  Essentials,
  Paragraph,
  Bold,
  Italic,
  Underline,
  Alignment,
  Heading,
  FontSize,
  Link,
  List,
  CodeBlock,
  Table,
  TableToolbar,
  TableProperties,
  TableCellProperties,
  TableCaption,
  MediaEmbed,
  Strikethrough,
  Subscript,
  Superscript,
  BlockQuote,
  Highlight,
  FontBackgroundColor,
  FontColor,
  Indent,
  Image,
  ImageToolbar,
  ImageUpload,
  ImageInsert,
  ImageStyle,
  ImageCaption,
  ImageTextAlternative,
  LinkImage,
  ListProperties,
  PasteFromOffice,
  GeneralHtmlSupport,
  FontFamily,
  UpcastWriter,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";

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

function createUploadAdapterPlugin(onUploadStart: () => void, onUploadEnd: () => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function CustomUploadAdapterPlugin(editor: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.plugins.get("FileRepository").createUploadAdapter = (loader: any) => {
      return {
        upload() {
          onUploadStart();

          const uploadPromise = loader.file
            .then((file: File) => uploadFile(file))
            .then((imageUrl: string) => ({ default: imageUrl }));

          toast.promise(uploadPromise, {
            loading: "Uploading image...",
            success: "Image uploaded successfully!",
            error: "Failed to upload image.",
          }).then(() => {});

          uploadPromise.finally(onUploadEnd);

          return uploadPromise;
        },
      };
    };
  };
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

type ViewWriter = InstanceType<typeof UpcastWriter>;

// Walks a pasted-content view (sub)tree and collects every element matching
// `predicate`, fully materialized before any mutation happens — the caller
// is free to unwrap/rename/remove matches without invalidating the walk.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectElements(writer: ViewWriter, root: any, predicate: (el: any) => boolean): any[] {
  const matches = [];
  for (const item of writer.createRangeIn(root).getItems()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((item as any).name !== undefined && predicate(item)) matches.push(item);
  }
  return matches;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapChildrenInElement(writer: ViewWriter, target: any, tagName: string) {
  const wrapper = writer.createElement(tagName);
  const moved = writer.removeChildren(0, target.childCount, target);
  writer.appendChild(moved, wrapper);
  writer.insertChild(0, wrapper, target);
}

// Both apps represent formatting as presentational `style`/`class` soup
// (Word: `mso-*` styles and namespaced tags; Google Docs: inline styles on
// `<span>`) instead of semantic tags, and CKEditor's GeneralHtmlSupport
// preserves whatever survives verbatim. Converting the styles CKEditor's own
// toolbar can express into semantic tags, then stripping the rest, keeps
// pasted content consistent with the editor's own formatting.
//
// This mutates the pasted view tree IN PLACE via an UpcastWriter, rather
// than serializing to an HTML string and re-parsing it. Re-parsing would
// create brand-new view elements for everything, including any <img> — which
// severs the link between a base64/blob image CKEditor's own ImageUpload
// feature has already claimed (it marks such images `uploadProcessed`/
// `uploadId` in an inputTransformation listener that runs before this one,
// registering a pending upload against that exact element) and the upload it
// registered, leaving the image stuck with an empty src forever.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanOfficePasteView(writer: ViewWriter, root: any) {
  const gdocsWrapper = collectElements(
    writer,
    root,
    (el) => el.name === "b" && (el.getAttribute("id") ?? "").startsWith("docs-internal-guid")
  )[0];
  if (gdocsWrapper) writer.unwrapElement(gdocsWrapper);

  // Unwrap Word's namespaced elements (o:p, w:sdt, ...) while keeping their content.
  collectElements(writer, root, (el) => el.name.includes(":")).forEach((el) => writer.unwrapElement(el));

  // Convert style-based emphasis into semantic tags before the styles themselves are dropped.
  collectElements(writer, root, (el) => (el.name === "span" || el.name === "font") && el.hasAttribute("style")).forEach(
    (el) => {
      const isUnderline = /underline/i.test(el.getStyle("text-decoration") ?? "");
      const isItalic = (el.getStyle("font-style") ?? "").trim().toLowerCase() === "italic";
      const isBold = /^(bold|[7-9]00)$/i.test((el.getStyle("font-weight") ?? "").trim());

      const tags = [isBold && "strong", isItalic && "em", isUnderline && "u"].filter(Boolean) as string[];
      if (tags.length === 0) return;

      const current = writer.rename(tags[0], el);
      if (!current) return;
      for (const tag of tags.slice(1)) {
        wrapChildrenInElement(writer, current, tag);
      }
    }
  );

  // Strip remaining presentational cruft (re-walked fresh so it also covers
  // elements renamed/wrapped above, which inherit the original attributes).
  collectElements(writer, root, (el) => el.hasAttribute("class") || el.hasAttribute("style") || el.hasAttribute("lang")).forEach(
    (el) => {
      writer.removeAttribute("class", el);
      writer.removeAttribute("style", el);
      writer.removeAttribute("lang", el);
    }
  );

  // Unwrap now-inert span/font wrappers left with no attributes.
  collectElements(writer, root, (el) => el.name === "span" || el.name === "font").forEach((el) => writer.unwrapElement(el));

  // Drop empty paragraphs Word/Google Docs use as spacing artifacts.
  collectElements(writer, root, (el) => el.name === "p").forEach((p) => {
    const hasImage = collectElements(writer, p, (el) => el.name === "img").length > 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasText = Array.from(writer.createRangeIn(p).getItems()).some((item: any) => item.data?.trim());
    if (!hasImage && !hasText) writer.remove(p);
  });
}

// Not limited to Office pastes: any pasted content — Figma, a random web
// page, another app entirely — can carry `<img>` tags pointing at a
// third-party host. CKEditor's built-in upload-on-paste only triggers for
// base64/blob image sources, so those stay hotlinked unless we catch them
// here too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectForeignImages(writer: ViewWriter, root: any) {
  return collectElements(writer, root, (el) => el.name === "img" && isForeignImageSrc(el.getAttribute("src") ?? ""));
}

// Google Docs/Word/Figma pastes can reference images by URL (a CDN, or a
// Word Online temp host) rather than embedding files, so CKEditor's built-in
// upload-on-paste — which only triggers for base64/blob image sources —
// never picks them up. Re-upload them ourselves, mutating the existing <img>
// elements' `src` in place (same identity-preservation reasoning as the
// formatting cleanup above), so they don't stay linked to a third party.
//
// Fetching those URLs directly from the browser is unreliable: third-party
// CDNs don't consistently send Access-Control-Allow-Origin — some paths on
// the very same host allow it, others don't — so the fetch is routed through
// our own same-origin proxy route, which isn't subject to that browser-side
// CORS restriction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reuploadForeignImages(writer: ViewWriter, imgElements: any[]): Promise<number> {
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

        writer.setAttribute("src", await uploadFile(file), img);
      } catch (error) {
        failures++;
        console.warn("Could not re-upload pasted image, keeping the original URL:", error);
      }
    })
  );

  return failures;
}

function createPasteHandlingPlugin(onUploadStart: () => void, onUploadEnd: () => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function PasteHandlingPlugin(editor: any) {
    const clipboardPipeline = editor.plugins.get("ClipboardPipeline");

    // Registered between PasteFromOffice's own normalization (priority
    // low+10) and the pipeline's default insertion listener (priority low),
    // so this runs on top of, not instead of, CKEditor's built-in Office
    // handling (e.g. Word's fake-list-paragraph-to-<ul>/<ol> conversion).
    clipboardPipeline.on(
      "inputTransformation",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (evt: any, data: any) => {
        const rawHtml = data.dataTransfer.getData("text/html") ?? "";
        const writer: ViewWriter = new UpcastWriter(data.content.document);

        // Word/Google Docs-specific formatting cleanup. Scoped to those
        // sources only — stripping style/class wholesale would be wrong for
        // a paste from a generic site (Figma, another web page, ...) where
        // GeneralHtmlSupport is meant to preserve that formatting. Mutates
        // data.content in place; no reassignment needed.
        if (isOfficePasteHtml(rawHtml)) {
          cleanOfficePasteView(writer, data.content);
        }

        // Foreign-image re-upload applies to any paste source, not just
        // Office — Figma, a random web page, or anywhere else can paste an
        // <img> pointing at a third-party host.
        const foreignImages = collectForeignImages(writer, data.content);
        if (foreignImages.length === 0) return;

        // Re-uploading images is asynchronous but this event is not, so stop
        // the default (synchronous) insertion and insert the final content
        // ourselves once the images are ready.
        evt.stop();
        onUploadStart();

        reuploadForeignImages(writer, foreignImages)
          .then((failures) => {
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

            const modelFragment = editor.data.toModel(data.content, "$clipboardHolder");
            editor.model.insertContent(modelFragment);
          })
          .catch((error: unknown) => {
            console.error("Failed to process pasted content:", error);
            toast.add({
              title: "Failed to process pasted content.",
              description: "Please try again.",
              type: "error",
            });
          })
          .finally(() => {
            onUploadEnd();
          });
      },
      { priority: -995 }
    );
  };
}

// Lock id used to hold the editor in read-only mode while any image upload
// (toolbar/drag-drop, or a paste-triggered re-upload) is in flight — enabled
// once when the first upload starts and lifted once the last one finishes,
// regardless of how many overlap, since CKEditor's readOnly lock set is
// keyed by lock id rather than reference-counted.
const UPLOAD_READ_ONLY_LOCK = "image-upload";

const CKEditorComponent = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = React.useRef<any>(null);
  const [uploadCount, setUploadCount] = React.useState(0);
  const isUploading = uploadCount > 0;

  const handleUploadStart = React.useCallback(() => {
    setUploadCount((count) => count + 1);
  }, []);

  const handleUploadEnd = React.useCallback(() => {
    setUploadCount((count) => Math.max(0, count - 1));
  }, []);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (isUploading) {
      editor.enableReadOnlyMode(UPLOAD_READ_ONLY_LOCK);
    } else {
      editor.disableReadOnlyMode(UPLOAD_READ_ONLY_LOCK);
    }
  }, [isUploading]);

  return (
    <div className="relative">
      <div className={isUploading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        <CKEditor
          editor={ClassicEditor}
          data="<p>CKEditor</p>"
          onReady={(editor) => {
            editorRef.current = editor;
          }}
          onChange={(_event, editor) => {
            const data = editor.getData();
            console.log("CKEditor Content Changed:", data);
          }}
          config={{
            licenseKey: "GPL",
            heading: {
              options: [
                { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
                { model: "heading1", view: "h1", title: "Heading 1", class: "ck-heading_heading1" },
                { model: "heading2", view: "h2", title: "Heading 2", class: "ck-heading_heading2" },
                { model: "heading3", view: "h3", title: "Heading 3", class: "ck-heading_heading3" },
                { model: "heading4", view: "h4", title: "Heading 4", class: "ck-heading_heading4" },
                { model: "heading5", view: "h5", title: "Heading 5", class: "ck-heading_heading5" },
                { model: "heading6", view: "h6", title: "Heading 6", class: "ck-heading_heading6" },
              ]
            },
            fontSize: {
              options: [
                "10px",
                "11px",
                "12px",
                "13px",
                "14px"
              ]
            },
            fontFamily: {
              options: [
                "default",
                "Arial, Helvetica, sans-serif",
                "Courier New, Courier, monospace",
                "Georgia, serif",
                "Lucida Sans Unicode, Lucida Grande, sans-serif",
                "Tahoma, Geneva, sans-serif",
                "Times New Roman, Times, serif",
                "Trebuchet MS, Helvetica, sans-serif",
                "Verdana, Geneva, sans-serif",
                "Calibri, Carlito, pt-sans, sans-serif",
              ],
              supportAllValues: true,
            },
            extraPlugins: [
              createUploadAdapterPlugin(handleUploadStart, handleUploadEnd),
              createPasteHandlingPlugin(handleUploadStart, handleUploadEnd),
            ],
            plugins: [
              Essentials,
              Paragraph,
              Bold,
              Italic,
              Underline,
              Alignment,
              Heading,
              FontSize,
              Link,
              List,
              CodeBlock,
              Table,
              TableToolbar,
              TableProperties,
              TableCellProperties,
              TableCaption,
              MediaEmbed,
              Strikethrough,
              Subscript,
              Superscript,
              BlockQuote,
              Highlight,
              FontBackgroundColor,
              FontColor,
              Indent,
              ImageUpload,
              ImageInsert,
              Image,
              ImageToolbar,
              ImageStyle,
              ImageCaption,
              ImageTextAlternative,
              LinkImage,
              ListProperties,
              PasteFromOffice,
              GeneralHtmlSupport,
              FontFamily,
            ],
            htmlSupport: {
              allow: [
                {
                  name: /.*/,
                  attributes: true,
                  classes: true,
                  styles: true,
                },
              ],
            },
            toolbar: [
              "heading", "|",
              "imageUpload", "|",
              "alignment", "|",
              "fontFamily", "fontSize", "|",
              "bold", "italic", "underline", "|",
              "link", "|",
              "bulletedList", "numberedList", "|",
              "codeBlock", "|",
              "insertTable", "|",
              "blockQuote", "|",
              "undo", "redo", "|",
              "outdent", "indent", "|",
              "highlight", "fontBackgroundColor", "fontColor", "|",
              "strikethrough", "subscript", "superscript", "|",
              "mediaEmbed",
            ],
            table: {
              contentToolbar: [
                "tableColumn",
                "tableRow",
                "mergeTableCells",
                "tableProperties",
                "tableCellProperties",
                "tableCaption"
              ],
            },
            link: {
              decorators: {
                openInNewTab: {
                  mode: "manual",
                  label: "Open in New Tab",
                  attributes: {
                    target: "_blank",
                  },
                },
                noFollow: {
                  mode: "manual",
                  label: "No Follow",
                  attributes: {
                    rel: "nofollow",
                  },
                },
                noReferrer: {
                  mode: "manual",
                  label: "No Referrer",
                  attributes: {
                    rel: "noreferrer",
                  },
                },
                noOpener: {
                  mode: "manual",
                  label: "No Opener",
                  attributes: {
                    rel: "noopener",
                  },
                },
                useCustomClass: {
                  mode: "manual",
                  label: "Use Custom Class",
                  attributes: {
                    class: "custom-class",
                  },
                },
              },
            },
            image: {
              toolbar: [
                "imageStyle:alignLeft",
                "imageStyle:alignCenter",
                "imageStyle:alignRight",
                "|",
                "imageStyle:block",
                "imageStyle:side",
                "|",
                "toggleImageCaption",
                "|",
                "imageTextAlternative",
                "|",
                "linkImage"
              ]
            },
            list: {
              properties: {
                styles: {
                  useAttribute: true
                },
                startIndex: true,
                reversed: true,
              },
            },
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
};

export default CKEditorComponent;
