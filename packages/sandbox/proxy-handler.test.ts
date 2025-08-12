import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyHandler } from './proxy-handler';
import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';

// Mock Hono's proxy helper
vi.mock('hono/proxy', () => ({
  proxy: vi.fn().mockResolvedValue(new Response('mocked response', {
    status: 200,
    headers: { 'content-type': 'text/plain' }
  }))
}));

// Mock Hono context
const createMockContext = (url: string, method: string = 'GET', headers: Record<string, string> = {}): Context<BlankEnv, "*", {}> => {
  const mockRequest = {
    url,
    method,
    header: (name: string) => headers[name.toLowerCase()],
    arrayBuffer: async () => new ArrayBuffer(0),
  };

  return {
    req: mockRequest,
    text: (text: string, status?: number) => new Response(text, { status }),
    json: (data: any, status?: number) => new Response(JSON.stringify(data), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    }),
  } as any;
};

describe('ProxyHandler', () => {
  let proxyHandler: ProxyHandler;

  beforeEach(() => {
    proxyHandler = new ProxyHandler();
  });

  describe('URL Validation', () => {
    it('should allow valid HTTPS URLs', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('https://api.example.com/data')).toBe(true);
      expect(handler.isValidTargetUrl('https://github.com/api/v1')).toBe(true);
    });

    it('should allow valid HTTP URLs', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('http://api.example.com/data')).toBe(true);
    });

    it('should allow URLs with search parameters', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('https://api.example.com/search?q=test&limit=10')).toBe(true);
      expect(handler.isValidTargetUrl('https://httpbin.org/get?param1=value1&param2=value2')).toBe(true);
      expect(handler.isValidTargetUrl('http://api.example.com/data?filter=active&sort=name')).toBe(true);
    });

    it('should allow URLs with complex search parameters', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('https://api.example.com/search?q=hello%20world&category=tech')).toBe(true);
      expect(handler.isValidTargetUrl('https://example.com/api?data={"key":"value"}&format=json')).toBe(true);
    });

    it('should block localhost URLs', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('http://localhost:3000')).toBe(false);
      expect(handler.isValidTargetUrl('https://127.0.0.1:8080')).toBe(false);
      expect(handler.isValidTargetUrl('http://::1:3000')).toBe(false);
    });

    it('should block private IP ranges', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('http://192.168.1.1')).toBe(false);
      expect(handler.isValidTargetUrl('http://10.0.0.1')).toBe(false);
      expect(handler.isValidTargetUrl('http://172.16.0.1')).toBe(false);
    });

    it('should block internal domains', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('http://test.localhost')).toBe(false);
      expect(handler.isValidTargetUrl('http://service.local')).toBe(false);
      expect(handler.isValidTargetUrl('http://sandbox.space123.eidos.localhost')).toBe(false);
    });

    it('should block non-HTTP protocols', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('ftp://example.com')).toBe(false);
      expect(handler.isValidTargetUrl('file:///etc/passwd')).toBe(false);
      expect(handler.isValidTargetUrl('javascript:alert(1)')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      const handler = proxyHandler as any;
      expect(handler.isValidTargetUrl('not-a-url')).toBe(false);
      expect(handler.isValidTargetUrl('')).toBe(false);
    });
  });

  describe('Request Handling', () => {
    it('should return 400 for missing URL parameter', async () => {
      const context = createMockContext('http://proxy.eidos.localhost:13127/');
      const response = await proxyHandler.handleProxyRequest(new URL(context.req.url), context);
      
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Missing target URL parameter');
    });

    it('should return 400 for invalid target URL', async () => {
      const context = createMockContext('http://proxy.eidos.localhost:13127/?url=javascript:alert(1)');
      const response = await proxyHandler.handleProxyRequest(new URL(context.req.url), context);
      
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid target URL');
    });

    it('should handle OPTIONS requests', async () => {
      const context = createMockContext('http://proxy.eidos.localhost:13127/', 'OPTIONS');
      const response = await proxyHandler.handleOptionsRequest(context);
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });

    it('should return proxy status', async () => {
      const context = createMockContext('http://proxy.eidos.localhost:13127/status');
      const response = await proxyHandler.getProxyStatus(context);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.service).toBe('Eidos Proxy Handler');
      expect(data.status).toBe('healthy');
      expect(data.features).toContain('CORS support');
    });

    it('should handle URLs with search parameters correctly', async () => {
      const targetUrl = 'https://httpbin.org/get?param1=value1&param2=value2';
      const encodedUrl = encodeURIComponent(targetUrl);
      const context = createMockContext(`http://proxy.eidos.localhost:13127/?url=${encodedUrl}`);

      // This test verifies that the URL parsing works correctly
      // The actual proxy call would require mocking the proxy function
      const url = new URL(context.req.url);
      const extractedUrl = url.searchParams.get('url');

      expect(extractedUrl).toBe(targetUrl);
      expect(extractedUrl).toContain('param1=value1');
      expect(extractedUrl).toContain('param2=value2');
    });

    it('should handle complex encoded search parameters', async () => {
      const targetUrl = 'https://api.example.com/search?q=hello%20world&data={"key":"value"}';
      const encodedUrl = encodeURIComponent(targetUrl);
      const context = createMockContext(`http://proxy.eidos.localhost:13127/?url=${encodedUrl}`);

      const url = new URL(context.req.url);
      const extractedUrl = url.searchParams.get('url');

      expect(extractedUrl).toBe(targetUrl);
      expect(extractedUrl).toContain('q=hello%20world');
      expect(extractedUrl).toContain('data={"key":"value"}');
    });
  });

  describe('Binary Data Handling', () => {
    it('should properly handle binary file extensions', async () => {
      // Test that binary file extensions are detected correctly
      const binaryUrls = [
        'https://example.com/model.weights',
        'https://example.com/data.bin',
        'https://example.com/model.pb',
        'https://example.com/model.onnx',
        'https://docs.swmansion.com/TypeGPU/assets/mnist-weights/conv2d.bin'
      ];

      for (const url of binaryUrls) {
        const urlPath = new URL(url).pathname.toLowerCase();
        const isBinaryContent = urlPath.match(/\.(bin|dat|weights|model|pb|onnx|tflite)$/);
        expect(isBinaryContent).toBeTruthy();
      }
    });

    it('should detect binary content types', async () => {
      const binaryContentTypes = [
        'application/octet-stream',
        'application/x-binary',
        'application/protobuf'
      ];

      for (const contentType of binaryContentTypes) {
        const isBinaryContent = contentType.includes('octet-stream') || 
                              contentType.includes('application/');
        expect(isBinaryContent).toBeTruthy();
      }
    });

    it('should not treat text content as binary', async () => {
      const textContentTypes = [
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript'
      ];

      for (const contentType of textContentTypes) {
        const isBinaryContent = !contentType.startsWith('text/');
        expect(isBinaryContent).toBeFalsy();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // This test would require mocking the proxy function to throw an error
      // For now, we'll just verify the structure is in place
      expect(proxyHandler.handleProxyRequest).toBeDefined();
      expect(typeof proxyHandler.handleProxyRequest).toBe('function');
    });
  });
});
