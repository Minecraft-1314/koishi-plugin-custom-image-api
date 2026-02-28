import { Context, Schema } from 'koishi';
export declare const name = "custom-image-api";
export interface Config {
    enable: boolean;
    showWaitingTip: boolean;
    timeout: number;
    hsjpEnabled: boolean;
    dmjpEnabled: boolean;
    imageSendTimeout: number;
    autoClearCacheInterval: number;
    tempDir: string;
    showSuccessTip: boolean;
    showTimeoutTip: boolean;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
export declare const inject: {
    optional: string[];
};
export declare const using: readonly [];
