import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from "@codemirror/autocomplete";

export const CSHARP_SNIPPETS: Completion[] = [
  snippetCompletion("public ${1:int} ${2:MyProperty} { get; set; }", {
    label: "prop",
    detail: "Snippet: Property with get/set",
    type: "snippet",
    boost: 99,
  }),
  snippetCompletion(
    "public ${1:int} ${2:MyProperty} { get; private set; }",
    {
      label: "propg",
      detail: "Snippet: Property with get and private set",
      type: "snippet",
      boost: 98,
    },
  ),
  snippetCompletion("public ${1:int} ${2:MyProperty} { get; init; }", {
    label: "propr",
    detail: "Snippet: Property with get and init",
    type: "snippet",
    boost: 97,
  }),
  snippetCompletion("public ${1:int} ${2:MyProperty} => ${3:expression};", {
    label: "propbody",
    detail: "Snippet: Expression-bodied property",
    type: "snippet",
    boost: 96,
  }),
  snippetCompletion(
    "public ${1:MyClass}(${2})\n{\n\t${3}\n}",
    {
      label: "ctor",
      detail: "Snippet: Constructor definition",
      type: "snippet",
      boost: 99,
    },
  ),
  snippetCompletion("Console.WriteLine(${1});", {
    label: "cw",
    detail: "Snippet: Console.WriteLine()",
    type: "snippet",
    boost: 99,
  }),
  snippetCompletion(
    "public class ${1:MyClass}\n{\n\t${2}\n}",
    {
      label: "class",
      detail: "Snippet: Class declaration",
      type: "snippet",
      boost: 95,
    },
  ),
  snippetCompletion(
    "public interface I${1:MyInterface}\n{\n\t${2}\n}",
    {
      label: "interface",
      detail: "Snippet: Interface declaration",
      type: "snippet",
      boost: 95,
    },
  ),
  snippetCompletion(
    "public record ${1:MyRecord}(${2});",
    {
      label: "record",
      detail: "Snippet: Record declaration",
      type: "snippet",
      boost: 94,
    },
  ),
  snippetCompletion(
    "public enum ${1:MyEnum}\n{\n\t${2}\n}",
    {
      label: "enum",
      detail: "Snippet: Enum declaration",
      type: "snippet",
      boost: 94,
    },
  ),
  snippetCompletion(
    "public struct ${1:MyStruct}\n{\n\t${2}\n}",
    {
      label: "struct",
      detail: "Snippet: Struct declaration",
      type: "snippet",
      boost: 93,
    },
  ),
  snippetCompletion(
    "public ${1:void} ${2:MyMethod}(${3})\n{\n\t${4}\n}",
    {
      label: "method",
      detail: "Snippet: Method declaration",
      type: "snippet",
      boost: 90,
    },
  ),
  snippetCompletion(
    "public async Task<${1:void}> ${2:MyMethodAsync}(${3})\n{\n\t${4}\n}",
    {
      label: "async",
      detail: "Snippet: Async Task method",
      type: "snippet",
      boost: 91,
    },
  ),
  snippetCompletion(
    "try\n{\n\t${1}\n}\ncatch (${2:Exception} ex)\n{\n\t${3}\n}",
    {
      label: "try",
      detail: "Snippet: try-catch block",
      type: "snippet",
      boost: 90,
    },
  ),
  snippetCompletion(
    "try\n{\n\t${1}\n}\nfinally\n{\n\t${2}\n}",
    {
      label: "tryf",
      detail: "Snippet: try-finally block",
      type: "snippet",
      boost: 89,
    },
  ),
  snippetCompletion(
    "foreach (var ${1:item} in ${2:collection})\n{\n\t${3}\n}",
    {
      label: "foreach",
      detail: "Snippet: foreach loop",
      type: "snippet",
      boost: 90,
    },
  ),
  snippetCompletion(
    "for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++)\n{\n\t${3}\n}",
    {
      label: "for",
      detail: "Snippet: for loop",
      type: "snippet",
      boost: 88,
    },
  ),
  snippetCompletion(
    "while (${1:condition})\n{\n\t${2}\n}",
    {
      label: "while",
      detail: "Snippet: while loop",
      type: "snippet",
      boost: 85,
    },
  ),
  snippetCompletion(
    "switch (${1:expression})\n{\n\tcase ${2:pattern}:\n\t\t${3}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}",
    {
      label: "switch",
      detail: "Snippet: switch statement",
      type: "snippet",
      boost: 87,
    },
  ),
  snippetCompletion(
    "using (${1:var resource = new Object()})\n{\n\t${2}\n}",
    {
      label: "using",
      detail: "Snippet: using statement",
      type: "snippet",
      boost: 86,
    },
  ),
];

export const CSHARP_SNIPPET_LABELS = new Set<string>(
  CSHARP_SNIPPETS.map((s) => s.label),
);

export function csharpSnippetCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }
  return {
    from: word.from,
    options: CSHARP_SNIPPETS,
  };
}
