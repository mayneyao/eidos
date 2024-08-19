import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { $createMermaidNode, MERMAID_NODE_TRANSFORMER, MermaidNode } from "./node";
import { INSERT_MERMAID_COMMAND, MermaidPlugin } from "./plugin";

const text = `graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
`;
export default {
    name: "Mermaid",
    node: MermaidNode,
    plugin: MermaidPlugin,
    icon: "AreaChart",
    keywords: ["Mermaid", "chart"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_MERMAID_COMMAND, text),
    command: {
        create: INSERT_MERMAID_COMMAND,
    },
    createNode: $createMermaidNode,
    transform: MERMAID_NODE_TRANSFORMER,
    markdownLanguage: "mermaid",
} as DocBlock;