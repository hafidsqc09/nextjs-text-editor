"use client";

import React from "react";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import { ClassicEditor, Essentials, Paragraph, Bold, Italic } from "ckeditor5";
import "ckeditor5/ckeditor5.css";

const CKEditorComponent = () => {
  return (
    <CKEditor
      editor={ClassicEditor}
      data="<p>CKEditor</p>"
      config={{
        licenseKey: "GPL",
        plugins: [Essentials, Paragraph, Bold, Italic],
        toolbar: ["undo", "redo", "|", "bold", "italic"]
      }}
    />
  );
};

export default CKEditorComponent;