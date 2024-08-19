import { DocBlock } from './interface';
import mermaidBlock from './mermaid';
import videoBlock from './video';
import audioBlock from './audio';

export const BuiltInBlocks: DocBlock[] = [
    audioBlock,
    videoBlock,
    mermaidBlock,
];
