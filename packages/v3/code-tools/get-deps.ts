import { parseSync, type Program } from 'oxc-parser';


export function getImportsFromCode(code: string): string[] {
    const imports = new Set<string>();

    if (!code) {
        return [];
    }

    try {
        const ast: Program = parseSync("file.tsx", code).program;

        function walk(node: any, visitor: (node: any) => void) {
            if (!node) return;

            visitor(node);

            if (Array.isArray(node)) {
                for (const item of node) {
                    walk(item, visitor);
                }
                return
            }

            if (typeof node === 'object') {
                for (const key in node) {
                    if (key !== 'span') {
                        walk((node as any)[key], visitor);
                    }
                }
            }
        }

        walk(ast, (node: any) => {
            if (node) {
                if (node.type === 'ImportDeclaration' && node.source?.value) {
                    imports.add(node.source.value);
                }
                if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
                    const sourceValue = node.source.value;
                    if (!sourceValue.startsWith('http://') && !sourceValue.startsWith('https://')) {
                        imports.add(sourceValue);
                    }
                }
            }
        });
    } catch (e) {
        // Fallback to regex for robustness if oxc fails
        console.error("Failed to parse with oxc, falling back to regex", e);

        // Regex for imports like: import ... from "module";
        const fromImportRegex = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"];?/g;
        let match;
        while ((match = fromImportRegex.exec(code)) !== null) {
            imports.add(match[1]);
        }

        // Regex for side-effect imports like: import "module";
        const sideEffectImportRegex = /import\s+['"](.*?)['"];?/g;
        while ((match = sideEffectImportRegex.exec(code)) !== null) {
            imports.add(match[1]);
        }
    }

    return Array.from(imports);
}


const HOST_URL = ''
export async function generateImportMap(
    {
        thirdPartyLibs,
        uiLibs,
        cssLibs = [],
        localLibs = [],
    }: {
        thirdPartyLibs: string[],
        uiLibs: string[],
        cssLibs: string[],
        localLibs: string[],
    },
    spaceId: string,
) {
    const REACT_VERSION = '18.3.1';

    const imports: Record<string, string> = {
        'react': `https://esm.sh/stable/react@${REACT_VERSION}`,
        'react/jsx-runtime': `https://esm.sh/stable/react@${REACT_VERSION}/jsx-runtime`,
        'react-dom': `https://esm.sh/stable/react-dom@${REACT_VERSION}`,
        'react-dom/client': `https://esm.sh/stable/react-dom@${REACT_VERSION}/client`,
        clsx: "https://esm.sh/clsx@2.1.1",
        "tailwind-merge": "https://esm.sh/tailwind-merge",
        "@/lib/utils": `${HOST_URL}/compiled-ui/utils.js`,
    };
    // map localLibs to sandbox.<spaceId>.eidos.localhost:13127/<lib>.js
    localLibs.forEach((dep) => {
        const libName = dep.split('/').pop();
        imports[dep] = `http://sandbox.${spaceId}.eidos.localhost:13127/${libName}.js`;
    });

    thirdPartyLibs.forEach((dep) => {
        if (dep === "react" || dep === "react-dom") return;
        // const shouldExternalizeReact = Array.from(uiLibDeps).some(pattern => {
        //     if (pattern.endsWith('*')) {
        //         const prefix = pattern.slice(0, -1);
        //         return dep.startsWith(prefix);
        //     }
        //     return dep === pattern;
        // });
        // if (shouldExternalizeReact) {
        //     imports[dep] = `https://esm.sh/${dep}?external=react,react-dom`;
        // } else {
        //     imports[dep] = `https://esm.sh/${dep}?deps=react@${REACT_VERSION}`;
        // }
        // all third party libs use external react and react-dom. avoid multiple versions of react and react-dom
        imports[dep] = `https://esm.sh/${dep}?external=react,react-dom`;

    });


    for (const dep of uiLibs) {
        let componentId = `@/components/ui/${dep}`;
        if (dep.startsWith("use-")) {
            componentId = `@/hooks/${dep}`;
        }
        imports[componentId] = `${HOST_URL}/compiled-ui/${dep}.js`;
    }

    const importMapScript = `
  <script type="importmap">
    ${JSON.stringify({ imports }, null, 2)}
  </script>
  `;

    const linkCreationStatements = cssLibs.map(cssFile => {
        let cssUrl = '';
        if (cssFile.startsWith('@/')) {
            cssUrl = `${HOST_URL}${cssFile.replace('@', '')}`;
        } else {
            cssUrl = `https://esm.sh/${cssFile}`;
        }
        return `
        <link rel="stylesheet" href="${cssUrl}" crossorigin="anonymous"/>
    `;
    }).join('\n    ');

    const cssLoaderScript = cssLibs.length > 0 ? linkCreationStatements : '';

    return {
        importMapScript,
        cssLoaderScript,
        cleanup: () => {
        },
    };
}

/**
 * Get external libraries from code imports
 * - ./ are local packages
 * - @/ prefixed packages are path-mapped local packages
 * - Everything else are ext-libs (external libraries)
 */
export function getExtLibs(code: string): string[] {
    const imports = getImportsFromCode(code);
    const extLibs: string[] = [];

    for (const importPath of imports) {
        // Skip local packages (starting with ./)
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            continue;
        }

        // Skip path-mapped local packages (starting with @/)
        if (importPath.startsWith('@/')) {
            continue;
        }

        // Skip CSS files as they are typically handled separately
        if (importPath.endsWith('.css')) {
            continue;
        }

        // Everything else is considered an external library
        extLibs.push(importPath);
    }

    return extLibs;
}

export function getAllLibs(code: string, uiComponentsDependencies: Record<string, { thirdPartyLibs: string[], uiLibs: string[] }>, processedComponents = new Set<string>()) {
    if (!code) return {
        thirdPartyLibs: [],
        uiLibs: [],
        cssLibs: [],
        localLibs: [],
    };

    const dependencies = getImportsFromCode(code);
    const thirdPartyLibsMasterSet = new Set<string>();
    const initialUiLibNames = new Set<string>();
    const cssLibsSet = new Set<string>();
    const localLibsSet = new Set<string>();

    // Phase 1: Categorize direct imports from the input code
    for (const dep of dependencies) {
        if (dep.endsWith(".css")) {
            cssLibsSet.add(dep);
        } else if (dep.startsWith("@/components/ui/")) {
            initialUiLibNames.add(dep.replace("@/components/ui/", ""));
        } else if (dep.startsWith("@/hooks/")) { // Handle hooks as potential UI libs
            initialUiLibNames.add(dep.replace("@/hooks/", ""));
        } else if (dep.startsWith("./") || dep.startsWith("../")) {
            localLibsSet.add(dep);
        } else if (!dep.startsWith("@/")) {
            thirdPartyLibsMasterSet.add(dep);
        }
    }

    const allFoundUiLibNames = new Set<string>(initialUiLibNames);
    const queue = Array.from(initialUiLibNames);

    // Phase 2: Process transitive dependencies for UI libraries
    while (queue.length > 0) {
        const uiLibName = queue.shift();

        if (!uiLibName || processedComponents.has(uiLibName)) {
            continue;
        }
        processedComponents.add(uiLibName);

        const componentDeps = uiComponentsDependencies[uiLibName as keyof typeof uiComponentsDependencies];
        if (componentDeps) {
            if (componentDeps.thirdPartyLibs) {
                componentDeps.thirdPartyLibs.forEach(lib => thirdPartyLibsMasterSet.add(lib));
            }
            if (componentDeps.uiLibs) {
                componentDeps.uiLibs.forEach(transitiveUiLibName => {
                    if (!allFoundUiLibNames.has(transitiveUiLibName)) {
                        allFoundUiLibNames.add(transitiveUiLibName);
                        queue.push(transitiveUiLibName);
                    }
                });
            }
        }
    }

    return {
        thirdPartyLibs: Array.from(thirdPartyLibsMasterSet),
        uiLibs: Array.from(allFoundUiLibNames),
        cssLibs: Array.from(cssLibsSet),
        localLibs: Array.from(localLibsSet),
    };
}


