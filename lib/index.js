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
        'messages.repeatRequest': '请求过于频繁，请稍后再试',
        'messages.fetchFailed': '图片获取失败',
        'messages.partialFailed': '部分图片获取失败：',
        'messages.allFailed': '所有图片获取失败：',
        'messages.fetchSuccess': '图片获取成功！',
        'messages.fetchWaiting': '正在获取图片，请稍候...',
        'messages.inputError': '输入内容不能为空！',
        'messages.cacheCleared': '✅ 图片缓存已清空',
        'commands.hsjp': '生成黑丝举牌图片',
        'commands.dmjp': '生成动漫举牌图片',
        'commands.clear-image-cache': '清空图片缓存'
    }
};
const currentFilePath = worker_threads_1.isMainThread
    ? __filename
    : path_1.default.join(process.cwd(), worker_threads_1.isMainThread ? 'src/index.ts' : 'lib/index.js');
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
            const response = await (0, axios_1.default)({ url, method: 'GET', responseType: 'stream', timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
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
    const lang = 'zh-CN';
    return locales[lang][key] || key;
}
async function sendTimeout(session, content, config) {
    const text = typeof content === 'string' ? getI18nText(session, content) : content;
    if (config.imageSendTimeout <= 0)
        return session.send(text).catch(() => null);
    return Promise.race([session.send(text), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), config.imageSendTimeout))]).catch(() => null);
}
function clearAllCache(config) {
    if (fs_1.default.existsSync(config.tempDir)) {
        fs_1.default.readdirSync(config.tempDir).forEach(file => {
            try {
                const filePath = path_1.default.join(config.tempDir, file);
                const stat = fs_1.default.statSync(filePath);
                if (Date.now() - stat.mtimeMs > 3600000)
                    fs_1.default.unlinkSync(filePath);
            }
            catch (error) { }
        });
    }
    return true;
}
async function fetchImage(url, config) {
    const http = axios_1.default.create({ timeout: config.timeout, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
    try {
        if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp)/i.test(url))
            return { success: true, type: 'url', data: url, timeout: false };
        const res = await http.get(url, { responseType: 'arraybuffer' });
        if (res.status === 200 && res.data)
            return { success: true, type: 'buffer', data: res.data, timeout: false };
    }
    catch (error) {
        const isTimeout = error.message.includes('timeout');
        return { success: false, type: '', data: '', timeout: isTimeout };
    }
    return { success: false, type: '', data: '', timeout: false };
}
async function fetchHsjpImage(msg, msg1, msg2, config) {
    const encodedMsg = encodeURIComponent(msg);
    const encodedMsg1 = encodeURIComponent(msg1);
    const encodedMsg2 = encodeURIComponent(msg2);
    const url = `https://api.suyanw.cn/api/hsjp/?msg=${encodedMsg}&msg1=${encodedMsg1}&msg2=${encodedMsg2}`;
    return fetchImage(url, config);
}
async function fetchDmjpImage(text, config) {
    const encodedText = encodeURIComponent(text);
    const url = `https://api.suyanw.cn/api/dmjp.php?text=${encodedText}`;
    return fetchImage(url, config);
}
function apply(ctx, config) {
    if (!worker_threads_1.isMainThread)
        return;
    Object.keys(locales).forEach(lang => { ctx.i18n.define(lang, locales[lang]); });
    clearAllCache(config);
    ctx.logger.info('[custom-image] 插件已加载');
    ctx.command('hsjp <msg> [msg1] [msg2]', locales['zh-CN']['commands.hsjp'])
        .action(async ({ session }, msg, msg1 = '', msg2 = '') => {
        if (!config.enable || !config.hsjpEnabled || !session)
            return;
        if (!msg || msg.trim().length === 0) {
            await sendTimeout(session, 'messages.inputError', config);
            return;
        }
        if (config.showWaitingTip)
            await sendTimeout(session, 'messages.fetchWaiting', config);
        const result = await fetchHsjpImage(msg, msg1, msg2, config);
        if (result.timeout && config.showTimeoutTip) {
            await sendTimeout(session, '图片请求超时，请稍后再试', config);
            return;
        }
        if (result.success) {
            const imageElem = koishi_1.h.image(result.type === 'url' ? result.data : `data:image/jpeg;base64,${Buffer.from(result.data).toString('base64')}`);
            if (config.showSuccessTip) {
                await sendTimeout(session, 'messages.fetchSuccess', config);
                await delay(300);
            }
            await sendTimeout(session, imageElem, config);
        }
        else {
            await sendTimeout(session, 'messages.fetchFailed', config);
        }
    });
    ctx.command('dmjp <text>', locales['zh-CN']['commands.dmjp'])
        .action(async ({ session }, text) => {
        if (!config.enable || !config.dmjpEnabled || !session)
            return;
        if (!text || text.trim().length === 0) {
            await sendTimeout(session, 'messages.inputError', config);
            return;
        }
        if (config.showWaitingTip)
            await sendTimeout(session, 'messages.fetchWaiting', config);
        const result = await fetchDmjpImage(text, config);
        if (result.timeout && config.showTimeoutTip) {
            await sendTimeout(session, '图片请求超时，请稍后再试', config);
            return;
        }
        if (result.success) {
            const imageElem = koishi_1.h.image(result.type === 'url' ? result.data : `data:image/jpeg;base64,${Buffer.from(result.data).toString('base64')}`);
            if (config.showSuccessTip) {
                await sendTimeout(session, 'messages.fetchSuccess', config);
                await delay(300);
            }
            await sendTimeout(session, imageElem, config);
        }
        else {
            await sendTimeout(session, 'messages.fetchFailed', config);
        }
    });
    ctx.command('clear-image-cache', locales['zh-CN']['commands.clear-image-cache'])
        .action(({ session }) => {
        clearAllCache(config);
        return session ? getI18nText(session, 'messages.cacheCleared') : '✅ 图片缓存已清空';
    });
    if (config.autoClearCacheInterval > 0) {
        setInterval(() => { clearAllCache(config); ctx.logger.info('[custom-image] 缓存已自动清理'); }, config.autoClearCacheInterval * 60000);
    }
    process.on('exit', () => { clearAllCache(config); ctx.logger.info('[custom-image] 插件缓存已清理'); });
}
exports.inject = { optional: ['i18n'] };
exports.using = [];
