import { DocBlock } from './interface';
import mermaidBlock from './mermaid';
import videoBlock from './video';
import audioBlock from './audio';
import fileBlock from './file';
import customBlock from './custom';
import bookmarkBlock from './bookmark';
import imageBlock from './image';
import youtubeBlock from './youtube';


// inline block
import sqlBlock from './sql';
import mentionBlock from './mention';

// other block
import tocBlock from './toc';
import syncBlock from './sync';
import databaseBlock from './database';

export const BuiltInBlocks: DocBlock[] = [
    // transform order: image > bookmark 
    imageBlock,
    audioBlock,
    videoBlock,
    fileBlock,
    mermaidBlock,
    customBlock,
    bookmarkBlock,
    sqlBlock,
    mentionBlock,
    tocBlock,
    youtubeBlock,
    syncBlock,
    // databaseBlock will cause import error
    // databaseBlock, 
];
export const getBuiltInNodes = () => BuiltInBlocks.map(block => block.node)
