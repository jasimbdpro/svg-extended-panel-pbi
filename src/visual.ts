"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;
import IColorPalette = powerbi.extensibility.IColorPalette;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import IVisual = powerbi.extensibility.visual.IVisual;
import ViewMode = powerbi.ViewMode;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

import { createSynopticModel, type SynopticDataPoint, type SynopticMapDefinition, type SynopticMapScale, type SynopticModel, type SynopticVisualSettings } from "./core/modelParsing";
import { getIndexedElements, getMatchingElements, getUnmatchedElements, indexSvg, inferAreas, type SvgMatchMap } from "./core/svgIndex";
import { DEFAULT_ZOOM, buildTransformStyle, createZeroPan, nextZoom, shouldResetPanForZoom } from "./core/zoomPan";
import { buildLabelText, buildUnmatchedLabelText, renderLabels, type LabelSpec } from "./core/labels";
import { applySelectionState } from "./core/selection";
import { attachTooltipEvents } from "./core/tooltips";
import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private readonly target: HTMLElement;
    private readonly host: powerbi.extensibility.visual.IVisualHost;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly root: HTMLDivElement;
    private readonly toolbar: HTMLDivElement;
    private readonly changeButton: HTMLButtonElement;
    private readonly fileInput: HTMLInputElement;
    private readonly status: HTMLDivElement;
    private readonly svgHost: HTMLDivElement;
    private readonly tooltipService: ITooltipService;
    private readonly mapCache: Map<string, string>;
    private readonly legendColorCache: Map<string, string>;
    private formattingSettings: VisualFormattingSettingsModel;
    private updateNonce: number;
    private currentSvg: SVGSVGElement | null;
    private currentMatchedElements: Set<SVGElement>;
    private currentSettings: SynopticVisualSettings["general"] | null;
    private readonly zoomBar: HTMLDivElement;
    private readonly zoomInButton: HTMLButtonElement;
    private readonly zoomOutButton: HTMLButtonElement;
    private readonly zoomResetButton: HTMLButtonElement;
    private readonly loadingIndicator: HTMLDivElement;
    private zoomLevel: number;
    private wheelListener: ((e: WheelEvent) => void) | null;
    private panOffset: { x: number; y: number };
    private panDragStart: { x: number; y: number; ox: number; oy: number } | null;
    private isPanDragging: boolean;
    private panMouseDownListener: ((e: MouseEvent) => void) | null;
    private panMouseMoveListener: ((e: MouseEvent) => void) | null;
    private panMouseUpListener: ((e: MouseEvent) => void) | null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.mapCache = new Map<string, string>();
        this.legendColorCache = new Map<string, string>();
        this.updateNonce = 0;
        this.currentSvg = null;
        this.currentMatchedElements = new Set();
        this.currentSettings = null;
        this.zoomLevel = DEFAULT_ZOOM;
        this.wheelListener = null;
        this.panOffset = createZeroPan();
        this.panDragStart = null;
        this.isPanDragging = false;
        this.panMouseDownListener = null;
        this.panMouseMoveListener = null;
        this.panMouseUpListener = null;

        this.selectionManager.registerOnSelectCallback(() => {
            const ids = this.selectionManager.getSelectionIds() as ISelectionId[];
            if (this.currentSvg) {
                applySelectionState(this.currentSvg, this.currentMatchedElements, ids);
            }
        });

        this.root = document.createElement("div");
        this.root.className = "synoptic-modern";

        this.toolbar = document.createElement("div");
        this.toolbar.className = "toolbar synoptic-toolbar";

        this.changeButton = document.createElement("button");
        this.changeButton.type = "button";
        this.changeButton.textContent = "Change";
        this.changeButton.title = "Load an SVG map";
        this.changeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.fileInput.click();
        });

        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = ".svg,image/svg+xml";
        this.fileInput.multiple = true;
        this.fileInput.className = "file";
        this.fileInput.addEventListener("click", (event) => event.stopPropagation());
        this.fileInput.addEventListener("change", () => this.handleLocalMapFiles(this.fileInput.files));

        this.toolbar.append(this.changeButton, this.fileInput);

        this.zoomBar = document.createElement("div");
        this.zoomBar.className = "synoptic-zoom-bar";

        const zoomInSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5.5" cy="5.5" r="4"/><line x1="3.5" y1="5.5" x2="7.5" y2="5.5"/><line x1="5.5" y1="3.5" x2="5.5" y2="7.5"/><line x1="8.7" y1="8.7" x2="13" y2="13"/></svg>`;
        const zoomOutSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5.5" cy="5.5" r="4"/><line x1="3.5" y1="5.5" x2="7.5" y2="5.5"/><line x1="8.7" y1="8.7" x2="13" y2="13"/></svg>`;
        const zoomResetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 1,1 4,1"/><polyline points="10,1 13,1 13,4"/><polyline points="13,10 13,13 10,13"/><polyline points="4,13 1,13 1,10"/></svg>`;

        this.zoomInButton = document.createElement("button");
        this.zoomInButton.type = "button";
        this.zoomInButton.appendChild(this.parseSvgIcon(zoomInSvg));
        this.zoomInButton.title = "Zoom in";
        this.zoomInButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.adjustZoom(0.25);
        });

        this.zoomOutButton = document.createElement("button");
        this.zoomOutButton.type = "button";
        this.zoomOutButton.appendChild(this.parseSvgIcon(zoomOutSvg));
        this.zoomOutButton.title = "Zoom out";
        this.zoomOutButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.adjustZoom(-0.25);
        });

        this.zoomResetButton = document.createElement("button");
        this.zoomResetButton.type = "button";
        this.zoomResetButton.appendChild(this.parseSvgIcon(zoomResetSvg));
        this.zoomResetButton.title = "Reset zoom";
        this.zoomResetButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.resetZoomAndPan();
        });

        const zoomSep = document.createElement("span");
        zoomSep.className = "synoptic-zoom-sep";

        this.zoomBar.append(this.zoomInButton, this.zoomOutButton, zoomSep, this.zoomResetButton);

        this.status = document.createElement("div");
        this.status.className = "synoptic-status";

        this.svgHost = document.createElement("div");
        this.svgHost.className = "synoptic-map-host";

        this.loadingIndicator = document.createElement("div");
        this.loadingIndicator.className = "synoptic-loading hidden";
        const spinner = document.createElement("div");
        spinner.className = "synoptic-spinner";
        this.loadingIndicator.appendChild(spinner);

        this.root.append(this.toolbar, this.zoomBar, this.status, this.loadingIndicator, this.svgHost);
        this.target.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            options.dataViews?.[0]
        );
        this.updateLegendColorSettings(options.dataViews?.[0]);

        this.root.style.width = `${options.viewport.width}px`;
        this.root.style.height = `${options.viewport.height}px`;
        this.toolbar.hidden = !this.isEditMode(options.viewMode);

        const model = this.transform(options.dataViews?.[0], this.host.colorPalette);
        this.changeButton.hidden = Boolean(model.map);

        const zoomEnabled = model.settings.toolbar.zoom;
        this.zoomBar.style.display = zoomEnabled ? "" : "none";
        this.zoomBar.style.top = this.isEditMode(options.viewMode) ? "36px" : "0";

        if (zoomEnabled && !this.wheelListener) {
            this.wheelListener = (e: WheelEvent) => {
                e.preventDefault();
                this.adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
            };
            this.svgHost.addEventListener("wheel", this.wheelListener, { passive: false });

            this.panMouseDownListener = (e: MouseEvent) => {
                if (e.button !== 0 || this.zoomLevel <= 1) return;
                this.panDragStart = { x: e.clientX, y: e.clientY, ox: this.panOffset.x, oy: this.panOffset.y };
                this.svgHost.style.cursor = "grabbing";
            };
            this.panMouseMoveListener = (e: MouseEvent) => {
                if (!this.panDragStart) return;
                const dx = e.clientX - this.panDragStart.x;
                const dy = e.clientY - this.panDragStart.y;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    this.isPanDragging = true;
                }
                this.panOffset = { x: this.panDragStart.ox + dx, y: this.panDragStart.oy + dy };
                this.applyTransform();
            };
            this.panMouseUpListener = () => {
                if (!this.panDragStart) return;
                this.panDragStart = null;
                this.svgHost.style.cursor = this.zoomLevel > 1 ? "grab" : "";
                if (this.isPanDragging) {
                    setTimeout(() => { this.isPanDragging = false; }, 0);
                }
            };
            this.svgHost.addEventListener("mousedown", this.panMouseDownListener);
            document.addEventListener("mousemove", this.panMouseMoveListener);
            document.addEventListener("mouseup", this.panMouseUpListener);
        } else if (!zoomEnabled && this.wheelListener) {
            this.svgHost.removeEventListener("wheel", this.wheelListener);
            this.wheelListener = null;
            if (this.panMouseDownListener) {
                this.svgHost.removeEventListener("mousedown", this.panMouseDownListener);
                this.panMouseDownListener = null;
            }
            if (this.panMouseMoveListener) {
                document.removeEventListener("mousemove", this.panMouseMoveListener);
                this.panMouseMoveListener = null;
            }
            if (this.panMouseUpListener) {
                document.removeEventListener("mouseup", this.panMouseUpListener);
                this.panMouseUpListener = null;
            }
            this.panOffset = { x: 0, y: 0 };
            this.applyTransform();
            this.svgHost.style.cursor = "";
        }

        if (zoomEnabled && !this.panDragStart) {
            this.svgHost.style.cursor = this.zoomLevel > 1 ? "grab" : "";
        }

        const currentNonce = ++this.updateNonce;

        void this.render(model, currentNonce);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        if (!this.formattingSettings) {
            this.formattingSettings = new VisualFormattingSettingsModel();
        }
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private transform(dataView: DataView | undefined, colorPalette: IColorPalette): SynopticModel<ISelectionId> {
        return createSynopticModel(dataView, {
            getColor: (key) => this.getLegendColor(key, colorPalette),
            createSelectionId: (categoryColumn, index) => this.host.createSelectionIdBuilder()
                .withCategory(categoryColumn, index)
                .createSelectionId()
        });
    }

    private updateLegendColorSettings(dataView: DataView | undefined): void {
        const columns = dataView?.categorical?.categories;
        const legendColumn = columns?.find((column) => column.source.roles?.Legend);
        const colorColumn = legendColumn;
        const categories: Array<{ name: string; color: string; selector: powerbi.data.Selector }> = [];
        const seen = new Set<string>();

        for (let index = 0; index < (colorColumn?.values.length ?? 0); index++) {
            const rawValue = colorColumn?.values[index];
            if (rawValue == null) {
                continue;
            }

            const name = String(rawValue);
            if (seen.has(name)) {
                continue;
            }
            seen.add(name);

            const storedFill = colorColumn?.objects?.[index]?.["legend"] as { fill?: { solid?: { color?: string } } } | undefined;
            categories.push({
                name,
                color: storedFill?.fill?.solid?.color ?? this.getLegendColor(name, this.host.colorPalette),
                selector: this.host.createSelectionIdBuilder()
                    .withCategory(colorColumn!, index)
                    .createSelectionId()
                    .getSelector()
            });
        }

        this.formattingSettings.legend.setCategoryColors(
            categories,
            "Legend colors"
        );
    }

    private getLegendColor(key: string, colorPalette: IColorPalette): string {
        const cachedColor = this.legendColorCache.get(key);
        if (cachedColor) {
            return cachedColor;
        }

        const color = colorPalette.getColor(key).value;
        this.legendColorCache.set(key, color);
        return color;
    }

    private async render(model: SynopticModel<ISelectionId>, nonce: number): Promise<void> {
        this.status.textContent = "";
        this.svgHost.replaceChildren();

        if (!model.map) {
            this.loadingIndicator.classList.add("hidden");
            return;
        }

        this.loadingIndicator.classList.remove("hidden");

        try {
            const svgMarkup = await this.loadMapMarkup(model.map);
            if (nonce !== this.updateNonce) {
                return;
            }

            // Yield a frame before the heavy synchronous work (DOM parsing, indexing,
            // event-listener attachment) so PBI Desktop's UI thread stays responsive.
            await new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
            if (nonce !== this.updateNonce) {
                return;
            }

            const svgElement = this.inflateSvg(svgMarkup);
            this.applySavedScale(svgElement, model.map.scale);

            const areas = model.map.areas && model.map.areas.length > 0
                ? model.map.areas
                : inferAreas(svgElement);
            const matchMap = indexSvg(svgElement, areas);
            const { matchedElements, labels: labelSpecs } = this.applyData(svgElement, matchMap, model);

            this.svgHost.appendChild(svgElement);
            this.loadingIndicator.classList.add("hidden");
            this.currentSvg = svgElement;
            this.currentMatchedElements = matchedElements;
            this.currentSettings = model.settings.general;

            // Render labels after the SVG is in the DOM so getBBox() returns real bounds.
            if (model.settings.dataLabels.show) {
                renderLabels(svgElement, labelSpecs, model.settings);
            }

            const activeIds = this.selectionManager.getSelectionIds() as ISelectionId[];
            if (activeIds.length > 0) {
                applySelectionState(svgElement, matchedElements, activeIds);
            }

            const matchedCount = model.dataPoints.filter((point) => getMatchingElements(point.key, matchMap).length > 0).length;
            this.status.textContent = this.buildStatusText(model, areas.length, matchMap.size, matchedCount);
            const highlightedCount = model.dataPoints.filter((point) => point.isHighlighted).length;
            this.writeDiagnostic(model.settings, "render", {
                matchedAreas: matchedCount,
                dataPoints: model.dataPoints.length,
                highlightedDataPoints: highlightedCount,
                svgAreas: areas.length,
                indexedKeys: matchMap.size,
                hasMap: Boolean(model.map),
                hasBoundStates: model.hasBoundStates,
                hasHighlights: model.hasHighlights,
                mapName: model.map.displayName ?? model.map.URL ?? "inline SVG"
            });
        } catch (error) {
            if (nonce !== this.updateNonce) {
                return;
            }

            this.loadingIndicator.classList.add("hidden");
            this.status.textContent = "Unable to load the configured SVG map.";
            this.writeDiagnostic(model.settings, "render error", error, true);
        }
    }

    private applyData(svgElement: SVGSVGElement, matchMap: SvgMatchMap, model: SynopticModel<ISelectionId>): { matchedElements: Set<SVGElement>; labels: LabelSpec[] } {
        const matchedElements = new Set<SVGElement>();
        const labels: LabelSpec[] = [];
        svgElement.setAttribute("data-has-highlights", model.hasHighlights ? "true" : "false");

        for (const point of model.dataPoints) {
            const matches = getMatchingElements(point.key, matchMap);
            if (matches.length === 0) {
                continue;
            }

            for (const element of matches) {
                matchedElements.add(element);
                element.style.fill = point.color;
                element.style.cursor = "pointer";
                element.setAttribute("data-selection-key", point.selectionId.getKey());
                if (model.hasHighlights) {
                    element.setAttribute("data-highlighted", point.isHighlighted ? "true" : "false");
                } else {
                    element.removeAttribute("data-highlighted");
                }

                if (model.settings.dataPoint.borders) {
                    element.style.stroke = element.style.stroke || "#5f6b6d";
                    element.style.strokeWidth = element.style.strokeWidth || "1";
                }

                attachTooltipEvents(element, this.root, this.tooltipService, point.tooltips, point.selectionId);
                element.addEventListener("click", (event: MouseEvent) => {
                    if (this.isPanDragging) { event.stopPropagation(); return; }
                    event.preventDefault();
                    event.stopPropagation();

                    void this.selectionManager.select(point.selectionId, event.ctrlKey || event.metaKey).then(() => {
                        const ids = this.selectionManager.getSelectionIds() as ISelectionId[];
                        if (this.currentSettings?.showDiagnostic) {
                            this.status.textContent = `sel:${ids.length} has:${this.selectionManager.hasSelection()} svg:${!!this.currentSvg}`;
                        }
                        if (this.currentSvg) {
                            applySelectionState(this.currentSvg, this.currentMatchedElements, ids);
                        }
                    });
                });

                const labelText = buildLabelText(point, element, model.settings);
                if (labelText) {
                    labels.push({
                        element,
                        text: labelText
                    });
                }
            }
        }

        if (model.hasHighlights) {
            svgElement.setAttribute("data-synoptic-dimmed", "true");
            for (const element of matchedElements) {
                const isHighlighted = element.getAttribute("data-highlighted") === "true";
                if (isHighlighted) {
                    element.setAttribute("data-synoptic-active", "true");
                }
            }
        }

        const indexedElements = getIndexedElements(matchMap);

        const unmatchedElements = getUnmatchedElements(indexedElements, matchedElements);

        for (const element of indexedElements) {
            if (!matchedElements.has(element)) {
                if (model.settings.general.showUnmatched) {
                    element.style.display = "";
                    const unmatchedFill = model.settings.dataPoint.unmatchedFill;
                    if (unmatchedFill) {
                        element.style.fill = unmatchedFill;
                    }
                } else {
                    // Keep the element visible if it is an ancestor OR a descendant of a matched element,
                    // to avoid hiding matched children or matched parent containers.
                    let isRelatedToMatched = false;
                    for (const matched of matchedElements) {
                        if (element.contains(matched) || matched.contains(element)) {
                            isRelatedToMatched = true;
                            break;
                        }
                    }
                    if (!isRelatedToMatched) {
                        element.style.display = "none";
                    }
                }
            }
        }

        if (model.settings.dataLabels.show && model.settings.dataLabels.unmatchedLabels && model.settings.general.showUnmatched) {
            for (const element of indexedElements) {
                if (matchedElements.has(element)) {
                    continue;
                }

                const labelText = buildUnmatchedLabelText(element, model.settings);
                if (labelText) {
                    labels.push({
                        element,
                        text: labelText
                    });
                }
            }
        }

        svgElement.addEventListener("click", () => {
            if (this.isPanDragging) { return; }
            void this.selectionManager.clear().then(() => {
                if (this.currentSvg) {
                    applySelectionState(this.currentSvg, this.currentMatchedElements, []);
                }
            });
        });

        return { matchedElements, labels };
    }

    private parseSvgIcon(svgMarkup: string): SVGSVGElement {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
        return document.importNode(doc.documentElement as unknown as SVGSVGElement, true);
    }

    private inflateSvg(svgMarkup: string): SVGSVGElement {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
        const svgElement = doc.documentElement as unknown as SVGSVGElement;
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.maxWidth = "100%";
        svgElement.style.maxHeight = "100%";
        svgElement.setAttribute("preserveAspectRatio", svgElement.getAttribute("preserveAspectRatio") || "xMidYMid meet");
        return document.importNode(svgElement, true);
    }

    private applySavedScale(svgElement: SVGSVGElement, scale: SynopticMapScale | undefined): void {
        const value = scale?.scale ?? 1;
        const translation = scale?.translation ?? [0, 0];
        if (value === 1 && translation[0] === 0 && translation[1] === 0) {
            return;
        }

        const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.setAttribute("transform", `translate(${translation[0]}, ${translation[1]}) scale(${value})`);

        while (svgElement.firstChild) {
            wrapper.appendChild(svgElement.firstChild);
        }

        svgElement.appendChild(wrapper);
    }

    private async loadMapMarkup(map: SynopticMapDefinition): Promise<string> {
        const inlineData = map.data?.trim();
        if (this.looksLikeSvgMarkup(inlineData)) {
            return inlineData;
        }

        const url = map.URL?.trim();
        if (!url) {
            throw new Error("No SVG payload is available for this map.");
        }

        const cached = this.mapCache.get(url);
        if (cached) {
            return cached;
        }

        // In Power BI Service, the CSP is built from capabilities.json WebAccess parameters.
        // Check privilege status first so we can surface a helpful message when web access
        // is administratively disabled, rather than letting the browser throw a CSP error.
        const accessStatus = await (this.host.webAccessService.webAccessStatus(url) as unknown as Promise<powerbi.PrivilegeStatus>);
        if (accessStatus !== powerbi.PrivilegeStatus.Allowed) {
            if (accessStatus === powerbi.PrivilegeStatus.DisabledByAdmin) {
                throw new Error("Web access is disabled by the Power BI administrator. To load external SVG maps, ask your admin to enable 'Allow visuals to access external resources' in tenant settings.");
            }
            throw new Error(`Web access to this URL is not permitted in the current environment (status: ${accessStatus}).`);
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Map fetch failed with status ${response.status}`);
        }

        const svgMarkup = await response.text();
        this.mapCache.set(url, svgMarkup);
        return svgMarkup;
    }

    private handleLocalMapFiles(fileList: FileList | null): void {
        const files = Array.from(fileList ?? [])
            .filter((file) => file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"));

        if (files.length === 0) {
            this.status.textContent = "Please select an SVG file.";
            this.fileInput.value = "";
            return;
        }

        Promise.all(files.map((file) => this.readSvgFile(file)))
            .then((maps) => {
                const validMaps = maps.filter((map): map is SynopticMapDefinition => Boolean(map));
                if (validMaps.length === 0) {
                    this.status.textContent = "The selected file did not contain SVG markup.";
                    return;
                }

                this.host.persistProperties({
                    merge: [{
                        objectName: "general",
                        selector: null,
                        properties: {
                            imageData: JSON.stringify(validMaps),
                            imageSelected: 0
                        }
                    }]
                });

                const suffix = validMaps.length === 1 ? "" : "s";
                this.status.textContent = `Loaded ${validMaps.length} SVG map${suffix}.`;
            })
            .catch((error) => {
                this.status.textContent = error instanceof Error ? error.message : "Could not load the selected SVG file.";
            })
            .finally(() => {
                this.fileInput.value = "";
            });
    }

    private readSvgFile(file: File): Promise<SynopticMapDefinition | null> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const data = String(reader.result ?? "").trim();
                if (!this.looksLikeSvgMarkup(data)) {
                    resolve(null);
                    return;
                }

                resolve({
                    URL: null,
                    data,
                    displayName: file.name.replace(/\.svg$/i, ""),
                    areas: [],
                    scale: {
                        scale: 1,
                        translation: [0, 0]
                    }
                });
            };
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
            reader.readAsText(file);
        });
    }

    private looksLikeSvgMarkup(value: string | undefined): value is string {
        return Boolean(value && /<svg[\s>]/i.test(value));
    }

    private buildStatusText(model: SynopticModel<ISelectionId>, svgAreaCount: number, indexedKeyCount: number, matchedCount: number): string {
        if (!model.settings.general.showMatchCount && !model.settings.general.showDiagnostic) {
            return "";
        }

        const baseStatus = model.settings.general.showMatchCount
            ? `${matchedCount}/${model.dataPoints.length} areas matched`
            : "";

        if (!model.settings.general.showDiagnostic) {
            return baseStatus;
        }

        const highlightedCount = model.dataPoints.filter((point) => point.isHighlighted).length;
        return [
            baseStatus,
            `${highlightedCount} highlighted`,
            `${svgAreaCount} SVG areas`,
            `${indexedKeyCount} indexed keys`,
            model.hasHighlights ? "highlighted" : "no highlights"
        ].join(" | ");
    }

    private applyTransform(): void {
        const transformStyle = buildTransformStyle(this.zoomLevel, this.panOffset);
        this.svgHost.style.transform = transformStyle.transform;
        this.svgHost.style.transformOrigin = transformStyle.transformOrigin;
    }

    private adjustZoom(delta: number): void {
        this.zoomLevel = nextZoom(this.zoomLevel, delta);
        if (shouldResetPanForZoom(this.zoomLevel)) {
            this.panOffset = createZeroPan();
        }
        this.applyTransform();
        if (this.panMouseDownListener !== null) {
            this.svgHost.style.cursor = this.zoomLevel > DEFAULT_ZOOM ? "grab" : "";
        }
    }

    private resetZoomAndPan(): void {
        this.zoomLevel = DEFAULT_ZOOM;
        this.panOffset = createZeroPan();
        this.panDragStart = null;
        this.applyTransform();
        if (this.panMouseDownListener !== null) {
            this.svgHost.style.cursor = "";
        }
    }

    private isEditMode(viewMode: ViewMode | undefined): boolean {
        return viewMode === ViewMode.Edit || viewMode === ViewMode.InFocusEdit;
    }

    private writeDiagnostic(settings: SynopticVisualSettings, label: string, details: unknown, forceError = false): void {
        if (!settings.general.showDiagnostic) {
            return;
        }

        const prefix = `Synoptic Panel ${label}`;
        if (forceError) {
            console.error(prefix, details);
            return;
        }

        console.info(prefix, details);
    }

}
