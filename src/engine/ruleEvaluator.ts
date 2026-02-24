import type {
  RuleNode,
  LeafNode,
  CompositeNode,
  UserContext,
  RuleOperator,
} from "../types/index.js";

type OperatorFn = (fact: unknown, value: unknown) => boolean;

const OPERATORS: Record<RuleOperator, OperatorFn> = {
  eq: (f, v) => f === v,
  neq: (f, v) => f !== v,
  gt: (f, v) => (f as number) > (v as number),
  gte: (f, v) => (f as number) >= (v as number),
  lt: (f, v) => (f as number) < (v as number),
  lte: (f, v) => (f as number) <= (v as number),
  in: (f, v) => (v as unknown[]).includes(f),
  notIn: (f, v) => !(v as unknown[]).includes(f),
  between: (f, v) => {
    const [min, max] = v as number[];
    return (f as number) >= min && (f as number) <= max;
  },
};

function isLeafNode(node: RuleNode): node is LeafNode {
  return "fact" in node;
}

function evaluateCondition(node: LeafNode, ctx: UserContext): boolean {
  const factValue = ctx[node.fact as keyof UserContext];

  if (factValue === undefined) {
    console.warn(`[RuleEvaluator] Unknown fact: "${node.fact}"`);
    return false;
  }

  const op = OPERATORS[node.operator];
  if (!op) {
    console.warn(`[RuleEvaluator] Unknown operator: "${node.operator}"`);
    return false;
  }

  return op(factValue, node.value);
}

export function evaluateRule(node: RuleNode, ctx: UserContext): boolean {
  if (!node) return true;

  // Leaf node — single condition
  if (isLeafNode(node)) return evaluateCondition(node, ctx);

  const composite = node as CompositeNode;

  // AND — every child must pass
  if (composite.all) {
    return composite.all.every((child) => evaluateRule(child, ctx));
  }

  // OR — at least one child must pass
  if (composite.any) {
    return composite.any.some((child) => evaluateRule(child, ctx));
  }

  // NOT — no child must pass
  if (composite.none) {
    return composite.none.every((child) => !evaluateRule(child, ctx));
  }

  return true;
}
