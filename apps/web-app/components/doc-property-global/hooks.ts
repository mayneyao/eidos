// Re-export all hooks and components from this module for cleaner imports
export { useDocProperty } from './hook';
export { useDocPropertyTypes } from './property-type-hook';
export type { PropertyType } from './property-type-hook';
export { PropertyMenu } from './property-menu';

// Also export the Zustand store for advanced use cases
export { useDocPropertyStore, useDocPropertySelectors } from '@/apps/web-app/store/doc-property-store';
