import * as React from "react";
import type EditorJS from "@editorjs/editorjs";
import type { OutputData } from "@editorjs/editorjs";

interface EditorJSProps {
  data?: OutputData;
}

const defaultInitialData: OutputData = {
  time: Date.now(),
  blocks: [
    {
      type: "paragraph",
      data: {
        text: "Editor.js",
      },
    },
  ],
  version: "2.28.2",
};

const EditorJSComponent: React.FC<EditorJSProps> = ({ data = defaultInitialData }) => {
  const editorRef = React.useRef<EditorJS | null>(null);

  React.useEffect(() => {
    let editorInstance: EditorJS | null = null;

    import("@editorjs/editorjs").then((Module) => {
      const EditorClass = Module.default;

      if (!editorRef.current) {
        editorInstance = new EditorClass({
          holder: "editorjs",
          data: data,
        });
        editorRef.current = editorInstance;
      }
    });

    return () => {
      if (editorRef.current) {
        const instance = editorRef.current;
        editorRef.current = null;

        if (typeof instance.destroy === "function") {
          instance.destroy();
        } else if (instance.isReady) {
          instance.isReady
            .then(() => {
              if (typeof instance.destroy === "function") {
                instance.destroy();
              }
            })
            .catch((err) => console.error("EditorJS cleanup error:", err));
        }
      }
    };
  }, []);

  return <div id="editorjs" />;
};

export default EditorJSComponent;