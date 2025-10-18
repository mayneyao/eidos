import { parseSync } from 'oxc-parser';

function extractFunction(code: string, functionName: string): string | null {
    // Quick check: if function name doesn't exist in code, return null immediately
    if (!code.includes(functionName)) {
        return null;
    }

    const ast = parseSync("file.tsx", code).program;

    for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration' && node.id && node.id.name === functionName) {
            return code.slice(node.start, node.end);
        }
        if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'FunctionDeclaration' && node.declaration.id && node.declaration.id.name === functionName) {
            return code.slice(node.declaration.start, node.declaration.end);
        }
    }

    return null;
}

function extractConstant(code: string, constantName: string): any {
    // Quick check: if constant name doesn't exist in code, return null immediately
    if (!code.includes(constantName)) {
        return null;
    }

    const ast = parseSync("file.tsx", code).program;

    // Helper function to convert AST node to actual value
    function nodeToValue(node: any): any {
        if (!node) return null;

        switch (node.type) {
            case 'Literal':
                return node.value;
            case 'StringLiteral':
                return node.value;
            case 'NumericLiteral':
                return node.value;
            case 'BooleanLiteral':
                return node.value;
            case 'NullLiteral':
                return null;
            case 'ArrayExpression':
                return node.elements.map((element: any) => nodeToValue(element));
            case 'ObjectExpression':
                const obj: any = {};
                for (const prop of node.properties) {
                    if (prop.type === 'Property') {
                        const key = prop.key.type === 'Identifier' ? prop.key.name :
                            prop.key.type === 'StringLiteral' ? prop.key.value : nodeToValue(prop.key);
                        obj[key] = nodeToValue(prop.value);
                    }
                }
                return obj;
            case 'Identifier':
                // For identifiers, we can't resolve their values from AST alone
                return `__IDENTIFIER_${node.name}__`;
            default:
                // For complex expressions, return a placeholder
                return `__COMPLEX_EXPRESSION_${node.type}__`;
        }
    }

    for (const node of ast.body) {
        // Handle direct export: export const CONSTANT = value;
        if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'VariableDeclaration') {
            for (const declarator of node.declaration.declarations) {
                if (declarator.id && declarator.id.type === 'Identifier' && declarator.id.name === constantName) {
                    return nodeToValue(declarator.init);
                }
            }
        }

        // Handle export { CONSTANT }; pattern
        if (node.type === 'ExportNamedDeclaration' && node.specifiers) {
            for (const specifier of node.specifiers) {
                if (specifier.type === 'ExportSpecifier' &&
                    specifier.exported.type === 'Identifier' &&
                    specifier.exported.name === constantName) {
                    // Find the original declaration
                    const originalName = specifier.local.type === 'Identifier' ? specifier.local.name : constantName;
                    for (const bodyNode of ast.body) {
                        if (bodyNode.type === 'VariableDeclaration') {
                            for (const declarator of bodyNode.declarations) {
                                if (declarator.id && declarator.id.type === 'Identifier' && declarator.id.name === originalName) {
                                    return nodeToValue(declarator.init);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return null;
}

export { extractFunction, extractConstant };