import * as React from "react";
import { Metadata } from "next";

import ClientSideCKEditor from "@/app/components/client-side-ckeditor";

export const metadata: Metadata = {
  title: "CKEditor",
};

export default function CKEditor() {
  return (
    <React.Fragment>
      <ClientSideCKEditor />
    </React.Fragment>
  );
}
