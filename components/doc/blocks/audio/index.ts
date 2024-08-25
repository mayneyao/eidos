import { LexicalEditor } from "lexical";
import { DocBlock } from "../interface";
import { AudioPlugin, INSERT_AUDIO_FILE_COMMAND } from "./plugin";
import { $createAudioNode, AudioNode } from "./node";



export default {
    name: "Audio",
    node: AudioNode,
    plugin: AudioPlugin,
    icon: "AudioLines",
    keywords: ["audio", "mp3"],
    onSelect: (editor: LexicalEditor) => editor.dispatchCommand(INSERT_AUDIO_FILE_COMMAND, ''),
    command: {
        create: INSERT_AUDIO_FILE_COMMAND,
    },
    createNode: $createAudioNode,
} as DocBlock;