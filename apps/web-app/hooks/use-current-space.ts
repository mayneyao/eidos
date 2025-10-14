// No longer need React hooks, get synchronously
import { isDesktopMode } from '@/lib/env';

export interface SpaceInfo {
  id: string;
  name: string;
  path: string;
}

/**
 * 从子域名提取工作空间 ID
 * 例如：从 "my-workspace.eidos.localhost" 提取 "my-workspace"
 */
function extractSpaceIdFromHostname(hostname: string): string | null {
  // Check if it's a subdomain of eidos.localhost
  if (hostname.endsWith('.eidos.localhost')) {
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[0]; // Return first part as workspace ID
    }
  }
  return null;
}

/**
 * 检测当前工作空间 ID
 */
function detectCurrentSpaceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  
  // In desktop mode, extract workspace ID from subdomain
  if (isDesktopMode) {
    return extractSpaceIdFromHostname(hostname);
  }
  
  // In web mode, extract from URL path (maintain backward compatibility)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  return pathParts[0] || null;
}

/**
 * 获取当前工作空间信息的钩子
 * 简化版本，直接同步获取基本信息
 */
export const useCurrentSpace = () => {
  const spaceId = detectCurrentSpaceId();
  
  if (!spaceId) {
    return {
      currentSpace: null,
      isLoading: false,
      error: null,
      reload: () => {}
    };
  }

  // Return basic info directly, no async operation needed
  const currentSpace: SpaceInfo = {
    id: spaceId,
    name: spaceId.charAt(0).toUpperCase() + spaceId.slice(1),
    path: ''
  };

  return {
    currentSpace,
    isLoading: false,
    error: null,
    reload: () => {}
  };
};

/**
 * 获取当前工作空间 ID 的简单钩子
 * 直接从域名同步获取，无需状态管理
 */
export const useCurrentSpaceId = (): string | null => {
  // Direct synchronous detection, no useState and useEffect needed
  return detectCurrentSpaceId();
};
