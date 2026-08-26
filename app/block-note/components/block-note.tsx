"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

import { UPLOAD_URL, UPLOAD_TOKEN } from "@/lib/utils";

const uploadFile = async (file: File): Promise<string> => {
  const data = new FormData();
  data.append("files", file);

  const res = await fetch(`${UPLOAD_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPLOAD_TOKEN}`,
    },
    body: data,
  });

  if (!res.ok) {
    throw new Error("Upload failed");
  }

  const response = await res.json();
  const imageUrl = Array.isArray(response) ? response[0]?.url : response.url;

  if (!imageUrl) {
    throw new Error("Invalid image URL returned from upload server");
  }

  return imageUrl;
};

export default function BlockNoteEditor() {
  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "paragraph",
        content: "Block Note",
      },
    ],
    uploadFile,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      console.log("Paste event:", event);
      const items = event.clipboardData?.items;
      if (!items) return defaultPasteHandler();

      for (const file of event.clipboardData?.files) {
        console.log("File from clipboard:", file.name, file.type, file.size);
      }

      const imageFiles: File[] = [];
      for (const item of items) {
        console.log("Item from clipboard:", item.type, item.kind);
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) {
        return defaultPasteHandler();
      }

      event.preventDefault();

      (async () => {
        for (const file of imageFiles) {
          try {
            const url = await uploadFile(file);
            editor.insertBlocks(
              [
                {
                  type: "image",
                  props: { url },
                },
              ],
              editor.getTextCursorPosition().block,
              "after"
            );
          } catch (error) {
            console.error("Failed to upload pasted image:", error);
          }
        }
      })();

      return true;
    },
  });

  return (
    <div className="w-full border rounded-md p-2">
      <BlockNoteView editor={editor} theme="light" />
    </div>
  );
}