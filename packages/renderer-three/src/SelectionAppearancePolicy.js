export const DEFAULT_INDIVIDUAL_SELECTION_LIMIT = 48;

export function resolveSelectionAppearancePolicy(
  selectedCount,
  { individualLimit = DEFAULT_INDIVIDUAL_SELECTION_LIMIT } = {}
) {
  const count = nonNegativeInteger(selectedCount, "selectedCount");
  const limit = nonNegativeInteger(individualLimit, "individualLimit");

  if (count === 0) {
    return Object.freeze({
      mode: "none",
      selectedCount: 0,
      helperBudget: 0,
      individualLimit: limit
    });
  }

  const aggregate = count > limit;
  return Object.freeze({
    mode: aggregate ? "aggregate" : "individual",
    selectedCount: count,
    helperBudget: aggregate ? 1 : count,
    individualLimit: limit
  });
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} deve ser inteiro não negativo.`);
  }
  return number;
}
