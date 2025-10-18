import oxc from 'oxc-parser';


export const getExports = (code: string) => {
    const ast = oxc.parseSync('index.ts', code)
    console.log(ast.module.staticExports)
}