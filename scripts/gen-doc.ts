import * as fs from "fs"
import * as ts from "typescript"
import * as path from "path"

// --- Interfaces for storing parsed data ---

interface DocInfo {
  description?: string
  tags: Record<string, string | boolean | string[]> // e.g., { param: ['name - description'], returns: 'description' }
}

interface ParameterDoc {
  name: string
  type: string // Formatted type string with links
  isOptional: boolean
  isRest: boolean
  description?: string
}

interface TypeParameterDoc {
  name: string
  constraint?: string // Formatted type string with links
  default?: string // Formatted type string with links
}

interface PropertyDoc {
  name: string
  type: string // Formatted type string with links
  isOptional: boolean
  isReadonly: boolean
  docInfo?: DocInfo
  isStatic?: boolean // Added to track static properties explicitly
}

interface MethodDoc extends FunctionDoc {
  isStatic?: boolean
}

interface IndexSignatureDoc {
  keyName: string
  keyType: string // Formatted type string with links
  valueType: string // Formatted type string with links
  isReadonly: boolean
  docInfo?: DocInfo
}

interface InterfaceDoc {
  kind: "interface"
  name: string
  typeParameters: TypeParameterDoc[]
  heritage: string[] // Formatted type strings with links
  properties: PropertyDoc[]
  methods: MethodDoc[]
  indexSignatures: IndexSignatureDoc[]
  docInfo?: DocInfo
}

interface ClassDoc {
  kind: "class"
  name: string
  typeParameters: TypeParameterDoc[]
  heritage: { extends?: string; implements?: string[] } // Formatted type strings with links
  constructors: ConstructorDoc[]
  properties: PropertyDoc[] // Includes static and instance
  methods: MethodDoc[] // Includes static and instance
  isAbstract: boolean
  docInfo?: DocInfo
}

interface ConstructorDoc {
  parameters: ParameterDoc[]
  docInfo?: DocInfo
}

interface FunctionDoc {
  kind: "function"
  name: string
  signature: string // Pre-formatted signature string
  typeParameters: TypeParameterDoc[]
  parameters: ParameterDoc[]
  returnType: string // Formatted type string with links
  docInfo?: DocInfo
}

interface EnumMemberDoc {
  name: string
  initializer?: string // Initializer text *can* sometimes be present in d.ts enums
  docInfo?: DocInfo
}

interface EnumDoc {
  kind: "enum"
  name: string
  members: EnumMemberDoc[]
  docInfo?: DocInfo
  isConst: boolean
}

interface TypeAliasDoc {
  kind: "type"
  name: string
  typeParameters: TypeParameterDoc[]
  type: string // Formatted type string with links
  docInfo?: DocInfo
}

interface ConstantDoc {
  kind: "const"
  name: string
  type: string // Formatted type string with links
  // initializer?: string; // Removed initializer text attempt
  docInfo?: DocInfo
}

type ModuleMember =
  | InterfaceDoc
  | ClassDoc
  | FunctionDoc
  | EnumDoc
  | TypeAliasDoc
  | ConstantDoc

interface ModuleDoc {
  name: string
  members: ModuleMember[]
}

// Define a new type for allowable string kinds in getNodeAnchor
type AnchorableItemKind =
  | ModuleMember["kind"]
  | "method"
  | "property"
  | "constructor"
  | "enummember"
  | "indexsignature"

// --- Global Maps ---
const symbolToModuleMap = new Map<string, string>()
const moduleDocs = new Map<string, ModuleDoc>()
let globalEntryModuleName: string | undefined

// --- Main Parsing Logic ---

function parseDtsFile(dtsFilePath: string, program: ts.Program): void {
  const sourceFile = program.getSourceFile(dtsFilePath)
  if (!sourceFile) {
    throw new Error(`Could not find source file: ${dtsFilePath}`)
  }

  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isModuleDeclaration(node) &&
      node.name &&
      ts.isStringLiteral(node.name)
    ) {
      const moduleName = node.name.text
      // Skip 'node_modules' or other unwanted module declarations if necessary
      // if (moduleName.includes('node_modules')) return;

      console.log(`Parsing module: ${moduleName}`) // Debug log
      const currentModule: ModuleDoc = { name: moduleName, members: [] }
      moduleDocs.set(moduleName, currentModule)

      if (node.body && ts.isModuleBlock(node.body)) {
        ts.forEachChild(node.body, (moduleMemberNode) => {
          const docInfo = extractDocInfo(moduleMemberNode)
          let member: ModuleMember | undefined
          let isExported = hasExportModifier(moduleMemberNode)

          // Determine if the member should be considered exported
          // In `declare module`, top-level items are often implicitly exported.
          if (!isExported) {
            const isPotentiallyExported =
              ts.isInterfaceDeclaration(moduleMemberNode) ||
              ts.isClassDeclaration(moduleMemberNode) ||
              ts.isFunctionDeclaration(moduleMemberNode) ||
              ts.isEnumDeclaration(moduleMemberNode) ||
              ts.isTypeAliasDeclaration(moduleMemberNode) ||
              ts.isVariableStatement(moduleMemberNode)
            if (isPotentiallyExported) {
              // Assume top-level declarations inside 'declare module' are exported
              isExported = true
            }
          }

          if (!isExported) return // Skip non-exported members

          if (ts.isInterfaceDeclaration(moduleMemberNode)) {
            member = parseInterface(
              moduleMemberNode,
              docInfo,
              moduleName,
              program
            )
          } else if (ts.isClassDeclaration(moduleMemberNode)) {
            member = parseClass(moduleMemberNode, docInfo, moduleName, program)
          } else if (ts.isFunctionDeclaration(moduleMemberNode)) {
            member = parseFunction(
              moduleMemberNode,
              docInfo,
              moduleName,
              program
            )
          } else if (ts.isEnumDeclaration(moduleMemberNode)) {
            member = parseEnum(moduleMemberNode, docInfo, moduleName, program)
          } else if (ts.isTypeAliasDeclaration(moduleMemberNode)) {
            member = parseTypeAlias(
              moduleMemberNode,
              docInfo,
              moduleName,
              program
            )
          } else if (ts.isVariableStatement(moduleMemberNode)) {
            moduleMemberNode.declarationList.declarations.forEach(
              (declaration) => {
                if (ts.isVariableDeclaration(declaration)) {
                  const constMember = parseConstant(
                    declaration,
                    docInfo,
                    moduleName,
                    program
                  )
                  if (constMember) {
                    symbolToModuleMap.set(constMember.name, moduleName)
                    currentModule.members.push(constMember)
                    console.log(
                      `  Found Constant: ${constMember.name} in ${moduleName}`
                    ) // Debug log
                  }
                }
              }
            )
          }

          if (member) {
            if (!symbolToModuleMap.has(member.name)) {
              // Avoid overwriting if defined elsewhere?
              symbolToModuleMap.set(member.name, moduleName)
            } else {
              console.warn(
                `Warning: Symbol "${member.name}" already mapped to module "${symbolToModuleMap.get(member.name)}", encountered again in "${moduleName}". Using the first encountered module for linking.`
              )
            }
            currentModule.members.push(member)
            console.log(
              `  Found ${member.kind}: ${member.name} in ${moduleName}`
            ) // Debug log
          }
        })
      }
    }
  })
}

// --- Helper Functions ---

function hasExportModifier(node: ts.Node): boolean {
  // Check if the node itself has an explicit 'export' keyword
  if (ts.canHaveModifiers(node) && node.modifiers) {
    if (
      node.modifiers.some(
        (mod: ts.ModifierLike) => mod.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      return true
    }
  }
  // For VariableStatement, check the statement itself
  if (ts.isVariableDeclaration(node)) {
    let current: ts.Node = node
    while (current && !ts.isVariableStatement(current)) {
      current = current.parent
    }
    if (current && ts.isVariableStatement(current)) {
      return hasExportModifier(current) // Check the parent statement
    }
  }
  return false
}

function extractDocInfo(node: ts.Node): DocInfo | undefined {
  let description: string | undefined
  const tags: Record<string, string | boolean | string[]> = {}
  const jsDocComments = (node as any).jsDoc as ts.JSDoc[] | undefined

  if (jsDocComments && jsDocComments.length > 0) {
    const jsDoc = jsDocComments[jsDocComments.length - 1]
    if (jsDoc.comment) {
      if (typeof jsDoc.comment === "string") {
        description = jsDoc.comment.trim()
      } else if (Array.isArray(jsDoc.comment)) {
        description = jsDoc.comment
          .map((c) => (c as any).text ?? "")
          .join("\n")
          .trim()
      }
    }
    if (jsDoc.tags) {
      jsDoc.tags.forEach((tag: ts.JSDocTag) => {
        const tagName = tag.tagName.text
        let tagValue: string | boolean = true
        if (tag.comment) {
          if (typeof tag.comment === "string") {
            tagValue = tag.comment.trim()
          } else if (Array.isArray(tag.comment)) {
            tagValue = tag.comment
              .map((c) => (c as any).text ?? "")
              .join("\n")
              .trim()
          }
        }
        if (tags[tagName]) {
          if (Array.isArray(tags[tagName])) {
            ;(tags[tagName] as string[]).push(tagValue as string)
          } else {
            tags[tagName] = [tags[tagName] as string, tagValue as string]
          }
        } else {
          tags[tagName] = tagValue
        }
      })
    }
  }

  if (description || Object.keys(tags).length > 0) {
    return { description, tags }
  }
  return undefined
}

function formatType(
  typeNode: ts.TypeNode | undefined,
  currentModuleName: string,
  program: ts.Program
): string {
  if (!typeNode) return "`any`"

  function formatRecursive(node: ts.TypeNode): string {
    if (ts.isTypeReferenceNode(node)) {
      let name = ""
      let identifierForLookup:
        | ts.Identifier
        | ts.QualifiedName
        | ts.EntityName = node.typeName

      if (ts.isQualifiedName(node.typeName)) {
        name = node.typeName.getText()
        identifierForLookup = node.typeName.right
      } else if (ts.isIdentifier(node.typeName)) {
        name = node.typeName.text
        identifierForLookup = node.typeName
      }

      let targetModule = symbolToModuleMap.get(identifierForLookup.getText())
      if (!targetModule && ts.isQualifiedName(node.typeName)) {
        targetModule = symbolToModuleMap.get(node.typeName.getText())
      }

      let link = ""
      if (targetModule) {
        // Only link if the target module is different from the current one
        if (targetModule !== currentModuleName) {
          const targetFilename = moduleNameToFilename(
            targetModule,
            globalEntryModuleName
          )
          const currentFilename = moduleNameToFilename(
            currentModuleName,
            globalEntryModuleName
          )
          const relativePath = path
            .relative(
              path.dirname(path.join(".", currentFilename)),
              targetFilename
            )
            .replace(/\\/g, "/")
          // Ensure path starts with ./ or ../ if relative
          const finalRelativePath =
            relativePath.startsWith(".") || relativePath.startsWith("/")
              ? relativePath
              : `./${relativePath}`

          const anchor = getNodeAnchor(
            identifierForLookup.getText(),
            identifierForLookup
          )
          link = `[${name}](${finalRelativePath}#${anchor})`
        } else {
          // Link within the same page
          const anchor = getNodeAnchor(
            identifierForLookup.getText(),
            identifierForLookup
          )
          link = `[${name}](#${anchor})`
        }
      } else {
        link = `\`${name}\``
      }

      if (node.typeArguments && node.typeArguments.length > 0) {
        const args = node.typeArguments
          .map((arg) => formatRecursive(arg))
          .join(", ")
        // Use Unicode characters for < > to avoid markdown/html issues if possible
        return `${link}⟨${args}⟩`
        // Fallback: return `${link}\\<${args}\\>`;
      }
      return link
    } else if (ts.isArrayTypeNode(node)) {
      return `${formatRecursive(node.elementType)}[]`
    } else if (ts.isUnionTypeNode(node)) {
      return node.types.map((t) => formatRecursive(t)).join(" \\| ")
    } else if (ts.isIntersectionTypeNode(node)) {
      return node.types.map((t) => formatRecursive(t)).join(" & ")
    } else if (ts.isFunctionTypeNode(node)) {
      const params = node.parameters
        .map(
          (p) =>
            `\`${p.name.getText()}\`${p.questionToken ? "?" : ""}: ${formatRecursive(p.type!)}`
        )
        .join(", ")
      const returnType = formatRecursive(node.type)
      const typeParams = node.typeParameters
        ? `⟨${node.typeParameters.map((tp) => tp.name.getText()).join(", ")}⟩`
        : ""
      return `${typeParams}(${params}) => ${returnType}`
    } else if (ts.isLiteralTypeNode(node)) {
      return `\`${node.literal.getText()}\``
    } else if (ts.isTypeLiteralNode(node)) {
      const members = node.members
        .map((m) => {
          if (ts.isPropertySignature(m)) {
            return `\`${m.name?.getText()}\`${m.questionToken ? "?" : ""}: ${formatRecursive(m.type!)}`
          } else if (ts.isMethodSignature(m)) {
            const params = m.parameters
              .map(
                (p) =>
                  `\`${p.name.getText()}\`${p.questionToken ? "?" : ""}: ${formatRecursive(p.type!)}`
              )
              .join(", ")
            const returnType = m.type ? formatRecursive(m.type) : "`void`"
            const typeParams = m.typeParameters
              ? `⟨${m.typeParameters.map((tp) => tp.name.getText()).join(", ")}⟩`
              : ""
            return `\`${m.name?.getText()}\`${m.questionToken ? "?" : ""}${typeParams}(${params}): ${returnType}`
          } else if (ts.isIndexSignatureDeclaration(m)) {
            const keyName = m.parameters[0].name.getText()
            const keyType = formatRecursive(m.parameters[0].type!)
            const valueType = formatRecursive(m.type)
            const readonly = m.modifiers?.some(
              (mod) => mod.kind === ts.SyntaxKind.ReadonlyKeyword
            )
              ? "readonly "
              : ""
            return `${readonly}[\`${keyName}\`: ${keyType}]: ${valueType}`
          }
          return `\`${m.getText()}\`` // Fallback with backticks
        })
        .join("; ")
      return `{ ${members} }`
    } else if (ts.isParenthesizedTypeNode(node)) {
      return `(${formatRecursive(node.type)})`
    } else if (ts.isTupleTypeNode(node)) {
      return `[${node.elements.map(formatRecursive).join(", ")}]`
    } else if (ts.isConditionalTypeNode(node)) {
      return `${formatRecursive(node.checkType)} extends ${formatRecursive(node.extendsType)} ? ${formatRecursive(node.trueType)} : ${formatRecursive(node.falseType)}`
    } else if (ts.isMappedTypeNode(node)) {
      return `{ [K in ${formatRecursive(node.typeParameter.constraint!)}]: ${formatRecursive(node.type!)} }`
    } else if (ts.isIndexedAccessTypeNode(node)) {
      return `${formatRecursive(node.objectType)}[${formatRecursive(node.indexType)}]`
    } else if (
      ts.isTypeOperatorNode(node) &&
      node.operator === ts.SyntaxKind.KeyOfKeyword
    ) {
      return `keyof ${formatRecursive(node.type)}`
    } else if (ts.isTypeQueryNode(node)) {
      return `typeof \`${node.exprName.getText()}\``
    } else if (ts.isImportTypeNode(node)) {
      let typeArgs = ""
      if (node.typeArguments && node.typeArguments.length > 0) {
        typeArgs = `⟨${node.typeArguments.map((arg) => formatRecursive(arg)).join(", ")}⟩`
      }
      let qualifier = ""
      if (node.qualifier) {
        qualifier = `.${node.qualifier.getText()}`
      }
      const moduleSpecifier = node.argument.getText()
      return `import(${moduleSpecifier})${qualifier}${typeArgs}`
    }
    return `\`${node.getText()}\`` // Fallback
  }

  try {
    return formatRecursive(typeNode)
  } catch (e) {
    console.warn(
      `Warning: Error formatting type node "${typeNode.getText()}":`,
      e
    )
    return `\`${typeNode.getText()}\`` // Fallback on error
  }
}

function formatTypeParameters(
  typeParams: readonly ts.TypeParameterDeclaration[] | undefined,
  currentModuleName: string,
  program: ts.Program
): TypeParameterDoc[] {
  if (!typeParams) return []
  return typeParams.map((tp) => ({
    name: tp.name.getText(),
    constraint: tp.constraint
      ? formatType(tp.constraint, currentModuleName, program)
      : undefined,
    default: tp.default
      ? formatType(tp.default, currentModuleName, program)
      : undefined,
  }))
}

function formatParameters(
  params: readonly ts.ParameterDeclaration[],
  docInfo: DocInfo | undefined,
  currentModuleName: string,
  program: ts.Program
): ParameterDoc[] {
  const paramDocs = docInfo?.tags?.param
  const paramMap = new Map<string, string>()
  if (paramDocs) {
    const processParamTag = (p: string | boolean) => {
      if (typeof p === "string") {
        const match = p.match(/^(\S+)\s*(?:-\s*)?(.*)/s)
        if (match) {
          paramMap.set(match[1], match[2]?.trim() ?? "")
        }
      }
    }
    if (Array.isArray(paramDocs)) {
      paramDocs.forEach(processParamTag)
    } else {
      processParamTag(paramDocs)
    }
  }
  return params.map((p) => {
    const paramName = p.name.getText()
    return {
      name: paramName,
      type: formatType(p.type, currentModuleName, program),
      isOptional: !!p.questionToken || !!p.initializer,
      isRest: !!p.dotDotDotToken,
      description: paramMap.get(paramName),
    }
  })
}

function parseInterface(
  node: ts.InterfaceDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): InterfaceDoc {
  const name = node.name.getText()
  const heritage =
    node.heritageClauses?.flatMap((hc) =>
      hc.types.map((t) => formatType(t, moduleName, program))
    ) ?? []
  const typeParameters = formatTypeParameters(
    node.typeParameters,
    moduleName,
    program
  )
  const properties: PropertyDoc[] = []
  const methods: MethodDoc[] = []
  const indexSignatures: IndexSignatureDoc[] = []

  node.members.forEach((member) => {
    const memberDocInfo = extractDocInfo(member)
    let isReadonly = false
    if (ts.canHaveModifiers(member) && member.modifiers) {
      isReadonly = member.modifiers.some(
        (mod: ts.ModifierLike) => mod.kind === ts.SyntaxKind.ReadonlyKeyword
      )
    }

    if (ts.isPropertySignature(member)) {
      properties.push({
        name: member.name.getText(),
        type: formatType(member.type, moduleName, program),
        isOptional: !!member.questionToken,
        isReadonly: isReadonly,
        docInfo: memberDocInfo,
      })
    } else if (ts.isMethodSignature(member)) {
      methods.push({
        kind: "function",
        name: member.name.getText(),
        signature: member.getText().split("{")[0].trim(),
        typeParameters: formatTypeParameters(
          member.typeParameters,
          moduleName,
          program
        ),
        parameters: formatParameters(
          member.parameters,
          memberDocInfo ?? docInfo,
          moduleName,
          program
        ),
        returnType: formatType(member.type, moduleName, program),
        docInfo: memberDocInfo,
        isStatic: false,
      })
    } else if (ts.isIndexSignatureDeclaration(member)) {
      indexSignatures.push({
        keyName: member.parameters[0].name.getText(),
        keyType: formatType(member.parameters[0].type, moduleName, program),
        valueType: formatType(member.type, moduleName, program),
        isReadonly: isReadonly,
        docInfo: memberDocInfo,
      })
    }
  })
  return {
    kind: "interface",
    name,
    typeParameters,
    heritage,
    properties,
    methods,
    indexSignatures,
    docInfo,
  }
}

function parseClass(
  node: ts.ClassDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): ClassDoc {
  const name = node.name?.getText() ?? "AnonymousClass"
  const typeParameters = formatTypeParameters(
    node.typeParameters,
    moduleName,
    program
  )
  let extendsClause: string | undefined
  let implementsClause: string[] = []

  if (node.heritageClauses) {
    for (const hc of node.heritageClauses) {
      if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
        extendsClause = formatType(hc.types[0], moduleName, program)
      } else if (hc.token === ts.SyntaxKind.ImplementsKeyword) {
        implementsClause = hc.types.map((t) =>
          formatType(t, moduleName, program)
        )
      }
    }
  }

  const constructors: ConstructorDoc[] = []
  const properties: PropertyDoc[] = []
  const methods: MethodDoc[] = []

  node.members.forEach((member) => {
    const memberDocInfo = extractDocInfo(member)
    let isStatic = false
    let isReadonly = false
    if (ts.canHaveModifiers(member) && member.modifiers) {
      isStatic = member.modifiers.some(
        (mod: ts.ModifierLike) => mod.kind === ts.SyntaxKind.StaticKeyword
      )
      isReadonly = member.modifiers.some(
        (mod: ts.ModifierLike) => mod.kind === ts.SyntaxKind.ReadonlyKeyword
      )
    }

    if (ts.isConstructorDeclaration(member)) {
      constructors.push({
        parameters: formatParameters(
          member.parameters,
          memberDocInfo ?? docInfo,
          moduleName,
          program
        ),
        docInfo: memberDocInfo ?? docInfo,
      })
    } else if (ts.isPropertyDeclaration(member)) {
      properties.push({
        name: member.name.getText(),
        type: formatType(member.type, moduleName, program),
        isOptional: !!member.questionToken,
        isReadonly: isReadonly,
        isStatic: isStatic, // Store static info
        docInfo: memberDocInfo,
      })
    } else if (ts.isMethodDeclaration(member)) {
      methods.push({
        kind: "function",
        name: member.name.getText(),
        signature: member.getText().split("{")[0].trim(),
        typeParameters: formatTypeParameters(
          member.typeParameters,
          moduleName,
          program
        ),
        parameters: formatParameters(
          member.parameters,
          memberDocInfo ?? docInfo,
          moduleName,
          program
        ),
        returnType: formatType(member.type, moduleName, program),
        docInfo: memberDocInfo,
        isStatic: isStatic,
      })
    }
  })
  return {
    kind: "class",
    name,
    typeParameters,
    heritage: { extends: extendsClause, implements: implementsClause },
    constructors,
    properties,
    methods,
    isAbstract:
      node.modifiers?.some(
        (mod) => mod.kind === ts.SyntaxKind.AbstractKeyword
      ) ?? false,
    docInfo,
  }
}

function parseFunction(
  node: ts.FunctionDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): FunctionDoc {
  const name = node.name?.getText() ?? "anonymous"
  const typeParams = formatTypeParameters(
    node.typeParameters,
    moduleName,
    program
  )
  const params = formatParameters(node.parameters, docInfo, moduleName, program)
  const returnType = formatType(node.type, moduleName, program)

  return {
    kind: "function",
    name,
    signature: `function ${name}${formatTypeParamList(typeParams)}(${formatParamList(params)}): ${returnType}`,
    typeParameters: typeParams,
    parameters: params,
    returnType: returnType,
    docInfo,
  }
}

function parseEnum(
  node: ts.EnumDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): EnumDoc {
  const name = node.name.getText()
  const members = node.members.map((member) => {
    const memberDocInfo = extractDocInfo(member)
    return {
      name: member.name.getText(),
      initializer: member.initializer?.getText(), // Enum initializers are often present
      docInfo: memberDocInfo,
    }
  })
  let isConst = false
  if (ts.canHaveModifiers(node) && node.modifiers) {
    isConst = node.modifiers.some((m) => m.kind === ts.SyntaxKind.ConstKeyword)
  }
  return { kind: "enum", name, members, docInfo, isConst: isConst }
}

function parseTypeAlias(
  node: ts.TypeAliasDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): TypeAliasDoc {
  const name = node.name.getText()
  return {
    kind: "type",
    name,
    typeParameters: formatTypeParameters(
      node.typeParameters,
      moduleName,
      program
    ),
    type: formatType(node.type, moduleName, program),
    docInfo,
  }
}

// ** UPDATED FUNCTION **
function parseConstant(
  node: ts.VariableDeclaration,
  docInfo: DocInfo | undefined,
  moduleName: string,
  program: ts.Program
): ConstantDoc | undefined {
  if (!ts.isIdentifier(node.name)) return undefined
  const name = node.name.getText()
  return {
    kind: "const",
    name,
    type: formatType(node.type, moduleName, program),
    // Initializer text is removed as it's unreliable in d.ts
    // initializer: node.initializer?.getText(),
    docInfo,
  }
}

// --- Markdown Generation ---

function moduleNameToFilename(
  moduleName: string,
  entryModuleName?: string
): string {
  const effectiveEntry = entryModuleName ?? globalEntryModuleName
  if (moduleName === effectiveEntry) {
    return "index.md"
  }
  const sanitized = moduleName
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
  return `${sanitized}.md`
}

function sanitizeForAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_.-]/g, "")
}

function getNodeAnchor(
  name: string,
  nodeOrKind: ts.Node | AnchorableItemKind
): string {
  let prefix = "item"
  let kindToTest: ts.SyntaxKind | AnchorableItemKind | undefined

  if (typeof nodeOrKind === "string") {
    kindToTest = nodeOrKind // nodeOrKind is AnchorableItemKind
  } else if (nodeOrKind) {
    // nodeOrKind is ts.Node
    kindToTest = nodeOrKind.kind // kindToTest is ts.SyntaxKind
  }

  if (
    kindToTest === "interface" ||
    kindToTest === ts.SyntaxKind.InterfaceDeclaration
  )
    prefix = "interface"
  else if (
    kindToTest === "class" ||
    kindToTest === ts.SyntaxKind.ClassDeclaration
  )
    prefix = "class"
  else if (
    kindToTest === "function" ||
    kindToTest === ts.SyntaxKind.FunctionDeclaration
  )
    prefix = "function"
  else if (
    kindToTest === "enum" ||
    kindToTest === ts.SyntaxKind.EnumDeclaration
  )
    prefix = "enum"
  else if (
    kindToTest === "type" ||
    kindToTest === ts.SyntaxKind.TypeAliasDeclaration
  )
    prefix = "type"
  else if (
    kindToTest === "const" ||
    kindToTest === ts.SyntaxKind.VariableDeclaration
  )
    prefix = "const"
  else if (
    kindToTest === "method" ||
    kindToTest === ts.SyntaxKind.MethodDeclaration ||
    kindToTest === ts.SyntaxKind.MethodSignature
  )
    prefix = "method"
  else if (
    kindToTest === "property" ||
    kindToTest === ts.SyntaxKind.PropertyDeclaration ||
    kindToTest === ts.SyntaxKind.PropertySignature
  )
    prefix = "property"
  else if (
    kindToTest === "constructor" ||
    kindToTest === ts.SyntaxKind.Constructor
  )
    prefix = "constructor"
  else if (
    kindToTest === "enummember" ||
    kindToTest === ts.SyntaxKind.EnumMember
  )
    prefix = "enummember"
  else if (
    kindToTest === "indexsignature" ||
    kindToTest === ts.SyntaxKind.IndexSignature
  )
    prefix = "indexsignature"
  // Fallback for Identifier nodes: only apply if nodeOrKind was a Node and not handled by specific kind checks.
  else if (
    nodeOrKind &&
    typeof nodeOrKind !== "string" &&
    ts.isIdentifier(nodeOrKind) &&
    nodeOrKind.parent
  ) {
    const parentKind = nodeOrKind.parent.kind
    if (parentKind === ts.SyntaxKind.InterfaceDeclaration) prefix = "interface"
    else if (parentKind === ts.SyntaxKind.ClassDeclaration) prefix = "class"
    // ... add others if necessary
  }
  return `${prefix}-${sanitizeForAnchor(name)}`
}

function generateMarkdownForModule(
  moduleDoc: ModuleDoc,
  outputDir: string,
  entryModuleName: string
): void {
  const filename = moduleNameToFilename(moduleDoc.name, entryModuleName)
  const filepath = path.join(outputDir, filename)
  let md = `---
title: ${moduleDoc.name}
---

# Module: \`${moduleDoc.name}\`\n\n`

  const membersByType: { [key in ModuleMember["kind"]]: ModuleMember[] } = {
    interface: [],
    class: [],
    function: [],
    enum: [],
    type: [],
    const: [],
  }
  moduleDoc.members
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((m) => {
      if (membersByType[m.kind]) {
        membersByType[m.kind].push(m)
      }
    })

  md += `## Table of Contents\n\n`
  let hasContent = false
  for (const kind of Object.keys(membersByType) as ModuleMember["kind"][]) {
    const members = membersByType[kind]
    if (members.length > 0) {
      hasContent = true
      const title = kind.charAt(0).toUpperCase() + kind.slice(1) + "s"
      md += `*   [${title}](#${sanitizeForAnchor(title)})\n`
      members.forEach((member) => {
        md += `    *   [\`${member.name}\`](#${getNodeAnchor(member.name, member.kind)})\n`
      })
    }
  }
  if (!hasContent) {
    md += "_This module exports no documented members._\n\n"
  }
  md += "\n"

  for (const kind of Object.keys(membersByType) as ModuleMember["kind"][]) {
    const members = membersByType[kind]
    if (members.length > 0) {
      const title = kind.charAt(0).toUpperCase() + kind.slice(1) + "s"
      md += `<a id="${sanitizeForAnchor(title)}"></a>\n`
      md += `## ${title}\n\n`
      members.forEach((member) => {
        md += generateMarkdownForMember(member, moduleDoc.name)
      })
    }
  }

  fs.writeFileSync(filepath, md)
  console.log(`Generated: ${filepath}`)
}

function formatTypeParamList(params: TypeParameterDoc[]): string {
  if (!params || params.length === 0) return ""
  const formatted = params
    .map((p) => {
      let s = `\`${p.name}\`` // Wrap name in backticks
      if (p.constraint) s += ` extends ${p.constraint}`
      if (p.default) s += ` = ${p.default}`
      return s
    })
    .join(", ")
  // Use Unicode characters for < >
  return `⟨${formatted}⟩`
}

function formatParamList(params: ParameterDoc[]): string {
  if (!params) return ""
  return params
    .map(
      (p) =>
        `${p.isRest ? "..." : ""}\`${p.name}\`${p.isOptional ? "?" : ""}: ${p.type}`
    )
    .join(", ")
}

function generateMarkdownForMember(
  member: ModuleMember,
  moduleName: string
): string {
  let md = `<a id="${getNodeAnchor(member.name, member.kind)}"></a>\n`
  md += `### \`${member.name}\`\n\n` // Member name as heading

  if (member.docInfo?.description) {
    md += `${member.docInfo.description}\n\n`
  }

  switch (member.kind) {
    case "interface":
      md += generateMarkdownForInterface(member, moduleName)
      break
    case "class":
      md += generateMarkdownForClass(member, moduleName)
      break
    case "function":
      md += generateMarkdownForFunction(member, moduleName)
      break
    case "enum":
      md += generateMarkdownForEnum(member, moduleName)
      break
    case "type":
      md += generateMarkdownForTypeAlias(member, moduleName)
      break
    case "const":
      md += generateMarkdownForConstant(member, moduleName)
      break
  }

  return md + "---\n\n"
}

function generateMarkdownForDocInfoParams(
  params: ParameterDoc[] | undefined
): string {
  if (!params || params.length === 0 || !params.some((p) => p.description))
    return ""
  let md = `**Parameters:**\n\n`
  md += `| Name | Type | Optional | Description |\n`
  md += `| ---- | ---- | -------- | ----------- |\n`
  params.forEach((p) => {
    md += `| \`${p.name}\` | ${p.type} | ${p.isOptional || p.isRest ? "Yes" : "No"} | ${p.description?.replace(/\n/g, "<br/>") ?? ""} |\n`
  })
  return md + "\n"
}

function generateMarkdownForDocInfoReturns(
  returnType: string,
  docInfo: DocInfo | undefined
): string {
  const returnsDesc = docInfo?.tags?.returns
  if (typeof returnsDesc !== "string" || !returnsDesc) return "" // Only proceed if returns tag has string description
  // Ensure return type has backticks if it doesn't already
  const formattedReturnType =
    returnType.startsWith("`") || returnType.startsWith("[")
      ? returnType
      : `\`${returnType}\`` // Avoid double backticks
  return `**Returns:** ${formattedReturnType}${returnsDesc ? ` - ${returnsDesc}` : ""}\n\n`
}

function generateMarkdownForInterface(
  iface: InterfaceDoc,
  moduleName: string
): string {
  let md = "**Signature:**\n"
  md += "```typescript\n"
  md += `interface ${iface.name}${formatTypeParamList(iface.typeParameters)}`
  if (iface.heritage.length > 0) {
    md += ` extends ${iface.heritage.join(", ")}`
  }
  md += "\n```\n\n"
  if (iface.properties.length > 0) {
    md += `**Properties:**\n\n`
    md += `| Name | Type | Optional | Readonly | Description |\n`
    md += `| ---- | ---- | -------- | -------- | ----------- |\n`
    iface.properties
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        md += `| \`${p.name}\` | ${p.type} | ${p.isOptional ? "Yes" : "No"} | ${p.isReadonly ? "Yes" : "No"} | ${p.docInfo?.description?.replace(/\n/g, "<br/>") ?? ""} |\n`
      })
    md += "\n"
  }
  if (iface.methods.length > 0) {
    md += `**Methods:**\n\n`
    iface.methods
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        md += `<a id="${getNodeAnchor(m.name, "method")}"></a>\n`
        md += `*   #### \`${m.name}\`\n\n`
        md += "    ```typescript\n"
        md += `    ${m.name}${formatTypeParamList(m.typeParameters)}(${formatParamList(m.parameters)}): ${m.returnType}\n`
        md += "    ```\n\n"
        if (m.docInfo?.description) md += `    ${m.docInfo.description}\n\n`
        md += generateMarkdownForDocInfoParams(m.parameters).replace(
          /^/gm,
          "    "
        )
        md += generateMarkdownForDocInfoReturns(
          m.returnType,
          m.docInfo
        ).replace(/^/gm, "    ")
        md += "\n"
      })
    md += "\n"
  }
  if (iface.indexSignatures.length > 0) {
    md += `**Index Signatures:**\n\n`
    iface.indexSignatures.forEach((sig) => {
      md += `<a id="${getNodeAnchor(sig.keyName, "indexsignature")}"></a>\n`
      md += `*   \`${sig.isReadonly ? "readonly " : ""}[${sig.keyName}: ${sig.keyType}]: ${sig.valueType}\`\n`
      if (sig.docInfo?.description) md += `    *   ${sig.docInfo.description}\n`
    })
    md += "\n"
  }
  return md
}

function generateMarkdownForClass(cls: ClassDoc, moduleName: string): string {
  let md = "**Signature:**\n"
  md += "```typescript\n"
  md += `${cls.isAbstract ? "abstract " : ""}class ${cls.name}${formatTypeParamList(cls.typeParameters)}`
  if (cls.heritage.extends) {
    md += ` extends ${cls.heritage.extends}`
  }
  if (cls.heritage.implements && cls.heritage.implements.length > 0) {
    md += ` implements ${cls.heritage.implements.join(", ")}`
  }
  md += "\n```\n\n"

  if (cls.constructors.length > 0) {
    md += `**Constructors:**\n\n`
    cls.constructors.forEach((ctor, index) => {
      md += `<a id="${getNodeAnchor(cls.name + "-constructor" + index, "constructor")}"></a>\n`
      md += "  ```typescript\n"
      md += `  constructor(${formatParamList(ctor.parameters)})\n`
      md += "  ```\n\n"
      if (ctor.docInfo?.description) md += `  ${ctor.docInfo.description}\n\n`
      md += generateMarkdownForDocInfoParams(ctor.parameters).replace(
        /^/gm,
        "  "
      )
      md += "\n"
    })
  }

  const staticProps = cls.properties.filter((p) => p.isStatic)
  const instanceProps = cls.properties.filter((p) => !p.isStatic)
  const staticMethods = cls.methods.filter((m) => m.isStatic)
  const instanceMethods = cls.methods.filter((m) => !m.isStatic)

  if (instanceProps.length > 0) {
    md += `**Properties:**\n\n`
    md += `| Name | Type | Optional | Readonly | Description |\n`
    md += `| ---- | ---- | -------- | -------- | ----------- |\n`
    instanceProps
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        md += `| \`${p.name}\` | ${p.type} | ${p.isOptional ? "Yes" : "No"} | ${p.isReadonly ? "Yes" : "No"} | ${p.docInfo?.description?.replace(/\n/g, "<br/>") ?? ""} |\n`
      })
    md += "\n"
  }
  if (instanceMethods.length > 0) {
    md += `**Methods:**\n\n`
    instanceMethods
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        md += `<a id="${getNodeAnchor(m.name, "method")}"></a>\n`
        md += `*   #### \`${m.name}\`\n\n`
        md += "    ```typescript\n"
        md += `    ${m.name}${formatTypeParamList(m.typeParameters)}(${formatParamList(m.parameters)}): ${m.returnType}\n`
        md += "    ```\n\n"
        if (m.docInfo?.description) md += `    ${m.docInfo.description}\n\n`
        md += generateMarkdownForDocInfoParams(m.parameters).replace(
          /^/gm,
          "    "
        )
        md += generateMarkdownForDocInfoReturns(
          m.returnType,
          m.docInfo
        ).replace(/^/gm, "    ")
        md += "\n"
      })
    md += "\n"
  }
  if (staticProps.length > 0) {
    md += `**Static Properties:**\n\n`
    md += `| Name | Type | Optional | Readonly | Description |\n`
    md += `| ---- | ---- | -------- | -------- | ----------- |\n`
    staticProps
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        md += `| \`static ${p.name}\` | ${p.type} | ${p.isOptional ? "Yes" : "No"} | ${p.isReadonly ? "Yes" : "No"} | ${p.docInfo?.description?.replace(/\n/g, "<br/>") ?? ""} |\n`
      })
    md += "\n"
  }
  if (staticMethods.length > 0) {
    md += `**Static Methods:**\n\n`
    staticMethods
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        md += `<a id="${getNodeAnchor("static-" + m.name, "method")}"></a>\n`
        md += `*   #### \`static ${m.name}\`\n\n`
        md += "    ```typescript\n"
        md += `    static ${m.name}${formatTypeParamList(m.typeParameters)}(${formatParamList(m.parameters)}): ${m.returnType}\n`
        md += "    ```\n\n"
        if (m.docInfo?.description) md += `    ${m.docInfo.description}\n\n`
        md += generateMarkdownForDocInfoParams(m.parameters).replace(
          /^/gm,
          "    "
        )
        md += generateMarkdownForDocInfoReturns(
          m.returnType,
          m.docInfo
        ).replace(/^/gm, "    ")
        md += "\n"
      })
    md += "\n"
  }
  return md
}

function generateMarkdownForFunction(
  fn: FunctionDoc,
  moduleName: string
): string {
  let md = "**Signature:**\n"
  md += "```typescript\n"
  md += fn.signature // Use the pre-formatted signature
  md += "\n```\n\n"
  md += generateMarkdownForDocInfoParams(fn.parameters)
  md += generateMarkdownForDocInfoReturns(fn.returnType, fn.docInfo)
  return md
}

function generateMarkdownForEnum(en: EnumDoc, moduleName: string): string {
  let md = "**Definition:**\n"
  md += "```typescript\n"
  md += `${en.isConst ? "const " : ""}enum ${en.name} {\n`
  en.members.forEach((m) => {
    md += `    ${m.name}${m.initializer ? ` = ${m.initializer}` : ""},${m.docInfo?.description ? ` // ${m.docInfo.description.split("\n")[0]}` : ""}\n`
  })
  md += "}\n```\n\n"
  if (en.members.some((m) => m.docInfo)) {
    md += `**Members:**\n\n`
    md += `| Name | Value | Description |\n`
    md += `| ---- | ----- | ----------- |\n`
    en.members.forEach((m) => {
      md += `| \`${m.name}\` | ${m.initializer ? `\`${m.initializer}\`` : ""} | ${m.docInfo?.description?.replace(/\n/g, "<br/>") ?? ""} |\n`
      md += `<a id="${getNodeAnchor(m.name, "enummember")}"></a>\n`
    })
    md += "\n"
  }
  return md
}

function generateMarkdownForTypeAlias(
  alias: TypeAliasDoc,
  moduleName: string
): string {
  let md = "**Definition:**\n"
  md += "```typescript\n"
  md += `type ${alias.name}${formatTypeParamList(alias.typeParameters)} = ${alias.type}`
  md += "\n```\n\n"
  if (alias.docInfo?.description) {
    md += `${alias.docInfo.description}\n\n`
  }
  return md
}

// ** UPDATED FUNCTION **
function generateMarkdownForConstant(
  cnst: ConstantDoc,
  moduleName: string
): string {
  let md = "**Definition:**\n"
  md += "```typescript\n"
  md += `const ${cnst.name}: ${cnst.type}`
  // Initializer value removed from output
  // if (cnst.initializer) { ... }
  md += "\n```\n\n"
  if (cnst.docInfo?.description) {
    md += `${cnst.docInfo.description}\n\n`
  }
  return md
}

// --- Main Execution ---

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 3) {
    console.error(
      "Usage: bun run scripts/gen-doc.ts <dtsFilePath> <outputDir> <entryModuleName>"
    )
    process.exit(1)
  }

  const [dtsFilePath, outputDir, entryModuleName] = args
  globalEntryModuleName = entryModuleName

  if (!fs.existsSync(dtsFilePath)) {
    console.error(`Error: d.ts file not found at ${dtsFilePath}`)
    process.exit(1)
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    noEmit: true,
  }
  const resolvedDtsPath = path.resolve(dtsFilePath)
  console.log(`Creating TS Program for: ${resolvedDtsPath}`)
  const program = ts.createProgram([resolvedDtsPath], options)

  // Check for compiler diagnostics (optional but helpful)
  const allDiagnostics = ts.getPreEmitDiagnostics(program)
  allDiagnostics.forEach((diagnostic) => {
    if (diagnostic.file) {
      let { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file,
        diagnostic.start!
      )
      let message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      )
      console.warn(
        `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
      )
    } else {
      console.warn(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      )
    }
  })

  console.log(`Starting parsing...`)
  try {
    parseDtsFile(resolvedDtsPath, program)
  } catch (error) {
    console.error("Error during parsing:", error)
    process.exit(1)
  }
  console.log(`Parsing complete. Found ${moduleDocs.size} modules.`)
  console.log(`Symbol map size: ${symbolToModuleMap.size}`)

  if (moduleDocs.size === 0) {
    console.warn("No 'declare module \"...\"' blocks found in the d.ts file.")
    return
  }
  if (!moduleDocs.has(entryModuleName)) {
    console.error(`Error: Entry module "${entryModuleName}" not found.`)
    console.log("Available modules:", Array.from(moduleDocs.keys()))
    process.exit(1)
  }

  console.log(`Generating Markdown files in ${outputDir}...`)
  moduleDocs.forEach((moduleDoc) => {
    generateMarkdownForModule(moduleDoc, outputDir, entryModuleName)
  })

  console.log("\nDocumentation generation complete.")
}

main()
