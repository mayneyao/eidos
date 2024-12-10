import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { BookmarkPlugin, INSERT_BOOKMARK_COMMAND } from "./plugin";
import { $createBookmarkNode, BOOKMARK_NODE_TRANSFORMER, BookmarkNode } from "./node";



export default {
    name: "Bookmark",
    node: BookmarkNode,
    plugin: BookmarkPlugin,
    icon: "BookMarked",
    keywords: ["bookmark", "link", "url"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, {
        url: "",
        title: "",
        description: "",
        image: "",
        fetched: false,
    }),
    command: {
        create: INSERT_BOOKMARK_COMMAND,
    },
    transformer: BOOKMARK_NODE_TRANSFORMER,
    createNode: $createBookmarkNode,
} as DocBlock;