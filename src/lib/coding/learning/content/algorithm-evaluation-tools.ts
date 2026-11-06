import { scenario, eq, containsText } from "../authoring";
import type { PracticalArtifact } from "../types";

export const evaluatedAlgorithms = `def first_binary(values, target):
    precondition_checks = 0
    for index in range(1, len(values)):
        precondition_checks += 1
        if values[index - 1] > values[index]:
            return {'status': 'unsorted', 'index': None, 'probes': [], 'precondition_checks': precondition_checks}
    lo, hi, found, probes = 0, len(values) - 1, None, []
    while lo <= hi:
        mid = (lo + hi) // 2
        probes.append({'lo': lo, 'hi': hi, 'mid': mid, 'value': values[mid]})
        if values[mid] >= target:
            if values[mid] == target:
                found = mid
            hi = mid - 1
        else:
            lo = mid + 1
    return {'status': 'found' if found is not None else 'absent', 'index': found, 'probes': probes, 'precondition_checks': precondition_checks}

def insertion(items):
    values, comparisons, passes = list(items), 0, []
    for i in range(1, len(values)):
        value, j = values[i], i - 1
        while j >= 0:
            comparisons += 1
            if values[j] <= value:
                break
            values[j + 1] = values[j]
            j -= 1
        values[j + 1] = value
        passes.append(list(values))
    return {'values': values, 'comparisons': comparisons, 'passes': passes}

def selection(items):
    values, comparisons, swaps, passes = list(items), 0, 0, []
    for i in range(len(values) - 1):
        smallest = i
        for j in range(i + 1, len(values)):
            comparisons += 1
            if values[j] < values[smallest]:
                smallest = j
        if smallest != i:
            values[i], values[smallest] = values[smallest], values[i]
            swaps += 1
        passes.append(list(values))
    return {'values': values, 'comparisons': comparisons, 'swaps': swaps, 'passes': passes}
`;
export function algorithmSource(source: string, helper = evaluatedAlgorithms): PracticalArtifact { return { type: "source", language: "python", entry: "solve", source, projectFiles: { "algorithm_core.py": helper } }; }
export function binaryExpected(values: number[], target: number) { let precondition_checks = 0; for (let i = 1; i < values.length; i++) { precondition_checks++; if (values[i - 1]! > values[i]!) return { status: "unsorted", index: null, probes: [], precondition_checks }; }
  let lo = 0, hi = values.length - 1, found: number | null = null; const probes = [];
  while (lo <= hi) { const mid = Math.floor((lo + hi) / 2); probes.push({ lo, hi, mid, value: values[mid]! }); if (values[mid]! >= target) { if (values[mid] === target) found = mid; hi = mid - 1; } else lo = mid + 1; }
  return { status: found === null ? "absent" : "found", index: found, probes, precondition_checks };
}
export function sortedExpected(items: number[]) { const insertionValues = [...items], insertionPasses = []; let insertionComparisons = 0;
  for (let i = 1; i < insertionValues.length; i++) { const value = insertionValues[i]!; let j = i - 1; while (j >= 0) { insertionComparisons++; if (insertionValues[j]! <= value) break; insertionValues[j + 1] = insertionValues[j]!; j--; } insertionValues[j + 1] = value; insertionPasses.push([...insertionValues]); }
  const selectionValues = [...items], selectionPasses = []; let comparisons = 0, swaps = 0;
  for (let i = 0; i < selectionValues.length - 1; i++) { let smallest = i; for (let j = i + 1; j < selectionValues.length; j++) { comparisons++; if (selectionValues[j]! < selectionValues[smallest]!) smallest = j; } if (smallest !== i) { [selectionValues[i], selectionValues[smallest]] = [selectionValues[smallest]!, selectionValues[i]!]; swaps++; } selectionPasses.push([...selectionValues]); }
  return { insertion: { values: insertionValues, comparisons: insertionComparisons, passes: insertionPasses }, selection: { values: selectionValues, comparisons, swaps, passes: selectionPasses } };
}
export const algorithmSamples = [
  [[3, 1, 3, 0], [], [1, 2, 3, 4]],
  [[5, -2, 5, 1], [0], [8, 7, 6, 5]],
  [[0, -1, -1, 2], [], [-3, 0, 1, 7]],
];
export function sortingCases(id: string, index: number) { return algorithmSamples[index]!.map((items, variant) => { const expected = sortedExpected(items); return scenario(`${id}-${variant}`, { items }, eq("result.original", items, "Both algorithms receive identical copied data and preserve the caller's input"), eq("result.insertion", expected.insertion, "The actual insertion passes and value-comparison count match the stated algorithm"), eq("result.selection", expected.selection, "The actual selection passes, swaps and value-comparison count remain separate"), containsText("result.measure", "value comparisons", "The fair comparison names the same operation in both strategies")); }); }
