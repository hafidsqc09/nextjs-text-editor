"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const TiptapEditor = () => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Tiptap</p>",
    immediatelyRender: false,
  })

  return <EditorContent editor={editor} />
}

export default TiptapEditor;