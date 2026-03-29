import { markdown2lexical } from './dist/index.js';

// 场景1：在中间插入新段落
console.log('=== Scene 1: Insert paragraph in middle ===');
const md1a = `# Title

Paragraph 1

- Item 1
- Item 2`;

const md1b = `# Title

Paragraph 1

**NEW PARAGRAPH**

- Item 1
- Item 2`;

async function scene1() {
  const s1 = JSON.parse(await markdown2lexical(md1a));
  const s2 = JSON.parse(await markdown2lexical(md1b, [], [], {
    oldState: JSON.stringify(s1),
    oldMarkdown: md1a,
    useASTDiff: true,
    useHarness: false,
  }));
  
  // 找到 Item 1 text 节点
  const findItem1 = (s) => {
    for (const n of s.root.children) {
      if (n.type === 'list') {
        for (const li of n.children) {
          if (li.type === 'listitem') {
            return li.children[0]?.$?.pid;
          }
        }
      }
    }
    return null;
  };
  
  const oldId = findItem1(s1);
  const newId = findItem1(s2);
  
  console.log('Item 1 old ID:', oldId?.slice(0, 16));
  console.log('Item 1 new ID:', newId?.slice(0, 16));
  console.log('Preserved:', oldId === newId ? '✓ YES' : '✗ NO');
}

// 场景2：修改内容
console.log('\n=== Scene 2: Edit content ===');
const md2a = `### Old Title`;
const md2b = `### New Title`;

async function scene2() {
  const s1 = JSON.parse(await markdown2lexical(md2a));
  const s2 = JSON.parse(await markdown2lexical(md2b, [], [], {
    oldState: JSON.stringify(s1),
    oldMarkdown: md2a,
    useASTDiff: true,
    useHarness: false,
  }));
  
  const oldTextId = s1.root.children[0].children[0]?.$?.pid;
  const newTextId = s2.root.children[0].children[0]?.$?.pid;
  
  console.log('Text old ID:', oldTextId?.slice(0, 16));
  console.log('Text new ID:', newTextId?.slice(0, 16));
  console.log('Preserved (same position):', oldTextId === newTextId ? '✓ YES' : '✗ NO');
}

async function main() {
  await scene1();
  await scene2();
}

main();
