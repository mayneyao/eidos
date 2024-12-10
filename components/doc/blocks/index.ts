import { DocBlock } from './interface';
import mermaidBlock from './mermaid';
import videoBlock from './video';
import audioBlock from './audio';
import fileBlock from './file';
import customBlock from './custom';
import bookmarkBlock from './bookmark';

export const BuiltInBlocks: DocBlock[] = [
    audioBlock,
    videoBlock,
    fileBlock,
    mermaidBlock,
    customBlock,
    bookmarkBlock,
];