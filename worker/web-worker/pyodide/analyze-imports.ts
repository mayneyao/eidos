import { PyodideInterface } from 'pyodide';

export async function analyzePythonImports(pyodide: PyodideInterface, code: string) {
    // Add this code to analyze Python imports
    const analyzeScript = `
import ast

def analyze_imports(code):
    tree = ast.parse(code)
    imports = {
        'stdlib': set(),
        'thirdParty': set()
    }
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            module_name = node.names[0].name.split('.')[0] if isinstance(node, ast.ImportFrom) else node.names[0].name
            try:
                # Try importing as builtin
                __import__(module_name)
                imports['stdlib'].add(module_name)
            except ImportError:
                # If not builtin, consider it third-party
                imports['thirdParty'].add(module_name)
    
    return {
        'stdlib': list(imports['stdlib']),
        'thirdParty': list(imports['thirdParty'])
    }
    `

    await pyodide.runPythonAsync(analyzeScript)
    const analyzeImports = pyodide.globals.get('analyze_imports')
    const result = analyzeImports(code)
    analyzeImports.destroy()
    
    return {
        stdlib: result.get('stdlib').toJs(),
        thirdParty: result.get('thirdParty').toJs()
    }
} 