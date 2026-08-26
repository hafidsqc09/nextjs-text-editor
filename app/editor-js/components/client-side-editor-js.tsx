"use client";

import dynamic from "next/dynamic";

const EditorJSComponent = dynamic(
  () => import("@/app/editor-js/components/editor-js"),
  { ssr: false }
);

export default function ClientSideEditorJs() {
  return <EditorJSComponent />;
}