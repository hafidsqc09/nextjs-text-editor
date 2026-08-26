import * as React from "react";
import { Metadata } from "next";

import TiptapEditor from "@/app/tiptap/components/tiptap";

export const metadata: Metadata = {
  title: "Tiptap",
};

export default function Tiptap() {
  return (
    <React.Fragment>
      <TiptapEditor />
    </React.Fragment>
  );
}
