export type LspPos = { line: number; character: number };
export type LspRange = { start: LspPos; end: LspPos };

export type DocumentSymbol = {
  name: string;
  detail?: string;
  kind: number;
  tags?: number[];
  deprecated?: boolean;
  range: LspRange;
  selectionRange: LspRange;
  children?: DocumentSymbol[];
};

export type SymbolInformation = {
  name: string;
  kind: number;
  tags?: number[];
  deprecated?: boolean;
  location: {
    uri: string;
    range: LspRange;
  };
  containerName?: string;
};

export const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

export type FlatSymbolItem = {
  name: string;
  containerName?: string;
  kindName: string;
  line: number;
  character: number;
  label: string;
};

export function flattenDocumentSymbols(
  symbols: (DocumentSymbol | SymbolInformation)[],
  parentName?: string,
): FlatSymbolItem[] {
  const result: FlatSymbolItem[] = [];

  for (const sym of symbols) {
    if ("range" in sym && "selectionRange" in sym) {
      // DocumentSymbol (hierarchical)
      const docSym = sym as DocumentSymbol;
      const kindName = SYMBOL_KIND_LABELS[docSym.kind] ?? "Symbol";
      const startPos = docSym.selectionRange?.start ?? docSym.range.start;
      const fullName = parentName ? `${parentName}.${docSym.name}` : docSym.name;

      result.push({
        name: docSym.name,
        containerName: parentName,
        kindName,
        line: startPos.line,
        character: startPos.character,
        label: `[${kindName}] ${fullName}`,
      });

      if (docSym.children && docSym.children.length > 0) {
        result.push(...flattenDocumentSymbols(docSym.children, fullName));
      }
    } else if ("location" in sym) {
      // SymbolInformation (flat)
      const symInfo = sym as SymbolInformation;
      const kindName = SYMBOL_KIND_LABELS[symInfo.kind] ?? "Symbol";
      const startPos = symInfo.location.range.start;
      const fullName = symInfo.containerName
        ? `${symInfo.containerName}.${symInfo.name}`
        : symInfo.name;

      result.push({
        name: symInfo.name,
        containerName: symInfo.containerName,
        kindName,
        line: startPos.line,
        character: startPos.character,
        label: `[${kindName}] ${fullName}`,
      });
    }
  }

  return result;
}
