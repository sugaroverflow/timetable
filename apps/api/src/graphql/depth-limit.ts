import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionNode,
  type SelectionSetNode,
  type ValidationContext,
} from "graphql";
import type { Plugin } from "graphql-yoga";

function fragmentsByName(
  document: DocumentNode,
): Map<string, FragmentDefinitionNode> {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }
  return fragments;
}

function depthForSelectionSet(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
  depth: number,
): number {
  let maxDepth = depth;

  for (const selection of selectionSet.selections) {
    maxDepth = Math.max(
      maxDepth,
      depthForSelection(selection, fragments, visitedFragments, depth),
    );
  }

  return maxDepth;
}

function depthForSelection(
  selection: SelectionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
  depth: number,
): number {
  if (selection.kind === Kind.FIELD) {
    if (selection.name.value.startsWith("__")) return depth;
    const fieldDepth = depth + 1;
    if (!selection.selectionSet) return fieldDepth;
    return depthForSelectionSet(
      selection.selectionSet,
      fragments,
      visitedFragments,
      fieldDepth,
    );
  }

  if (selection.kind === Kind.INLINE_FRAGMENT) {
    return depthForSelectionSet(
      selection.selectionSet,
      fragments,
      visitedFragments,
      depth,
    );
  }

  const fragmentName = selection.name.value;
  if (visitedFragments.has(fragmentName)) return depth;
  const fragment = fragments.get(fragmentName);
  if (!fragment) return depth;

  visitedFragments.add(fragmentName);
  const fragmentDepth = depthForSelectionSet(
    fragment.selectionSet,
    fragments,
    visitedFragments,
    depth,
  );
  visitedFragments.delete(fragmentName);
  return fragmentDepth;
}

export function maxDepthRule(maxDepth: number) {
  return function MaxDepthRule(context: ValidationContext): ASTVisitor {
    const fragments = fragmentsByName(context.getDocument());
    return {
      OperationDefinition(node) {
        const depth = depthForSelectionSet(
          node.selectionSet,
          fragments,
          new Set(),
          0,
        );
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `GraphQL operation depth ${depth} exceeds maximum depth ${maxDepth}`,
              { nodes: [node] },
            ),
          );
        }
      },
    };
  };
}

export function useDepthLimit(maxDepth: number): Plugin {
  return {
    onValidate({ addValidationRule }) {
      addValidationRule(maxDepthRule(maxDepth));
    },
  };
}
