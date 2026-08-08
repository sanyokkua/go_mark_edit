export namespace apperr {
	
	export enum ErrorCode {
	    Busy = "busy",
	    Cancelled = "cancelled",
	    IO = "io",
	    Internal = "internal",
	    NotFound = "not_found",
	    Permission = "permission",
	    Timeout = "timeout",
	    Unsupported = "unsupported",
	    Validation = "validation",
	}
	export class ActiveBuffer {
	    documentId: string;
	    documentRevision: number;
	    projectionRevision: number;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new ActiveBuffer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.documentId = source["documentId"];
	        this.documentRevision = source["documentRevision"];
	        this.projectionRevision = source["projectionRevision"];
	        this.content = source["content"];
	    }
	}
	export class UILayout {
	    windowWidth?: number;
	    windowHeight?: number;
	    windowMaximized?: boolean;
	    sidebarVisible?: boolean;
	    sidebarWidth?: number;
	    viewArrangement?: string;
	    editorPaneVisible?: boolean;
	    previewPaneVisible?: boolean;
	    assistantVisible?: boolean;
	    assistantWidth?: number;
	
	    static createFrom(source: any = {}) {
	        return new UILayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.windowWidth = source["windowWidth"];
	        this.windowHeight = source["windowHeight"];
	        this.windowMaximized = source["windowMaximized"];
	        this.sidebarVisible = source["sidebarVisible"];
	        this.sidebarWidth = source["sidebarWidth"];
	        this.viewArrangement = source["viewArrangement"];
	        this.editorPaneVisible = source["editorPaneVisible"];
	        this.previewPaneVisible = source["previewPaneVisible"];
	        this.assistantVisible = source["assistantVisible"];
	        this.assistantWidth = source["assistantWidth"];
	    }
	}
	export class ScrollOffsets {
	    editor: number;
	    preview: number;
	
	    static createFrom(source: any = {}) {
	        return new ScrollOffsets(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.editor = source["editor"];
	        this.preview = source["preview"];
	    }
	}
	export class SelectionRange {
	    start: CursorPosition;
	    end: CursorPosition;
	
	    static createFrom(source: any = {}) {
	        return new SelectionRange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = this.convertValues(source["start"], CursorPosition);
	        this.end = this.convertValues(source["end"], CursorPosition);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CursorPosition {
	    line: number;
	    column: number;
	
	    static createFrom(source: any = {}) {
	        return new CursorPosition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.line = source["line"];
	        this.column = source["column"];
	    }
	}
	export class DocView {
	    arrangement: string;
	    editorVisible: boolean;
	    previewVisible: boolean;
	    cursor: CursorPosition;
	    selection: SelectionRange;
	    scroll: ScrollOffsets;
	
	    static createFrom(source: any = {}) {
	        return new DocView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.arrangement = source["arrangement"];
	        this.editorVisible = source["editorVisible"];
	        this.previewVisible = source["previewVisible"];
	        this.cursor = this.convertValues(source["cursor"], CursorPosition);
	        this.selection = this.convertValues(source["selection"], SelectionRange);
	        this.scroll = this.convertValues(source["scroll"], ScrollOffsets);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DocumentMetadata {
	    documentId: string;
	    title: string;
	    path: string;
	    displayName?: string;
	    parentName?: string;
	    dirty: boolean;
	    encoding: string;
	    bom?: string;
	    lineEnding: string;
	    wordCount: number;
	    contentRevision?: number;
	    capability?: string;
	    sizeClass?: string;
	    detached?: boolean;
	    status?: string;
	    view: DocView;
	
	    static createFrom(source: any = {}) {
	        return new DocumentMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.documentId = source["documentId"];
	        this.title = source["title"];
	        this.path = source["path"];
	        this.displayName = source["displayName"];
	        this.parentName = source["parentName"];
	        this.dirty = source["dirty"];
	        this.encoding = source["encoding"];
	        this.bom = source["bom"];
	        this.lineEnding = source["lineEnding"];
	        this.wordCount = source["wordCount"];
	        this.contentRevision = source["contentRevision"];
	        this.capability = source["capability"];
	        this.sizeClass = source["sizeClass"];
	        this.detached = source["detached"];
	        this.status = source["status"];
	        this.view = this.convertValues(source["view"], DocView);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppStateSnapshot {
	    revision: number;
	    tabSetRevision: number;
	    applicationVersion: string;
	    documents: Record<string, DocumentMetadata>;
	    orderedDocumentIds: string[];
	    activeDocumentId?: string;
	    activeDocument?: string;
	    recentFiles?: string[];
	    canReopenLastFile: boolean;
	    ui: UILayout;
	
	    static createFrom(source: any = {}) {
	        return new AppStateSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.revision = source["revision"];
	        this.tabSetRevision = source["tabSetRevision"];
	        this.applicationVersion = source["applicationVersion"];
	        this.documents = this.convertValues(source["documents"], DocumentMetadata, true);
	        this.orderedDocumentIds = source["orderedDocumentIds"];
	        this.activeDocumentId = source["activeDocumentId"];
	        this.activeDocument = source["activeDocument"];
	        this.recentFiles = source["recentFiles"];
	        this.canReopenLastFile = source["canReopenLastFile"];
	        this.ui = this.convertValues(source["ui"], UILayout);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppState {
	    snapshot: AppStateSnapshot;
	    activeBuffer?: ActiveBuffer;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.snapshot = this.convertValues(source["snapshot"], AppStateSnapshot);
	        this.activeBuffer = this.convertValues(source["activeBuffer"], ActiveBuffer);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AppearanceSettings {
	    theme: string;
	    mode: string;
	    defaultOpenMode: string;
	
	    static createFrom(source: any = {}) {
	        return new AppearanceSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.mode = source["mode"];
	        this.defaultOpenMode = source["defaultOpenMode"];
	    }
	}
	export class ClassifiedError {
	    category: string;
	    safeSubject?: string;
	    message: string;
	    remediation?: string;
	    documentId?: string;
	    dedupKey: string;
	
	    static createFrom(source: any = {}) {
	        return new ClassifiedError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category = source["category"];
	        this.safeSubject = source["safeSubject"];
	        this.message = source["message"];
	        this.remediation = source["remediation"];
	        this.documentId = source["documentId"];
	        this.dedupKey = source["dedupKey"];
	    }
	}
	export class CommittedWriteOutcome {
	    documentId: string;
	    writtenContentRevision: number;
	    committedProjectionRevision: number;
	    targetPath?: string;
	    targetPathAdopted: boolean;
	    lineEndingOutcome: string;
	    bomOutcome: string;
	    resyncRequired: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CommittedWriteOutcome(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.documentId = source["documentId"];
	        this.writtenContentRevision = source["writtenContentRevision"];
	        this.committedProjectionRevision = source["committedProjectionRevision"];
	        this.targetPath = source["targetPath"];
	        this.targetPathAdopted = source["targetPathAdopted"];
	        this.lineEndingOutcome = source["lineEndingOutcome"];
	        this.bomOutcome = source["bomOutcome"];
	        this.resyncRequired = source["resyncRequired"];
	    }
	}
	export class ContentPrivacySettings {
	    remotePolicy: string;
	
	    static createFrom(source: any = {}) {
	        return new ContentPrivacySettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.remotePolicy = source["remotePolicy"];
	    }
	}
	
	
	export class DocViewInput {
	    editorVisible: boolean;
	    previewVisible: boolean;
	    cursor: CursorPosition;
	    selection: SelectionRange;
	    scroll: ScrollOffsets;
	
	    static createFrom(source: any = {}) {
	        return new DocViewInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.editorVisible = source["editorVisible"];
	        this.previewVisible = source["previewVisible"];
	        this.cursor = this.convertValues(source["cursor"], CursorPosition);
	        this.selection = this.convertValues(source["selection"], SelectionRange);
	        this.scroll = this.convertValues(source["scroll"], ScrollOffsets);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class DocumentTransitionResult {
	    data?: ActiveBuffer;
	    error?: ClassifiedError;
	
	    static createFrom(source: any = {}) {
	        return new DocumentTransitionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = this.convertValues(source["data"], ActiveBuffer);
	        this.error = this.convertValues(source["error"], ClassifiedError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EditorSettings {
	    lineNumbers: boolean;
	    wordWrap: boolean;
	    fontSize: number;
	
	    static createFrom(source: any = {}) {
	        return new EditorSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lineNumbers = source["lineNumbers"];
	        this.wordWrap = source["wordWrap"];
	        this.fontSize = source["fontSize"];
	    }
	}
	export class MarkdownSettings {
	    standard: string;
	    formatOnSave: boolean;
	    lintOnSave: boolean;
	    bulletMarker: string;
	    emphasisMarker: string;
	    headingStyle: string;
	
	    static createFrom(source: any = {}) {
	        return new MarkdownSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.standard = source["standard"];
	        this.formatOnSave = source["formatOnSave"];
	        this.lintOnSave = source["lintOnSave"];
	        this.bulletMarker = source["bulletMarker"];
	        this.emphasisMarker = source["emphasisMarker"];
	        this.headingStyle = source["headingStyle"];
	    }
	}
	export class OpenResult {
	    status: string;
	    documentId?: string;
	    projectionRevision?: number;
	    activeBuffer?: ActiveBuffer;
	    error?: ClassifiedError;
	
	    static createFrom(source: any = {}) {
	        return new OpenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.documentId = source["documentId"];
	        this.projectionRevision = source["projectionRevision"];
	        this.activeBuffer = this.convertValues(source["activeBuffer"], ActiveBuffer);
	        this.error = this.convertValues(source["error"], ClassifiedError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class Settings {
	    appearance: AppearanceSettings;
	    markdown: MarkdownSettings;
	    contentPrivacy: ContentPrivacySettings;
	    editor: EditorSettings;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appearance = this.convertValues(source["appearance"], AppearanceSettings);
	        this.markdown = this.convertValues(source["markdown"], MarkdownSettings);
	        this.contentPrivacy = this.convertValues(source["contentPrivacy"], ContentPrivacySettings);
	        this.editor = this.convertValues(source["editor"], EditorSettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WireError {
	    code: ErrorCode;
	    title: string;
	    message: string;
	    details?: Record<string, string>;
	    retryable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WireError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.title = source["title"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.retryable = source["retryable"];
	    }
	}
	export class SettingsResult {
	    data?: Settings;
	    error?: WireError;
	
	    static createFrom(source: any = {}) {
	        return new SettingsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = this.convertValues(source["data"], Settings);
	        this.error = this.convertValues(source["error"], WireError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StateResult {
	    data?: AppState;
	    error?: WireError;
	
	    static createFrom(source: any = {}) {
	        return new StateResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = this.convertValues(source["data"], AppState);
	        this.error = this.convertValues(source["error"], WireError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class VoidResult {
	    error?: WireError;
	
	    static createFrom(source: any = {}) {
	        return new VoidResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.error = this.convertValues(source["error"], WireError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WriteResult {
	    status: string;
	    data?: CommittedWriteOutcome;
	    decisionToken?: string;
	    proposedEnding?: string;
	    documentRevision?: number;
	    error?: ClassifiedError;
	
	    static createFrom(source: any = {}) {
	        return new WriteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.data = this.convertValues(source["data"], CommittedWriteOutcome);
	        this.decisionToken = source["decisionToken"];
	        this.proposedEnding = source["proposedEnding"];
	        this.documentRevision = source["documentRevision"];
	        this.error = this.convertValues(source["error"], ClassifiedError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

