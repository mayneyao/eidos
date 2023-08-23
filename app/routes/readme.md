intercept request from client. every route file have to export a function to handle request from client and export a pathname to match the request

_remember to register the route file to `app\routes\index.ts`_

```js
/**
 * 1. string: match the pathname, only same origin pathname will be matched
 * 2. function: custom match rule, return true or false
 * export const pathname = string |(url:URL) => boolean
 */
export const pathname = "/hello"
export default function handler(event: FetchEvent) {
  // your logic here
  event.respondWith(new Response("hello world"))
}
```
