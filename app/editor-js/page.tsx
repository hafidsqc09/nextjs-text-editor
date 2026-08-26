import * as React from "react";
import { Metadata } from "next";

import ClientSideEditorJs from "@/app/editor-js/components/client-side-editor-js";

export const metadata: Metadata = {
  title: "Editor.js",
};

export default function EditorJS() {
  return (
    <React.Fragment>
      <ClientSideEditorJs />
    </React.Fragment>
  );
}
