"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

export default function BlockNoteEditor() {
  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "paragraph",
        content: "Block Note",
      },
    ]
  });

  return <BlockNoteView theme="light" editor={editor} />;
}