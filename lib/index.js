"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.using = exports.inject = exports.Config = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const worker_threads_1 = require("worker_threads");
const locales = {
    'zh-CN': {
        'messages.fetchFailed': '图片获取失败',
        'messages.fetchTimeout': '图片请求超时，请稍后再试',
        'messages.fetchNetworkError': '网络连接失败，请检查网络',
        'messages.fetchSuccess': '图片获取成功！',
        'messages.fetchWaiting': '正在获取图片，请稍候...',
        'messages.inputError': '输入内容不能为空！',
        'messages.inputTooLong': '输入内容过长，请控制在200字以内',
        'messages.cacheCleared': '✅ 图片缓存已清空',
        'commands.hsjp': '生成黑丝举牌图片',
        'commands.dmjp': '生成动漫举牌图片',
        'commands.clear-image-cache': '清空图片缓存'
    }
};
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HSJP_API = 'https://api.suyanw.cn/api/hsjp/';
const DMJP_API = 'https://api.suyanw.cn/api/dmjp.php';
const IMAGE_URL_PATTERN = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?(#.*)?$/i;
const MAX_INPUT_LENGTH = 200;
const SUCCESS_DELAY_MS = 300;
const FALLBACK_MIME = 'image/jpeg';
const DEFAULT_CACHE_MAX_AGE = 3600000;
exports.name = 'custom-image-api';
exports.Config = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean().default(true).description('启用插件'),
    showWaitingTip: koishi_1.Schema.boolean().default(true).description('请求图片时显示等待提示'),
    timeout: koishi_1.Schema.number().default(10000).min(0).description('API请求超时时间（毫秒）'),
    hsjpEnabled: koishi_1.Schema.boolean().default(true).description('启用黑丝举牌功能'),
    dmjpEnabled: koishi_1.Schema.boolean().default(true).description('启用动漫举牌功能'),
    imageSendTimeout: koishi_1.Schema.number().default(15000).min(0).description('图片发送超时（毫秒）'),
    autoClearCacheInterval: koishi_1.Schema.number().default(60).min(0).description('自动清理缓存间隔（分钟）'),
    tempDir: koishi_1.Schema.string().default(path_1.default.join(process.cwd(), 'temp_images')).description('临时图片保存目录'),
    showSuccessTip: koishi_1.Schema.boolean().default(true).description('请求图片成功时显示提示'),
    showTimeoutTip: koishi_1.Schema.boolean().default(true).description('API请求超时后给用户提示')
});
if (!worker_threads_1.isMainThread) {
    const { url, filePath } = worker_threads_1.workerData;
    (async () => {
        try {
            const response = await (0, axios_1.default)({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 60000,
                headers: { 'User-Agent': USER_AGENT }
            });
            await (0, promises_1.pipeline)(response.data, fs_1.default.createWriteStream(filePath));
            worker_threads_1.parentPort?.postMessage({ success: true, filePath });
        }
        catch (error) {
            worker_threads_1.parentPort?.postMessage({ success: false, error: error.message });
        }
    })();
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function getI18nText(session, key) {
    if (session?.text)
        return session.text(key);
    return locales['zh-CN'][key] || key;
}
function clearOldCacheFiles(config) {
    if (!fs_1.default.existsSync(config.tempDir))
        return;
    const now = Date.now();
    const ageThreshold = config.autoClearCacheInterval > 0
        ? config.autoClearCacheInterval * 60000
        : DEFAULT_CACHE_MAX_AGE;
    fs_1.default.readdirSync(config.tempDir).forEach(file => {
        try {
            const filePath = path_1.default.join(config.tempDir, file);
            const stat = fs_1.default.statSync(filePath);
            if (!stat.isFile())
                return;
            if (now - stat.mtimeMs > ageThreshold)
                fs_1.default.unlinkSync(filePath);
        }
        catch { }
    });
}
function clearAllCache(config) {
    if (!fs_1.default.existsSync(config.tempDir))
        return;
    fs_1.default.readdirSync(config.tempDir).forEach(file => {
        try {
            const filePath = path_1.default.join(config.tempDir, file);
            const stat = fs_1.default.statSync(filePath);
            if (stat.isFile())
                fs_1.default.unlinkSync(filePath);
        }
        catch { }
    });
}
async function sendTimeout(session, content, config) {
    if (config.imageSendTimeout <= 0) {
        await session.send(content).catch(() => { });
        return;
    }
    let timer = null;
    try {
        await Promise.race([
            session.send(content),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('send_timeout')), config.imageSendTimeout);
            })
        ]);
    }
    catch {
    }
    finally {
        if (timer !== null)
            clearTimeout(timer);
    }
}
let sharedAxios = null;
function getAxios(config) {
    if (!sharedAxios) {
        sharedAxios = axios_1.default.create({
            timeout: config.timeout,
            headers: { 'User-Agent': USER_AGENT }
        });
    }
    return sharedAxios;
}
async function fetchImage(url, config) {
    const empty = { success: false, type: '', data: '', timeout: false, networkError: false };
    if (IMAGE_URL_PATTERN.test(url)) {
        return { success: true, type: 'url', data: url, timeout: false, networkError: false };
    }
    const http = getAxios(config);
    try {
        const res = await http.get(url, { responseType: 'arraybuffer' });
        if (res.status === 200 && res.data) {
            return { success: true, type: 'buffer', data: res.data, timeout: false, networkError: false };
        }
        return empty;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED')
                return { ...empty, timeout: true };
            if (!error.response)
                return { ...empty, networkError: true };
        }
        return empty;
    }
}
async function fetchHsjpImage(msg, msg1, msg2, config) {
    const params = [msg, msg1, msg2].map(encodeURIComponent);
    const url = `${HSJP_API}?msg=${params[0]}&msg1=${params[1]}&msg2=${params[2]}`;
    return fetchImage(url, config);
}
async function fetchDmjpImage(text, config) {
    const url = `${DMJP_API}?text=${encodeURIComponent(text)}`;
    return fetchImage(url, config);
}
function buildImageElement(result) {
    if (result.type === 'url')
        return koishi_1.h.image(result.data);
    const base64 = Buffer.from(result.data).toString('base64');
    return koishi_1.h.image(`data:${FALLBACK_MIME};base64,${base64}`);
}
function getFailureMessage(result, config) {
    if (result.success)
        return null;
    if (result.timeout && config.showTimeoutTip)
        return 'messages.fetchTimeout';
    if (result.networkError)
        return 'messages.fetchNetworkError';
    return 'messages.fetchFailed';
}
async function handleImageCommand(session, config, fetchFn) {
    const result = await fetchFn();
    const failMsg = getFailureMessage(result, config);
    if (failMsg) {
        await sendTimeout(session, getI18nText(session, failMsg), config);
        return;
    }
    const imageElem = buildImageElement(result);
    if (config.showSuccessTip) {
        await sendTimeout(session, getI18nText(session, 'messages.fetchSuccess'), config);
        await delay(SUCCESS_DELAY_MS);
    }
    await sendTimeout(session, imageElem, config);
}
function validateInput(input) {
    if (!input || input.trim().length === 0)
        return 'messages.inputError';
    if (input.length > MAX_INPUT_LENGTH)
        return 'messages.inputTooLong';
    return null;
}
function apply(ctx, config) {
    if (!worker_threads_1.isMainThread)
        return;
    Object.keys(locales).forEach(lang => {
        ctx.i18n.define(lang, locales[lang]);
    });
    sharedAxios = axios_1.default.create({
        timeout: config.timeout,
        headers: { 'User-Agent': USER_AGENT }
    });
    clearOldCacheFiles(config);
    ctx.logger.info('[custom-image] 插件已加载');
    ctx
        .command('hsjp <msg> [msg1] [msg2]', locales['zh-CN']['commands.hsjp'])
        .action(async ({ session }, msg, msg1 = '', msg2 = '') => {
        if (!config.enable || !config.hsjpEnabled || !session)
            return;
        const errorKey = validateInput(msg);
        if (errorKey) {
            await sendTimeout(session, getI18nText(session, errorKey), config);
            return;
        }
        if (config.showWaitingTip) {
            await sendTimeout(session, getI18nText(session, 'messages.fetchWaiting'), config);
        }
        await handleImageCommand(session, config, () => fetchHsjpImage(msg, msg1, msg2, config));
    });
    ctx
        .command('dmjp <text>', locales['zh-CN']['commands.dmjp'])
        .action(async ({ session }, text) => {
        if (!config.enable || !config.dmjpEnabled || !session)
            return;
        const errorKey = validateInput(text);
        if (errorKey) {
            await sendTimeout(session, getI18nText(session, errorKey), config);
            return;
        }
        if (config.showWaitingTip) {
            await sendTimeout(session, getI18nText(session, 'messages.fetchWaiting'), config);
        }
        await handleImageCommand(session, config, () => fetchDmjpImage(text, config));
    });
    ctx
        .command('clear-image-cache', locales['zh-CN']['commands.clear-image-cache'])
        .action(({ session }) => {
        clearAllCache(config);
        return getI18nText(session ?? null, 'messages.cacheCleared');
    });
    let clearTimer = null;
    if (config.autoClearCacheInterval > 0) {
        clearTimer = setInterval(() => {
            clearOldCacheFiles(config);
            ctx.logger.info('[custom-image] 缓存已自动清理');
        }, config.autoClearCacheInterval * 60000);
    }
    ctx.on('dispose', () => {
        if (clearTimer !== null)
            clearInterval(clearTimer);
        clearAllCache(config);
        sharedAxios = null;
        ctx.logger.info('[custom-image] 插件已卸载，缓存已清理');
    });
}
exports.inject = { optional: ['i18n'] };
exports.using = [];
