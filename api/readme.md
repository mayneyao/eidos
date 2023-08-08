# Eidos API Example

`Eidos Web Client <== websocket ==> Eidos API Agent <== http ==> Any HTTP Client`

This communication flow involves a WebSocket connection between the Eidos API Agent and the Eidos Web Client, followed by an HTTP connection between the Eidos API Agent and any HTTP client, allowing the communication with the Eidos Web Client.

## Quick Start

1. Start an API Agent, which is an HTTP & WebSocket server running on port 3333:

   ```bash
   pnpm tsx ./api/main.ts
   ```

2. Open the Eidos Web Client, e.g., [https://eidos.space](https://eidos.space).

3. Configure the API Agent URL to `ws://localhost:3333` and click `connect`.

4. Query data from the API Agent using the following Python code:

   ```python
   import requests

   r = requests.post('http://localhost:3333/rpc', json={
       'space': 'eidos',
       'method': 'listTreeNodes',
       'params': []
   })
   print(r.json())
   ```

## Query Data

You can use any of the following functions to query data from the database:

- `sql4mainThread`
- `listTreeNodes`
- `listAllDays`
- `updateTreeNodeName`
- `listUiColumns`

To see all the available functions, refer to the [DataSpace.ts](/worker/DataSpace.ts) file.

To post a data query to the server, send the data in JSON format:

```json
{
  "space": "<database name>",
  "method": "sql4mainThread",
  "params": ["select * from tb_44d6193623544426873507e10f3cfd7f", [], "object"]
}
```

- `space`: The name of the database.
- `method`: The name of the function.
- `params`: The parameters of the function.

One of the most useful functions is `sql4mainThread`, which allows you to query data from the database:

```python
r = requests.post('http://localhost:3333/rpc', json={
    'space': 'eidos',
    'method': 'sql4mainThread',
    'params': [
        'select * from tb_44d6193623544426873507e10f3cfd7f where _id = ?;',
        [
            '5f8b3b6b3b3d4a3e8c4b4b2b4b4b4b4b',
        ],
        'object'
    ]
})
data = r.json()
for row in data['data']['result']:
    print(row['cl_xu38'])
```
