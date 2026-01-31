
import { createEidosClient } from './src/index';

async function test() {
  console.log('--- Testing Eidos RPC Client (DataSpace Types) ---');
  
  const eidos = createEidosClient({
    endpoint: 'http://localhost:3000/rpc'
  });

  try {
    // 1. Test tree.list()
    console.log('\n1. Testing eidos.currentSpace.tree.list()');
    const nodes = await (eidos.currentSpace.tree as any).list();
    console.log('Success! Found', nodes?.length || 0, 'nodes.');
    
    const tableNode = nodes?.find((n: any) => n.type === 'table');
    if (tableNode) {
      console.log('Found a table:', tableNode.name, 'with ID:', tableNode.id);
      
      // 2. Test table().findMany()
      console.log(`\n2. Testing eidos.currentSpace.table("${tableNode.id}").findMany()`);
      const records = await eidos.currentSpace.table(tableNode.id).findMany({
        take: 5
      });
      console.log('Success! Found', records.length, 'records.');
    } else {
      console.log('No table nodes found to test findMany.');
    }

    // 3. Test graft.status()
    console.log('\n3. Testing eidos.currentSpace.graft.status()');
    const status = await (eidos.currentSpace as any).graft.status();
    console.log('Success! Status:', status);

    console.log('\n--- All tests passed! ---');
  } catch (error: any) {
    console.error('\nTest failed!');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

test();
