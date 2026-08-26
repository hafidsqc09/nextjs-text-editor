declare module "@editorjs/embed" {
  import { BlockTool } from "@editorjs/editorjs";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Embed: { new (config?: any): BlockTool };
  export default Embed;
}

declare module "@editorjs/marker" {
  import { InlineTool } from "@editorjs/editorjs";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Marker: { new (config?: any): InlineTool };
  export default Marker;
}

declare module "editorjs-text-alignment-blocktune" {
  import { BlockTune } from "@editorjs/editorjs";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AlignmentBlockTune: { new (config?: any): BlockTune };
  export default AlignmentBlockTune;
}

declare module "editorjs-hyperlink" {
  import { InlineTool } from "@editorjs/editorjs";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Hyperlink: { new (config?: any): InlineTool };
  export default Hyperlink;
}