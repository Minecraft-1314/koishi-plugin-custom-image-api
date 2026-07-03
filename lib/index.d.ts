import { Context, Schema } from 'koishi';
declare module 'koishi' {
    interface Context {
        downloads?: {
            download(url: string, dest: string, options?: Record<string, unknown>): Promise<string>;
        };
    }
}
export declare const name = "custom-image-api";
export interface Config {
    enable: boolean;
    showWaitingTip: boolean;
    timeout: number;
    hsjpEnabled: boolean;
    dmjpEnabled: boolean;
    imageSendTimeout: number;
    showSuccessTip: boolean;
    showTimeoutTip: boolean;
    imageSendMode: 'image' | 'link' | 'file';
    downloadEngine: 'internal' | 'aria2' | 'downloads';
    downloadConcurrency: number;
    downloadTimeout: number;
    maxMediaSize: number;
    aria2Host: string;
    aria2Port: number;
    aria2Secret: string;
    resumeDownload: boolean;
    dedupInterval: number;
    cacheDuration: number;
    autoClearCacheInterval: number;
    tempDir: string;
    waitingTipText: string;
    successTipText: string;
    timeoutTipText: string;
    networkErrorText: string;
    fetchFailedText: string;
    inputErrorText: string;
    inputTooLongText: string;
    cacheClearedText: string;
    repeatRequestText: string;
    ignoreSendError: boolean;
    retryTimes: number;
    retryInterval: number;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
export declare const inject: {
    optional: string[];
};
export declare const using: readonly [];
