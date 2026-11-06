import { authorModuleActivity, scenario, eq } from "../authoring";
import { algorithmSource, binaryExpected, sortedExpected, algorithmSamples } from "./algorithm-evaluation-tools";

const moduleId = "algorithms-and-data/algorithm-evaluation";
function provenance(faulty = false) { return algorithmSource(`from algorithm_core import first_binary
def solve(data):
    original = list(data['items'])
    ordered = sorted(original)
    rows = []
    for target in data['targets']:
        found = first_binary(ordered, target)
        original_indices = ${faulty ? "[] if found['index'] is None else [found['index']]" : "[index for index, value in enumerate(original) if value == target]"}
        rows.append({'target': target, 'sorted_result': found, 'original_indices': original_indices})
    return {'original': original, 'ordered': ordered, 'rows': rows}
`); }
function provenanceCases(id: string, index: number) { const shift = index * 2; return [[shift + 3, shift, shift + 3, shift + 1], []].map((items, variant) => { const targets = [shift + 3, 100], ordered = [...items].sort((a, b) => a - b); return scenario(`${id}-${variant}`, { items, targets }, eq("result", { original: items, ordered, rows: targets.map(target => ({ target, sorted_result: binaryExpected(ordered, target), original_indices: items.flatMap((value, position) => value === target ? [position] : []) })) }, "The actual sorted-search trace is separated from every matching original index, including duplicates and absence")); }); }
const provenanceLesson = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1, workbench: "python", title: "Retrieve record identity after sorting and searching", objective: "Map a sorted search result back to all matching original positions without confusing sorted and original indices.", concepts: ["retrieval", "provenance", "duplicate identity", "search precondition"], essentialChecks: ["Sorted search executes correctly", "All original matching positions survive", "Absent results remain explicit"], faultDescription: "The returned sorted index is incorrectly labelled as an original position, losing a duplicate match.",
  explanation: "Combine checked binary search with original-record provenance. Preserve the supplied original list, sort a copy, and run first-occurrence search on that sorted copy for each target. Separately identify every position in the original list whose value matches the target. The seeded tool returns the sorted index as the only original position. Repair that transformation: in an unsorted list with duplicate values, the first sorted position can identify neither original record correctly. Inspect the full sorted search trace and all original positions. Test a repeated target, an absent target and empty input. Independent contexts shift values while preserving the identity problem. Sorting and searching remain real Python operations; the original-index evidence must come from the original list rather than a title or guessed ordinal.",
  reasoning: ["A position is meaningful only relative to the particular ordered collection it indexes.", "A first matching sorted position cannot by itself represent every original duplicate record."], starter: provenance(true), reference: provenance(), faulty: provenance(true), cases: provenanceCases("sorted-original-provenance", 0), transfer: [1, 2].map(index => ({ task: "Search the sorted copy for the new targets and report all matching original positions separately. Preserve duplicates and explicit empty results.", starter: provenance(true), reference: provenance(), cases: provenanceCases(`new-original-index-${index}`, index) })), prediction: { prompt: "A target is first in sorted order but originally appears at positions zero and two. What original indices should be retained?", choices: ["Only its sorted position", "Both zero and two", "Neither because sorting erases identity"], correct: 1 },
});
function fairness(faulty = false) { return algorithmSource(`from algorithm_core import insertion, selection
def solve(data):
    first_input = list(data['items'])
    second_input = ${faulty ? "sorted(data['items'])" : "list(data['items'])"}
    return {'insertion_input': first_input, 'selection_input': second_input, 'insertion': insertion(first_input), 'selection': selection(second_input)}
`); }
function fairnessCases(id: string, index: number) { return algorithmSamples[index]!.slice(0, 2).map((items, variant) => { const sorted = sortedExpected(items); return scenario(`${id}-${variant}`, { items }, eq("result", { insertion_input: items, selection_input: items, ...sorted }, "The real algorithms start from identical original ordering, preserve their actual pass traces and count the same value-comparison operation")); }); }
const fair = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2, workbench: "python", title: "Retrieve control of the input in a fair comparison", objective: "Repair an experiment that gives one sorting strategy already ordered input while the other receives the original data.", concepts: ["retrieval", "controlled experiment", "input order", "trace evidence"], essentialChecks: ["Both strategies receive identical original ordering", "Actual algorithm outputs and passes are retained", "Counters measure value comparisons"], faultDescription: "Selection receives a sorted copy while insertion receives the unsorted original, so the experiment changes two variables.",
  explanation: "A fair comparison controls more than counter names. The seeded experiment gives insertion the original synthetic list but gives selection an already sorted copy. Although final sorted values agree and both counters measure value comparisons, their starting conditions differ. Repair the second input to copy the same original order without mutating the caller's data. Return the actual two starting inputs alongside complete pass traces and counters. Test duplicates, negative values and an empty or singleton collection. Explain that input ordering can change algorithm behaviour, and comparisons between different inputs cannot isolate the choice of strategy. Independent data changes order and values. Preserve honest actual measurements rather than editing counts to force a preferred winner.",
  reasoning: ["A controlled algorithm experiment must hold the data and its order constant as well as the measured operation.", "Returning actual starting inputs lets a reviewer detect a confound that equal final output would hide."], starter: fairness(true), reference: fairness(), faulty: fairness(true), cases: fairnessCases("controlled-sort-inputs", 0), transfer: [1, 2].map(index => ({ task: "Repair the experiment for the new data so insertion and selection receive identical original ordering. Retain actual inputs, passes and comparable counters.", starter: fairness(true), reference: fairness(), cases: fairnessCases(`new-controlled-sort-${index}`, index) })), prediction: { prompt: "Both strategies sort correctly, but only one starts with already sorted data. Is algorithm choice the only changed variable?", choices: ["Yes", "Only if the final values match", "No, input order is another changed variable"], correct: 2 },
});
function orderedQueries(faulty = false) { return algorithmSource(`def solve(data):
    values, queries = data['items'], data['targets']
    validation_checks = 0
    ordered = True
    for index in range(1, ${faulty ? "min(2, len(values))" : "len(values)"}):
        validation_checks += 1
        if values[index - 1] > values[index]:
            ordered = False
            break
    rows = []
    if ordered:
        for target in queries:
            lo, hi, found, probes = 0, len(values) - 1, None, []
            while lo <= hi:
                mid = (lo + hi) // 2
                probes.append(mid)
                if values[mid] >= target:
                    if values[mid] == target: found = mid
                    hi = mid - 1
                else: lo = mid + 1
            rows.append({'target': target, 'index': found, 'probes': probes})
    return {'ordered': ordered, 'validation_checks': validation_checks, 'queries': rows, 'validation_scope': 'One complete adjacent-order check before all queries; input is not modified between searches.'}
`); }
function orderedQueryCases(id: string, index: number) { const shift = index * 4; return [[shift, shift + 1, shift + 1, shift + 3], [shift, shift + 3, shift + 1]].map((items, variant) => { const targets = [shift + 1, 100], first = binaryExpected(items, targets[0]!); return scenario(`${id}-${variant}`, { items, targets }, eq("result.ordered", first.status !== "unsorted", "The actual full ordering invariant is established before any query"), eq("result.validation_checks", first.precondition_checks, "The complete adjacent validation actually runs once, including a late inversion"), eq("result.queries", first.status === "unsorted" ? [] : targets.map(target => { const result = binaryExpected(items, target); return { target, index: result.index, probes: result.probes.map(probe => probe.mid) }; }), "Each real query uses the same unchanged validated data or no queries run after invalid input")); }); }
const batch = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3, workbench: "python", title: "Retrieve the invariant across a batch of searches", objective: "Validate complete ordering once before searching an unchanged collection for multiple targets.", concepts: ["retrieval", "invariant", "batch", "validation scope", "late inversion"], essentialChecks: ["Complete ordering is checked once", "Invalid input prevents every search", "Each query has an actual probe history"], faultDescription: "Only the first adjacent pair is checked, so a later inversion is wrongly accepted as a valid sorted collection.",
  explanation: "Batch several searches against one unchanged ordered collection. Validate the complete adjacent ordering once before the query loop, count those checks, and run no query if any inversion is found. The seeded validation checks only the first pair, overlooking a later inversion. Repair the scan bound without adding a hidden sort or changing the original index meaning. For valid data, run first-occurrence binary search separately for each target and record its actual midpoint positions. For invalid data, return ordered=false and an empty query list. Explain why one validation can cover the batch only while the values remain unchanged; any mutation would require validation again. Independent datasets shift duplicate values and move the late inversion. The result demonstrates this bounded batch invariant rather than claiming validation has no cost.",
  reasoning: ["An invariant must cover every relevant part of the collection; a passing first pair cannot establish global ordering.", "Validation can be shared across queries only when the validated data remains unchanged."], starter: orderedQueries(true), reference: orderedQueries(), faulty: orderedQueries(true), cases: orderedQueryCases("batch-order-invariant", 0), debugCases: orderedQueryCases("batch-order-invariant-debug", 0).slice().reverse(), transfer: [1, 2].map(index => ({ task: "Validate the new collection completely once, then run all actual searches only if the unchanged data is ordered. Preserve validation count and per-query probe histories.", starter: orderedQueries(true), reference: orderedQueries(), cases: orderedQueryCases(`new-batch-invariant-${index}`, index) })), prediction: { prompt: "The first pair is ordered but a later pair is inverted. May binary searches proceed?", choices: ["No, the full ordering invariant failed", "Yes, the first pair passed", "Only if the list title says sorted"], correct: 0 },
});
export const algorithmEvaluationRetrievalActivities = [provenanceLesson, fair, batch];
