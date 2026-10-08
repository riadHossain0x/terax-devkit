import { describe, expect, it } from "vitest";
import {
  type DocumentSymbol,
  flattenDocumentSymbols,
  type SymbolInformation,
} from "./symbols";

describe("symbols flattening", () => {
  it("flattens hierarchical DocumentSymbol tree with full dotted names", () => {
    const symbols: DocumentSymbol[] = [
      {
        name: "MyNamespace",
        kind: 3, // Namespace
        range: {
          start: { line: 0, character: 0 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 21 },
        },
        children: [
          {
            name: "MyService",
            kind: 5, // Class
            range: {
              start: { line: 2, character: 0 },
              end: { line: 18, character: 1 },
            },
            selectionRange: {
              start: { line: 2, character: 13 },
              end: { line: 2, character: 22 },
            },
            children: [
              {
                name: "DoWork",
                kind: 6, // Method
                range: {
                  start: { line: 4, character: 4 },
                  end: { line: 7, character: 5 },
                },
                selectionRange: {
                  start: { line: 4, character: 16 },
                  end: { line: 4, character: 22 },
                },
              },
              {
                name: "Status",
                kind: 7, // Property
                range: {
                  start: { line: 9, character: 4 },
                  end: { line: 9, character: 35 },
                },
                selectionRange: {
                  start: { line: 9, character: 15 },
                  end: { line: 9, character: 21 },
                },
              },
            ],
          },
        ],
      },
    ];

    const flat = flattenDocumentSymbols(symbols);
    expect(flat).toHaveLength(4);

    expect(flat[0]).toEqual({
      name: "MyNamespace",
      containerName: undefined,
      kindName: "Namespace",
      line: 0,
      character: 10,
      label: "[Namespace] MyNamespace",
    });

    expect(flat[1]).toEqual({
      name: "MyService",
      containerName: "MyNamespace",
      kindName: "Class",
      line: 2,
      character: 13,
      label: "[Class] MyNamespace.MyService",
    });

    expect(flat[2]).toEqual({
      name: "DoWork",
      containerName: "MyNamespace.MyService",
      kindName: "Method",
      line: 4,
      character: 16,
      label: "[Method] MyNamespace.MyService.DoWork",
    });

    expect(flat[3]).toEqual({
      name: "Status",
      containerName: "MyNamespace.MyService",
      kindName: "Property",
      line: 9,
      character: 15,
      label: "[Property] MyNamespace.MyService.Status",
    });
  });

  it("handles flat SymbolInformation items", () => {
    const symbols: SymbolInformation[] = [
      {
        name: "OrderController",
        kind: 5, // Class
        containerName: "Shop.Controllers",
        location: {
          uri: "file:///path/to/OrderController.cs",
          range: {
            start: { line: 5, character: 13 },
            end: { line: 20, character: 1 },
          },
        },
      },
      {
        name: "GetOrder",
        kind: 6, // Method
        containerName: "OrderController",
        location: {
          uri: "file:///path/to/OrderController.cs",
          range: {
            start: { line: 10, character: 20 },
            end: { line: 15, character: 5 },
          },
        },
      },
    ];

    const flat = flattenDocumentSymbols(symbols);
    expect(flat).toHaveLength(2);
    expect(flat[0]?.label).toBe("[Class] Shop.Controllers.OrderController");
    expect(flat[1]?.label).toBe("[Method] OrderController.GetOrder");
  });
});
