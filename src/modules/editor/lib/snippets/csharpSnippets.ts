import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from "@codemirror/autocomplete";

export const CSHARP_SNIPPETS: Completion[] = [
  snippetCompletion("public ${1:int} ${2:MyProperty} { get; set; }", {
    label: "prop",
    detail: "Property with get/set",
    type: "property",
    boost: 99,
  }),
  snippetCompletion(
    "public ${1:int} ${2:MyProperty} { get; private set; }",
    {
      label: "propg",
      detail: "Property with get and private set",
      type: "property",
      boost: 98,
    },
  ),
  snippetCompletion("public ${1:int} ${2:MyProperty} { get; init; }", {
    label: "propr",
    detail: "Property with get and init",
    type: "property",
    boost: 97,
  }),
  snippetCompletion("public ${1:int} ${2:MyProperty} => ${3:expression};", {
    label: "propbody",
    detail: "Expression-bodied property",
    type: "property",
    boost: 96,
  }),
  snippetCompletion(
    "public ${1:MyClass}(${2})\n{\n\t${3}\n}",
    {
      label: "ctor",
      detail: "Constructor definition",
      type: "method",
      boost: 99,
    },
  ),
  snippetCompletion("Console.WriteLine(${1});", {
    label: "cw",
    detail: "Console.WriteLine()",
    type: "function",
    boost: 99,
  }),
  snippetCompletion(
    "public class ${1:MyClass}\n{\n\t${2}\n}",
    {
      label: "class",
      detail: "Class declaration",
      type: "class",
      boost: 95,
    },
  ),
  snippetCompletion(
    "public interface I${1:MyInterface}\n{\n\t${2}\n}",
    {
      label: "interface",
      detail: "Interface declaration",
      type: "interface",
      boost: 95,
    },
  ),
  snippetCompletion(
    "public record ${1:MyRecord}(${2});",
    {
      label: "record",
      detail: "Record declaration",
      type: "class",
      boost: 94,
    },
  ),
  snippetCompletion(
    "public enum ${1:MyEnum}\n{\n\t${2}\n}",
    {
      label: "enum",
      detail: "Enum declaration",
      type: "enum",
      boost: 94,
    },
  ),
  snippetCompletion(
    "public struct ${1:MyStruct}\n{\n\t${2}\n}",
    {
      label: "struct",
      detail: "Struct declaration",
      type: "class",
      boost: 93,
    },
  ),
  snippetCompletion(
    "public ${1:void} ${2:MyMethod}(${3})\n{\n\t${4}\n}",
    {
      label: "method",
      detail: "Method declaration",
      type: "method",
      boost: 90,
    },
  ),
  snippetCompletion(
    "public async Task<${1:void}> ${2:MyMethodAsync}(${3})\n{\n\t${4}\n}",
    {
      label: "async",
      detail: "Async Task method",
      type: "method",
      boost: 91,
    },
  ),
  snippetCompletion(
    "try\n{\n\t${1}\n}\ncatch (${2:Exception} ex)\n{\n\t${3}\n}",
    {
      label: "try",
      detail: "try-catch block",
      type: "keyword",
      boost: 90,
    },
  ),
  snippetCompletion(
    "try\n{\n\t${1}\n}\nfinally\n{\n\t${2}\n}",
    {
      label: "tryf",
      detail: "try-finally block",
      type: "keyword",
      boost: 89,
    },
  ),
  snippetCompletion(
    "foreach (var ${1:item} in ${2:collection})\n{\n\t${3}\n}",
    {
      label: "foreach",
      detail: "foreach loop",
      type: "keyword",
      boost: 90,
    },
  ),
  snippetCompletion(
    "for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++)\n{\n\t${3}\n}",
    {
      label: "for",
      detail: "for loop",
      type: "keyword",
      boost: 88,
    },
  ),
  snippetCompletion(
    "while (${1:condition})\n{\n\t${2}\n}",
    {
      label: "while",
      detail: "while loop",
      type: "keyword",
      boost: 85,
    },
  ),
  snippetCompletion(
    "switch (${1:expression})\n{\n\tcase ${2:pattern}:\n\t\t${3}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}",
    {
      label: "switch",
      detail: "switch statement",
      type: "keyword",
      boost: 87,
    },
  ),
  snippetCompletion(
    "using (${1:var resource = new Object()})\n{\n\t${2}\n}",
    {
      label: "using",
      detail: "using statement",
      type: "keyword",
      boost: 86,
    },
  ),
];

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
