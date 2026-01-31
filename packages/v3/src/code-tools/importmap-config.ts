/**
 * Import Map Configuration
 * Centralized management of all external dependencies and their versions
 */

export const REACT_VERSION = '18.3.1';
export const ESM_SERVER = 'esm.sh';

/**
 * Core dependencies with fixed versions
 * Format: packageName -> version or empty string for latest
 */
export const CORE_DEPENDENCIES: Record<string, string> = {
    'clsx': '2.1.1',
    'tailwind-merge': '', // latest
    'zustand': '5',
    'class-variance-authority': '0.7.1',
};

/**
 * Eidos official packages with versions
 */
export const EIDOS_PACKAGES: Record<string, string> = {
    '@eidos.space/react': '0.27.0',
};

/**
 * Radix UI packages with versions
 */
export const RADIX_PACKAGES: Record<string, string> = {
    '@radix-ui/react-icons': '1.3.2',
    '@radix-ui/react-toast': '1.2.14',
};

/**
 * External dependencies that should be externalized (not bundled)
 * These will be loaded from CDN with external react/react-dom
 */
export const EXTERNALIZED_PACKAGES: string[] = [
    // Add package names here if they need to be externalized
];

/**
 * Build the full esm.sh URL for a package
 * All packages use /stable/ path for better performance and reliability
 */
export function buildEsmUrl(
    packageName: string, 
    version: string, 
    external?: string[]
): string {
    const versionSuffix = version ? `@${version}` : '';
    const externalParam = external && external.length > 0 
        ? `?external=${external.join(',')}` 
        : '';
    return `https://${ESM_SERVER}/stable/${packageName}${versionSuffix}${externalParam}`;
}

/**
 * Get the import map for all core dependencies
 */
export function getCoreImportMap(): Record<string, string> {
    const imports: Record<string, string> = {
        // React core
        'react': buildEsmUrl('react', REACT_VERSION),
        'react/jsx-runtime': buildEsmUrl('react', REACT_VERSION) + '/jsx-runtime',
        'react-dom': buildEsmUrl('react-dom', REACT_VERSION),
        'react-dom/client': buildEsmUrl('react-dom', REACT_VERSION) + '/client',
        
        // Core dependencies
        'clsx': buildEsmUrl('clsx', CORE_DEPENDENCIES['clsx']),
        'tailwind-merge': buildEsmUrl('tailwind-merge', CORE_DEPENDENCIES['tailwind-merge']),
        'class-variance-authority': buildEsmUrl('class-variance-authority', CORE_DEPENDENCIES['class-variance-authority']),
        
        // State management
        'zustand': buildEsmUrl('zustand', CORE_DEPENDENCIES['zustand'], ['react']),
        
        // Eidos packages
        '@eidos.space/react': buildEsmUrl('@eidos.space/react', EIDOS_PACKAGES['@eidos.space/react'], ['react', 'zustand']),
        
        // Radix UI packages
        '@radix-ui/react-icons': buildEsmUrl('@radix-ui/react-icons', RADIX_PACKAGES['@radix-ui/react-icons'], ['react', 'react-dom']),
        '@radix-ui/react-toast': buildEsmUrl('@radix-ui/react-toast', RADIX_PACKAGES['@radix-ui/react-toast'], ['react', 'react-dom']),
    };
    
    return imports;
}

/**
 * Get version for a specific package
 */
export function getPackageVersion(packageName: string): string | undefined {
    if (packageName === 'react' || packageName === 'react-dom') {
        return REACT_VERSION;
    }
    return (
        CORE_DEPENDENCIES[packageName] ??
        EIDOS_PACKAGES[packageName] ??
        RADIX_PACKAGES[packageName]
    );
}
