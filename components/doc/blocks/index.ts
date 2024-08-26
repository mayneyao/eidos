import { DocBlock } from './interface';
import mermaidBlock from './mermaid';
import videoBlock from './video';
import audioBlock from './audio';
import fileBlock from './file';

export const BuiltInBlocks: DocBlock[] = [
    audioBlock,
    videoBlock,
    fileBlock,
    mermaidBlock,
];
