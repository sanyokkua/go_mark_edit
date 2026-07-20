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
	export class AppearanceSettings {
	    theme: string;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new AppearanceSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.mode = source["mode"];
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
	export class MarkdownSettings {
	    standard: string;
	
	    static createFrom(source: any = {}) {
	        return new MarkdownSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.standard = source["standard"];
	    }
	}
	export class Settings {
	    appearance: AppearanceSettings;
	    markdown: MarkdownSettings;
	    contentPrivacy: ContentPrivacySettings;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appearance = this.convertValues(source["appearance"], AppearanceSettings);
	        this.markdown = this.convertValues(source["markdown"], MarkdownSettings);
	        this.contentPrivacy = this.convertValues(source["contentPrivacy"], ContentPrivacySettings);
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

}

