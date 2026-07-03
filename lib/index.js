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
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const promises_2 = require("stream/promises");
const fs_2 = require("fs");
const crypto_1 = require("crypto");
const DEFAULT_LOCALES = {
    'zh-CN': {
        'messages.fetchFailed': '图片获取失败',
        'messages.fetchTimeout': '图片请求超时，请稍后再试',
        'messages.fetchNetworkError': '网络连接失败，请检查网络',
        'messages.fetchSuccess': '图片获取成功！',
        'messages.fetchWaiting': '正在获取图片，请稍候...',
        'messages.inputError': '输入内容不能为空！',
        'messages.inputTooLong': '输入内容过长，请控制在200字以内',
        'messages.cacheCleared': '✅ 图片缓存已清空',
        'messages.repeatRequest': '请求过于频繁，请稍后再试',
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
exports.name = 'custom-image-api';
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        enable: koishi_1.Schema.boolean().default(true).description('启用插件'),
        showWaitingTip: koishi_1.Schema.boolean().default(true).description('解析时显示等待提示'),
        timeout: koishi_1.Schema.number().default(10000).min(0).description('API请求超时时间（毫秒）'),
        hsjpEnabled: koishi_1.Schema.boolean().default(true).description('启用黑丝举牌功能'),
        dmjpEnabled: koishi_1.Schema.boolean().default(true).description('启用动漫举牌功能'),
    }).description('基本设置'),
    koishi_1.Schema.object({
        imageSendMode: koishi_1.Schema.union([
            koishi_1.Schema.const('image').description('直接发送图片'),
            koishi_1.Schema.const('link').description('只发送生成链接'),
            koishi_1.Schema.const('file').description('下载后以文件形式发送'),
        ]).default('image').description('图片发送方式'),
        showSuccessTip: koishi_1.Schema.boolean().default(true).description('请求图片成功时显示提示'),
        showTimeoutTip: koishi_1.Schema.boolean().default(true).description('API请求超时后给用户提示'),
        imageSendTimeout: koishi_1.Schema.number().default(15000).min(0).description('图片发送超时（毫秒）'),
    }).description('发送设置'),
    koishi_1.Schema.object({
        ignoreSendError: koishi_1.Schema.boolean().default(true).description('忽略发送失败'),
        retryTimes: koishi_1.Schema.number().min(0).step(1).default(3).description('重试次数'),
        retryInterval: koishi_1.Schema.number().min(0).step(1).default(1000).description('重试间隔 (ms)'),
    }).description('发送与重试'),
    koishi_1.Schema.object({
        downloadEngine: koishi_1.Schema.union([
            koishi_1.Schema.const('internal').description('内置下载'),
            koishi_1.Schema.const('aria2').description('aria2 下载'),
            koishi_1.Schema.const('downloads').description('downloads 服务下载'),
        ]).default('internal').description('下载引擎'),
        downloadConcurrency: koishi_1.Schema.number().min(1).step(1).default(3).description('下载线程数'),
        downloadTimeout: koishi_1.Schema.number().min(0).step(1).default(120000).description('统一下载超时 (ms)'),
        maxMediaSize: koishi_1.Schema.number().min(0).step(1).default(0).description('最大下载文件大小 (MB)，0 为不限制'),
        aria2Host: koishi_1.Schema.string().default('127.0.0.1').description('aria2 RPC 地址'),
        aria2Port: koishi_1.Schema.number().default(6800).description('aria2 RPC 端口'),
        aria2Secret: koishi_1.Schema.string().default('').description('aria2 RPC 密钥'),
        resumeDownload: koishi_1.Schema.boolean().default(true).description('启用断点续传（仅 aria2 模式）'),
    }).description('下载引擎与性能'),
    koishi_1.Schema.object({
        dedupInterval: koishi_1.Schema.number().min(0).step(1).default(0).description('去重间隔 (秒)，0表示不去重'),
        cacheDuration: koishi_1.Schema.number().min(0).step(1).default(0).description('缓存时间 (秒)，0表示不缓存'),
        autoClearCacheInterval: koishi_1.Schema.number().default(60).min(0).description('自动清理缓存间隔（分钟）'),
        tempDir: koishi_1.Schema.string().default(path_1.default.join(process.cwd(), 'temp_images')).description('临时文件目录'),
    }).description('缓存与临时文件'),
    koishi_1.Schema.object({
        waitingTipText: koishi_1.Schema.string().default('').description('等待提示（空则使用默认）'),
        successTipText: koishi_1.Schema.string().default('').description('成功提示'),
        timeoutTipText: koishi_1.Schema.string().default('').description('超时提示'),
        networkErrorText: koishi_1.Schema.string().default('').description('网络错误提示'),
        fetchFailedText: koishi_1.Schema.string().default('').description('获取失败提示'),
        inputErrorText: koishi_1.Schema.string().default('').description('输入为空提示'),
        inputTooLongText: koishi_1.Schema.string().default('').description('输入过长提示'),
        cacheClearedText: koishi_1.Schema.string().default('').description('缓存清理提示'),
        repeatRequestText: koishi_1.Schema.string().default('').description('重复请求提示'),
    }).description('界面文本'),
]);
class SimpleLRUCache {
    constructor(max, ttlMs) {
        this.max = max;
        this.ttlMs = ttlMs;
        this.map = new Map();
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expireAt) {
            this.map.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value) {
        this.map.delete(key);
        while (this.map.size >= this.max) {
            const k = this.map.keys().next().value;
            if (k === undefined)
                break;
            this.map.delete(k);
        }
        this.map.set(key, { value, expireAt: Date.now() + this.ttlMs });
    }
    clear() {
        this.map.clear();
    }
}
class ConcurrencyLimiter {
    constructor(max) {
        this.max = max;
        this.running = 0;
        this.queue = [];
    }
    async acquire() {
        if (this.running < this.max) {
            this.running++;
            return;
        }
        return new Promise(resolve => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }
    release() {
        this.running--;
        const next = this.queue.shift();
        if (next)
            next();
    }
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));
let sharedAxios = null;
let resultCache = null;
let dedupMap = null;
let downloadLimiter = null;
function getAxios(config) {
    if (!sharedAxios) {
        sharedAxios = axios_1.default.create({
            timeout: config.timeout,
            headers: { 'User-Agent': USER_AGENT }
        });
    }
    return sharedAxios;
}
function initCacheAndDedup(config) {
    resultCache = config.cacheDuration > 0
        ? new SimpleLRUCache(200, config.cacheDuration * 1000)
        : null;
    dedupMap = config.dedupInterval > 0 ? new Map() : null;
    downloadLimiter = config.imageSendMode === 'file'
        ? new ConcurrencyLimiter(config.downloadConcurrency)
        : null;
}
function getI18nText(session, key, config) {
    const customMap = {
        'messages.fetchWaiting': config.waitingTipText,
        'messages.fetchSuccess': config.successTipText,
        'messages.fetchTimeout': config.timeoutTipText,
        'messages.fetchNetworkError': config.networkErrorText,
        'messages.fetchFailed': config.fetchFailedText,
        'messages.inputError': config.inputErrorText,
        'messages.inputTooLong': config.inputTooLongText,
        'messages.cacheCleared': config.cacheClearedText,
        'messages.repeatRequest': config.repeatRequestText,
    };
    const custom = customMap[key];
    if (custom)
        return custom;
    if (session?.text)
        return session.text(key);
    return DEFAULT_LOCALES['zh-CN'][key] || key;
}
function buildApiUrl(type, params) {
    if (type === 'hsjp') {
        const [msg, msg1, msg2] = params.map(encodeURIComponent);
        return `${HSJP_API}?msg=${msg}&msg1=${msg1}&msg2=${msg2}`;
    }
    else {
        const text = encodeURIComponent(params[0]);
        return `${DMJP_API}?text=${text}`;
    }
}
function clearOldCacheFiles(config) {
    if (!fs_1.default.existsSync(config.tempDir))
        return;
    const now = Date.now();
    const ageThreshold = config.autoClearCacheInterval > 0
        ? config.autoClearCacheInterval * 60000
        : 3600000;
    const resolvedDir = path_1.default.resolve(config.tempDir);
    fs_1.default.readdirSync(config.tempDir).forEach(file => {
        try {
            const filePath = path_1.default.join(config.tempDir, file);
            if (!filePath.startsWith(resolvedDir + path_1.default.sep))
                return;
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
    const resolvedDir = path_1.default.resolve(config.tempDir);
    fs_1.default.readdirSync(config.tempDir).forEach(file => {
        try {
            const filePath = path_1.default.join(config.tempDir, file);
            if (!filePath.startsWith(resolvedDir + path_1.default.sep))
                return;
            const stat = fs_1.default.statSync(filePath);
            if (stat.isFile())
                fs_1.default.unlinkSync(filePath);
        }
        catch { }
    });
}
async function fetchImage(url, config) {
    const empty = {
        success: false,
        type: '',
        data: '',
        timeout: false,
        networkError: false,
        apiUrl: url
    };
    if (IMAGE_URL_PATTERN.test(url)) {
        return { success: true, type: 'url', data: url, timeout: false, networkError: false, apiUrl: url };
    }
    const http = getAxios(config);
    try {
        const res = await http.get(url, { responseType: 'arraybuffer' });
        if (res.status === 200 && res.data) {
            return { success: true, type: 'buffer', data: res.data, timeout: false, networkError: false, apiUrl: url };
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
    catch { }
    finally {
        if (timer !== null)
            clearTimeout(timer);
    }
}
async function sendWithRetry(session, content, config) {
    let lastError;
    for (let attempt = 0; attempt <= config.retryTimes; attempt++) {
        try {
            await sendTimeout(session, content, config);
            return;
        }
        catch (e) {
            lastError = e;
            if (attempt < config.retryTimes) {
                await delay(config.retryInterval);
            }
        }
    }
    if (!config.ignoreSendError)
        throw lastError;
}
async function downloadFile(url, config, ctx, filePrefix, fileExts) {
    await promises_1.default.mkdir(config.tempDir, { recursive: true });
    const ext = fileExts.find(e => {
        const r = new RegExp('\\.' + e + '(\\?|$)', 'i');
        return r.test(url);
    }) || fileExts[0];
    const fileName = `${filePrefix}_${Date.now()}_${(0, crypto_1.randomBytes)(4).toString('hex')}.${ext}`;
    const filePath = path_1.default.resolve(config.tempDir, fileName);
    if (config.downloadEngine === 'downloads' && ctx.downloads) {
        try {
            const dest = await ctx.downloads.download(url, path_1.default.join(config.tempDir, fileName), {
                headers: { 'User-Agent': USER_AGENT },
                timeout: config.downloadTimeout
            });
            const stat = await promises_1.default.stat(dest);
            if (config.maxMediaSize > 0 && stat.size > config.maxMediaSize * 1024 * 1024) {
                await promises_1.default.unlink(dest).catch(() => { });
                throw new Error(`文件过大(${Math.round(stat.size / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`);
            }
            return dest;
        }
        catch (e) { }
    }
    else if (config.downloadEngine === 'aria2') {
        let aria2;
        try {
            aria2 = require('aria2');
        }
        catch {
            throw new Error('aria2 模块未安装');
        }
        const client = new aria2({
            host: config.aria2Host,
            port: config.aria2Port,
            secure: false,
            secret: config.aria2Secret,
            path: '/jsonrpc'
        });
        try {
            await client.open();
            const gid = await client.call('aria2.addUri', [url], {
                dir: config.tempDir,
                out: fileName,
                split: 4,
                continue: config.resumeDownload,
                maxConnectionPerServer: 5,
                timeout: config.downloadTimeout / 1000,
                header: [`User-Agent: ${USER_AGENT}`, 'Referer: https://www.baidu.com/']
            });
            let completed = false;
            const start = Date.now();
            while (!completed) {
                if (Date.now() - start > config.downloadTimeout) {
                    await client.call('aria2.remove', gid).catch(() => { });
                    throw new Error('aria2下载超时');
                }
                const status = await client.call('aria2.tellStatus', gid);
                if (status.status === 'complete') {
                    completed = true;
                }
                else if (status.status === 'error' || status.status === 'removed') {
                    throw new Error('aria2下载失败');
                }
                else {
                    await delay(1000);
                }
            }
        }
        finally {
            await client.close().catch(() => { });
        }
    }
    else {
        const writer = (0, fs_2.createWriteStream)(filePath);
        let response;
        try {
            response = await getAxios(config).get(url, {
                responseType: 'stream',
                timeout: config.downloadTimeout,
                headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.baidu.com/' },
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 300,
            });
        }
        catch (e) {
            writer.destroy();
            await promises_1.default.unlink(filePath).catch(() => { });
            throw e;
        }
        const contentLength = Number(response.headers['content-length'] || 0);
        const maxBytes = config.maxMediaSize * 1024 * 1024;
        if (maxBytes > 0 && contentLength > maxBytes) {
            writer.destroy();
            await promises_1.default.unlink(filePath).catch(() => { });
            throw new Error(`文件过大(${Math.round(contentLength / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`);
        }
        try {
            await (0, promises_2.pipeline)(response.data, writer);
        }
        catch (e) {
            await promises_1.default.unlink(filePath).catch(() => { });
            throw e;
        }
    }
    const stat = await promises_1.default.stat(filePath);
    if (config.maxMediaSize > 0 && stat.size > config.maxMediaSize * 1024 * 1024) {
        await promises_1.default.unlink(filePath).catch(() => { });
        throw new Error(`文件过大(${Math.round(stat.size / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`);
    }
    return filePath;
}
async function processRequest(session, config, type, params, ctx) {
    const apiUrl = buildApiUrl(type, params);
    if (dedupMap) {
        const lastTime = dedupMap.get(apiUrl);
        if (lastTime && Date.now() - lastTime < config.dedupInterval * 1000) {
            await sendWithRetry(session, getI18nText(session, 'messages.repeatRequest', config), config);
            return;
        }
        dedupMap.set(apiUrl, Date.now());
    }
    let result;
    if (resultCache) {
        result = resultCache.get(apiUrl);
    }
    if (!result) {
        result = await fetchImage(apiUrl, config);
        if (result.success && resultCache) {
            resultCache.set(apiUrl, result);
        }
    }
    const failMsg = getFailureMessage(result, config);
    if (failMsg) {
        await sendWithRetry(session, getI18nText(session, failMsg, config), config);
        return;
    }
    if (config.imageSendMode === 'link') {
        await sendWithRetry(session, result.apiUrl, config);
    }
    else if (config.imageSendMode === 'file') {
        if (!downloadLimiter)
            downloadLimiter = new ConcurrencyLimiter(config.downloadConcurrency);
        await downloadLimiter.acquire();
        try {
            let filePath;
            if (result.type === 'buffer') {
                await promises_1.default.mkdir(config.tempDir, { recursive: true });
                const fileName = `img_${Date.now()}_${(0, crypto_1.randomBytes)(4).toString('hex')}.jpg`;
                filePath = path_1.default.join(config.tempDir, fileName);
                await promises_1.default.writeFile(filePath, result.data);
            }
            else {
                filePath = await downloadFile(result.data, config, ctx, 'img', ['jpg', 'jpeg', 'png', 'gif', 'webp']);
            }
            await sendWithRetry(session, koishi_1.h.image(`file://${filePath}`), config);
        }
        catch (e) {
            await sendWithRetry(session, getI18nText(session, 'messages.fetchFailed', config), config);
        }
        finally {
            downloadLimiter.release();
        }
    }
    else {
        const imageElem = buildImageElement(result);
        if (config.showSuccessTip) {
            await sendWithRetry(session, getI18nText(session, 'messages.fetchSuccess', config), config);
            await delay(SUCCESS_DELAY_MS);
        }
        await sendWithRetry(session, imageElem, config);
    }
}
function validateInput(input) {
    if (!input || input.trim().length === 0)
        return 'messages.inputError';
    if (input.length > MAX_INPUT_LENGTH)
        return 'messages.inputTooLong';
    return null;
}
function apply(ctx, config) {
    Object.keys(DEFAULT_LOCALES).forEach(lang => {
        ctx.i18n.define(lang, DEFAULT_LOCALES[lang]);
    });
    sharedAxios = axios_1.default.create({
        timeout: config.timeout,
        headers: { 'User-Agent': USER_AGENT }
    });
    initCacheAndDedup(config);
    clearOldCacheFiles(config);
    ctx.logger.info('[custom-image] 插件已加载');
    ctx.command('hsjp <msg> [msg1] [msg2]', DEFAULT_LOCALES['zh-CN']['commands.hsjp'])
        .action(async ({ session }, msg, msg1 = '', msg2 = '') => {
        if (!config.enable || !config.hsjpEnabled || !session)
            return;
        const errorKey = validateInput(msg);
        if (errorKey) {
            await sendWithRetry(session, getI18nText(session, errorKey, config), config);
            return;
        }
        if (config.showWaitingTip) {
            await sendWithRetry(session, getI18nText(session, 'messages.fetchWaiting', config), config);
        }
        await processRequest(session, config, 'hsjp', [msg, msg1, msg2], ctx);
    });
    ctx.command('dmjp <text>', DEFAULT_LOCALES['zh-CN']['commands.dmjp'])
        .action(async ({ session }, text) => {
        if (!config.enable || !config.dmjpEnabled || !session)
            return;
        const errorKey = validateInput(text);
        if (errorKey) {
            await sendWithRetry(session, getI18nText(session, errorKey, config), config);
            return;
        }
        if (config.showWaitingTip) {
            await sendWithRetry(session, getI18nText(session, 'messages.fetchWaiting', config), config);
        }
        await processRequest(session, config, 'dmjp', [text], ctx);
    });
    ctx.command('clear-image-cache', DEFAULT_LOCALES['zh-CN']['commands.clear-image-cache'])
        .action(({ session }) => {
        clearAllCache(config);
        return getI18nText(session ?? null, 'messages.cacheCleared', config);
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
        resultCache?.clear();
        dedupMap?.clear();
        ctx.logger.info('[custom-image] 插件已卸载，缓存已清理');
    });
}
exports.inject = { optional: ['i18n', 'downloads'] };
exports.using = [];
