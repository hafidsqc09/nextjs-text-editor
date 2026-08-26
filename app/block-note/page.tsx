import * as React from "react";
import { Metadata } from "next";

import { ClientSideBlockNoteEditor } from "@/app/block-note/components/client-side-block-note";

export const metadata: Metadata = {
  title: "Block Note",
};

export default function BlockNote() {
  return (
    <React.Fragment>
      <ClientSideBlockNoteEditor />
    </React.Fragment>
  );
}
