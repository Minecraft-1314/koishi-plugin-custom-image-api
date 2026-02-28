import { Context, Schema, h, Session } from 'koishi'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { isMainThread, Worker, workerData, parentPort } from 'worker_threads'

type LocaleKey = 'zh-CN'
type MessageKey = 
  | 'messages.repeatRequest'
  | 'messages.fetchFailed'
  | 'messages.partialFailed'
  | 'messages.allFailed'
  | 'messages.fetchSuccess'
  | 'messages.fetchWaiting'
  | 'messages.inputError'
  | 'messages.cacheCleared'
  | 'commands.hsjp'
  | 'commands.dmjp'
  | 'commands.clear-image-cache'

const locales: Record<LocaleKey, Record<MessageKey, string>> = {
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
}

const currentFilePath = isMainThread 
  ? __filename 
  : path.join(process.cwd(), isMainThread ? 'src/index.ts' : 'lib/index.js');

export const name = 'custom-image-api'

export interface Config {
  enable: boolean
  showWaitingTip: boolean
  timeout: number
  hsjpEnabled: boolean
  dmjpEnabled: boolean
  imageSendTimeout: number
  autoClearCacheInterval: number
  tempDir: string
  showSuccessTip: boolean
  showTimeoutTip: boolean
}

export const Config: Schema<Config> = Schema.object({
  enable: Schema.boolean().default(true).description('启用插件'),
  showWaitingTip: Schema.boolean().default(true).description('请求图片时显示等待提示'),
  timeout: Schema.number().default(10000).min(0).description('API请求超时时间（毫秒）'),
  hsjpEnabled: Schema.boolean().default(true).description('启用黑丝举牌功能'),
  dmjpEnabled: Schema.boolean().default(true).description('启用动漫举牌功能'),
  imageSendTimeout: Schema.number().default(15000).min(0).description('图片发送超时（毫秒）'),
  autoClearCacheInterval: Schema.number().default(60).min(0).description('自动清理缓存间隔（分钟）'),
  tempDir: Schema.string().default(path.join(process.cwd(), 'temp_images')).description('临时图片保存目录'),
  showSuccessTip: Schema.boolean().default(true).description('请求图片成功时显示提示'),
  showTimeoutTip: Schema.boolean().default(true).description('API请求超时后给用户提示')
})

if (!isMainThread) {
  const { url, filePath } = workerData;
  (async () => {
    try {
      const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
      await pipeline(response.data, fs.createWriteStream(filePath));
      parentPort?.postMessage({ success: true, filePath });
    } catch (error) {
      parentPort?.postMessage({ success: false, error: (error as Error).message });
    }
  })();
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function getI18nText(session: Session, key: MessageKey) {
  if (session?.text) return session.text(key)
  const lang: LocaleKey = 'zh-CN'
  return locales[lang][key] || key
}

async function sendTimeout(session: Session, content: MessageKey | any, config: Config) {
  const text = typeof content === 'string' ? getI18nText(session, content as MessageKey) : content;
  if (config.imageSendTimeout <= 0) return session.send(text).catch(() => null);
  return Promise.race([session.send(text), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), config.imageSendTimeout))]).catch(() => null);
}

function clearAllCache(config: Config) {
  if (fs.existsSync(config.tempDir)) {
    fs.readdirSync(config.tempDir).forEach(file => {
      try {
        const filePath = path.join(config.tempDir, file);
        const stat = fs.statSync(filePath);
        if (Date.now() - stat.mtimeMs > 3600000) fs.unlinkSync(filePath);
      } catch (error) {}
    });
  }
  return true;
}

async function fetchImage(url: string, config: Config) {
  const http = axios.create({ timeout: config.timeout, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  try {
    if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp)/i.test(url)) return { success: true, type: 'url', data: url, timeout: false };
    const res = await http.get(url, { responseType: 'arraybuffer' });
    if (res.status === 200 && res.data) return { success: true, type: 'buffer', data: res.data, timeout: false };
  } catch (error) {
    const isTimeout = (error as Error).message.includes('timeout');
    return { success: false, type: '', data: '', timeout: isTimeout };
  }
  return { success: false, type: '', data: '', timeout: false };
}

async function fetchHsjpImage(msg: string, msg1: string, msg2: string, config: Config) {
  const encodedMsg = encodeURIComponent(msg);
  const encodedMsg1 = encodeURIComponent(msg1);
  const encodedMsg2 = encodeURIComponent(msg2);
  const url = `https://api.suyanw.cn/api/hsjp/?msg=${encodedMsg}&msg1=${encodedMsg1}&msg2=${encodedMsg2}`;
  return fetchImage(url, config);
}

async function fetchDmjpImage(text: string, config: Config) {
  const encodedText = encodeURIComponent(text);
  const url = `https://api.suyanw.cn/api/dmjp.php?text=${encodedText}`;
  return fetchImage(url, config);
}

export function apply(ctx: Context, config: Config) {
  if (!isMainThread) return;
  Object.keys(locales).forEach(lang => { ctx.i18n.define(lang as LocaleKey, locales[lang as LocaleKey]); });
  clearAllCache(config);
  ctx.logger.info('[custom-image] 插件已加载');

  ctx.command('hsjp <msg> [msg1] [msg2]', locales['zh-CN']['commands.hsjp'])
    .action(async ({ session }, msg, msg1 = '', msg2 = '') => {
      if (!config.enable || !config.hsjpEnabled || !session) return;
      if (!msg || msg.trim().length === 0) { await sendTimeout(session, 'messages.inputError', config); return; }
      if (config.showWaitingTip) await sendTimeout(session, 'messages.fetchWaiting', config);
      const result = await fetchHsjpImage(msg, msg1, msg2, config);
      if (result.timeout && config.showTimeoutTip) { await sendTimeout(session, '图片请求超时，请稍后再试', config); return; }
      if (result.success) {
        const imageElem = h.image(result.type === 'url' ? result.data as string : `data:image/jpeg;base64,${Buffer.from(result.data as Buffer).toString('base64')}`);
        if (config.showSuccessTip) { await sendTimeout(session, 'messages.fetchSuccess', config); await delay(300); }
        await sendTimeout(session, imageElem, config);
      } else {
        await sendTimeout(session, 'messages.fetchFailed', config);
      }
    });

  ctx.command('dmjp <text>', locales['zh-CN']['commands.dmjp'])
    .action(async ({ session }, text) => {
      if (!config.enable || !config.dmjpEnabled || !session) return;
      if (!text || text.trim().length === 0) { await sendTimeout(session, 'messages.inputError', config); return; }
      if (config.showWaitingTip) await sendTimeout(session, 'messages.fetchWaiting', config);
      const result = await fetchDmjpImage(text, config);
      if (result.timeout && config.showTimeoutTip) { await sendTimeout(session, '图片请求超时，请稍后再试', config); return; }
      if (result.success) {
        const imageElem = h.image(result.type === 'url' ? result.data as string : `data:image/jpeg;base64,${Buffer.from(result.data as Buffer).toString('base64')}`);
        if (config.showSuccessTip) { await sendTimeout(session, 'messages.fetchSuccess', config); await delay(300); }
        await sendTimeout(session, imageElem, config);
      } else {
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

export const inject = { optional: ['i18n'] }
export const using = [] as const