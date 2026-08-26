"use client";

import React from "react";

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
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomUploadAdapterPlugin(editor: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.plugins.get("FileRepository").createUploadAdapter = (loader: any) => {
    return {
      upload() {
        const uploadPromise = loader.file.then(
          (file: File) =>
            new Promise((resolve, reject) => {
              const data = new FormData();
              data.append("files", file);

              fetch(`${UPLOAD_URL}/api/upload`, {
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
                  const imageUrl = Array.isArray(response)
                    ? response[0]?.url
                    : response.url;

                  resolve({ default: imageUrl });
                })
                .catch((error) => reject(error));
            })
        );

        toast.promise(uploadPromise, {
          loading: "Uploading image...",
          success: "Image uploaded successfully!",
          error: "Failed to upload image.",
        }).then(() => {});

        return uploadPromise;
      },
    };
  };
}

const CKEditorComponent = () => {
  return (
    <CKEditor
      editor={ClassicEditor}
      data="<p>CKEditor</p>"
      onChange={(event, editor) => {
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
        extraPlugins: [CustomUploadAdapterPlugin],
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
  );
};

export default CKEditorComponent;