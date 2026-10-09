import { buildMatchVariants } from "./svgMatching";
import type { SynopticMapArea } from "./modelParsing";

export type SvgMatchMap = Map<string, SVGElement[]>;
const renderableSelector = "g, path, polygon, polyline, rect, circle, ellipse, line, text";

export function indexSvg(svg: SVGSVGElement, areas: SynopticMapArea[]): SvgMatchMap {
    const matchMap: SvgMatchMap = new Map();
    const areaBySelector = new Map<string, SynopticMapArea>();
    for (const area of areas) if (area.selector) areaBySelector.set(area.selector.replace(/^\./, ""), area);
    for (const element of collectRenderableElements(svg)) {
        const area = resolveAreaMetadata(element, areaBySelector);
        if (area?.unmatchable) continue;
        if (area?.displayName) element.setAttribute("data-synoptic-display-name", area.displayName);
        const candidates = [area?.displayName, area?.elementId, element.id, element.getAttribute("title"), readTitleNode(element), readElementDisplayName(element)];
        for (const candidate of candidates) for (const variant of buildMatchVariants(candidate)) {
            const elements = matchMap.get(variant) ?? [];
            if (!elements.includes(element)) elements.push(element);
            matchMap.set(variant, elements);
        }
    }
    return matchMap;
}

export function inferAreas(svg: SVGSVGElement): SynopticMapArea[] {
    const areas: SynopticMapArea[] = [];
    for (const element of collectRenderableElements(svg)) {
        const elementId = element.id || undefined;
        const displayName = readTitleNode(element) ?? element.getAttribute("title") ?? elementId;
        const parentMatchableName = findMatchableParentName(element);
        const unmatchable = isIgnoredOrExcluded(element) || isExcludedParent(element);
        if (!elementId && !displayName && !parentMatchableName) continue;
        areas.push({ selector: elementId ? `#${escapeSelector(elementId)}` : undefined, elementId, displayName: parentMatchableName ?? displayName ?? undefined, unmatchable });
    }
    return areas;
}

export function getMatchingElements(key: string, matchMap: SvgMatchMap): SVGElement[] {
    const matches: SVGElement[] = [];
    const seen = new Set<SVGElement>();
    for (const variant of buildMatchVariants(key)) for (const element of matchMap.get(variant) ?? []) {
        if (!seen.has(element)) { seen.add(element); matches.push(element); }
    }
    return matches;
}

export function getIndexedElements(matchMap: SvgMatchMap): Set<SVGElement> {
    const elements = new Set<SVGElement>();
    for (const matches of matchMap.values()) for (const element of matches) elements.add(element);
    return elements;
}

export function getUnmatchedElements(indexed: Set<SVGElement>, matched: Set<SVGElement>): Set<SVGElement> {
    return new Set(Array.from(indexed).filter((element) => !matched.has(element) && !hasMatchedDescendant(element, matched)));
}

function hasMatchedDescendant(element: SVGElement, matched: Set<SVGElement>): boolean {
    for (const candidate of matched) if (candidate !== element && element.contains(candidate)) return true;
    return false;
}
function resolveAreaMetadata(element: SVGElement, areas: Map<string, SynopticMapArea>): SynopticMapArea | undefined {
    for (const name of Array.from(element.classList)) { const area = areas.get(name); if (area) return area; }
    return undefined;
}
function collectRenderableElements(svg: SVGSVGElement): SVGElement[] { return Array.from(svg.querySelectorAll<SVGElement>(renderableSelector)); }
function isIgnoredOrExcluded(element: SVGElement): boolean { return element.matches("#_x5F_ignored, #_ignored, .excluded, #_x5F_excluded, #_excluded"); }
function isExcludedParent(element: SVGElement): boolean {
    const parent = element.parentElement?.closest("[id], svg");
    return Boolean(parent && parent.tagName.toLowerCase() !== "svg" && parent.matches(".excluded, #_x5F_excluded, #_excluded"));
}
function findMatchableParentName(element: SVGElement): string | null {
    const parent = element.parentElement?.closest("[id], svg") as SVGElement | null;
    if (!parent || parent.tagName.toLowerCase() === "svg" || parent.matches("#_x5F_ignored, #_ignored, .excluded, #_x5F_excluded, #_excluded")) return null;
    return readTitleNode(parent) ?? parent.getAttribute("title") ?? (parent.id || null);
}
function escapeSelector(value: string): string {
    const css = (window as Window & typeof globalThis & { CSS?: { escape?(input: string): string } }).CSS;
    return css?.escape ? css.escape(value) : value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}
function readTitleNode(element: SVGElement): string | null { return element.querySelector(":scope > title")?.textContent?.trim() ?? null; }
function readElementDisplayName(element: SVGElement): string | null {
    return element.getAttribute("data-synoptic-display-name") ?? readTitleNode(element) ?? element.getAttribute("title") ?? (element.id || null);
}
