import { Context, Schema, h, Session } from 'koishi'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { randomBytes } from 'crypto'

declare module 'koishi' {
  interface Context {
    downloads?: {
      download(url: string, dest: string, options?: Record<string, unknown>): Promise<string>
    }
  }
}

type LocaleKey = 'zh-CN'
type MessageKey =
  | 'messages.fetchFailed'
  | 'messages.fetchTimeout'
  | 'messages.fetchNetworkError'
  | 'messages.fetchSuccess'
  | 'messages.fetchWaiting'
  | 'messages.inputError'
  | 'messages.inputTooLong'
  | 'messages.cacheCleared'
  | 'messages.repeatRequest'
  | 'commands.hsjp'
  | 'commands.dmjp'
  | 'commands.clear-image-cache'

const DEFAULT_LOCALES: Record<LocaleKey, Record<MessageKey, string>> = {
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
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HSJP_API = 'https://api.suyanw.cn/api/hsjp/'
const DMJP_API = 'https://api.suyanw.cn/api/dmjp.php'
const IMAGE_URL_PATTERN = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?(#.*)?$/i
const MAX_INPUT_LENGTH = 200
const SUCCESS_DELAY_MS = 300
const FALLBACK_MIME = 'image/jpeg'

export const name = 'custom-image-api'

export interface Config {
  enable: boolean
  showWaitingTip: boolean
  timeout: number
  hsjpEnabled: boolean
  dmjpEnabled: boolean
  imageSendTimeout: number
  showSuccessTip: boolean
  showTimeoutTip: boolean
  imageSendMode: 'image' | 'link' | 'file'
  downloadEngine: 'internal' | 'aria2' | 'downloads'
  downloadConcurrency: number
  downloadTimeout: number
  maxMediaSize: number
  aria2Host: string
  aria2Port: number
  aria2Secret: string
  resumeDownload: boolean
  dedupInterval: number
  cacheDuration: number
  autoClearCacheInterval: number
  tempDir: string
  waitingTipText: string
  successTipText: string
  timeoutTipText: string
  networkErrorText: string
  fetchFailedText: string
  inputErrorText: string
  inputTooLongText: string
  cacheClearedText: string
  repeatRequestText: string
  ignoreSendError: boolean
  retryTimes: number
  retryInterval: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enable: Schema.boolean().default(true).description('启用插件'),
    showWaitingTip: Schema.boolean().default(true).description('解析时显示等待提示'),
    timeout: Schema.number().default(10000).min(0).description('API请求超时时间（毫秒）'),
    hsjpEnabled: Schema.boolean().default(true).description('启用黑丝举牌功能'),
    dmjpEnabled: Schema.boolean().default(true).description('启用动漫举牌功能'),
  }).description('基本设置'),

  Schema.object({
    imageSendMode: Schema.union([
      Schema.const('image').description('直接发送图片'),
      Schema.const('link').description('只发送生成链接'),
      Schema.const('file').description('下载后以文件形式发送'),
    ]).default('image').description('图片发送方式'),
    showSuccessTip: Schema.boolean().default(true).description('请求图片成功时显示提示'),
    showTimeoutTip: Schema.boolean().default(true).description('API请求超时后给用户提示'),
    imageSendTimeout: Schema.number().default(15000).min(0).description('图片发送超时（毫秒）'),
  }).description('发送设置'),

  Schema.object({
    ignoreSendError: Schema.boolean().default(true).description('忽略发送失败'),
    retryTimes: Schema.number().min(0).step(1).default(3).description('重试次数'),
    retryInterval: Schema.number().min(0).step(1).default(1000).description('重试间隔 (ms)'),
  }).description('发送与重试'),

  Schema.object({
    downloadEngine: Schema.union([
      Schema.const('internal').description('内置下载'),
      Schema.const('aria2').description('aria2 下载'),
      Schema.const('downloads').description('downloads 服务下载'),
    ]).default('internal').description('下载引擎'),
    downloadConcurrency: Schema.number().min(1).step(1).default(3).description('下载线程数'),
    downloadTimeout: Schema.number().min(0).step(1).default(120000).description('统一下载超时 (ms)'),
    maxMediaSize: Schema.number().min(0).step(1).default(0).description('最大下载文件大小 (MB)，0 为不限制'),
    aria2Host: Schema.string().default('127.0.0.1').description('aria2 RPC 地址'),
    aria2Port: Schema.number().default(6800).description('aria2 RPC 端口'),
    aria2Secret: Schema.string().default('').description('aria2 RPC 密钥'),
    resumeDownload: Schema.boolean().default(true).description('启用断点续传（仅 aria2 模式）'),
  }).description('下载引擎与性能'),

  Schema.object({
    dedupInterval: Schema.number().min(0).step(1).default(0).description('去重间隔 (秒)，0表示不去重'),
    cacheDuration: Schema.number().min(0).step(1).default(0).description('缓存时间 (秒)，0表示不缓存'),
    autoClearCacheInterval: Schema.number().default(60).min(0).description('自动清理缓存间隔（分钟）'),
    tempDir: Schema.string().default(path.join(process.cwd(), 'temp_images')).description('临时文件目录'),
  }).description('缓存与临时文件'),

  Schema.object({
    waitingTipText: Schema.string().default('').description('等待提示（空则使用默认）'),
    successTipText: Schema.string().default('').description('成功提示'),
    timeoutTipText: Schema.string().default('').description('超时提示'),
    networkErrorText: Schema.string().default('').description('网络错误提示'),
    fetchFailedText: Schema.string().default('').description('获取失败提示'),
    inputErrorText: Schema.string().default('').description('输入为空提示'),
    inputTooLongText: Schema.string().default('').description('输入过长提示'),
    cacheClearedText: Schema.string().default('').description('缓存清理提示'),
    repeatRequestText: Schema.string().default('').description('重复请求提示'),
  }).description('界面文本'),
])

interface FetchResult {
  success: boolean
  type: 'url' | 'buffer' | ''
  data: string | Buffer
  timeout: boolean
  networkError: boolean
  apiUrl: string
}

class SimpleLRUCache<V> {
  private map = new Map<string, { value: V; expireAt: number }>()

  constructor(private max: number, private ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expireAt) {
      this.map.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    while (this.map.size >= this.max) {
      const k = this.map.keys().next().value
      if (k === undefined) break
      this.map.delete(k)
    }
    this.map.set(key, { value, expireAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.map.clear()
  }
}

class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

let sharedAxios: AxiosInstance | null = null
let resultCache: SimpleLRUCache<FetchResult> | null = null
let dedupMap: Map<string, number> | null = null
let downloadLimiter: ConcurrencyLimiter | null = null

function getAxios(config: Config): AxiosInstance {
  if (!sharedAxios) {
    sharedAxios = axios.create({
      timeout: config.timeout,
      headers: { 'User-Agent': USER_AGENT }
    })
  }
  return sharedAxios
}

function initCacheAndDedup(config: Config) {
  resultCache = config.cacheDuration > 0
    ? new SimpleLRUCache<FetchResult>(200, config.cacheDuration * 1000)
    : null
  dedupMap = config.dedupInterval > 0 ? new Map<string, number>() : null
  downloadLimiter = config.imageSendMode === 'file'
    ? new ConcurrencyLimiter(config.downloadConcurrency)
    : null
}

function getI18nText(session: Session | null, key: MessageKey, config: Config): string {
  const customMap: Record<string, string | undefined> = {
    'messages.fetchWaiting': config.waitingTipText,
    'messages.fetchSuccess': config.successTipText,
    'messages.fetchTimeout': config.timeoutTipText,
    'messages.fetchNetworkError': config.networkErrorText,
    'messages.fetchFailed': config.fetchFailedText,
    'messages.inputError': config.inputErrorText,
    'messages.inputTooLong': config.inputTooLongText,
    'messages.cacheCleared': config.cacheClearedText,
    'messages.repeatRequest': config.repeatRequestText,
  }
  const custom = customMap[key]
  if (custom) return custom
  if (session?.text) return session.text(key)
  return DEFAULT_LOCALES['zh-CN'][key] || key
}

function buildApiUrl(type: 'hsjp' | 'dmjp', params: string[]): string {
  if (type === 'hsjp') {
    const [msg, msg1, msg2] = params.map(encodeURIComponent)
    return `${HSJP_API}?msg=${msg}&msg1=${msg1}&msg2=${msg2}`
  } else {
    const text = encodeURIComponent(params[0])
    return `${DMJP_API}?text=${text}`
  }
}

function clearOldCacheFiles(config: Config): void {
  if (!fs.existsSync(config.tempDir)) return
  const now = Date.now()
  const ageThreshold = config.autoClearCacheInterval > 0
    ? config.autoClearCacheInterval * 60000
    : 3600000
  const resolvedDir = path.resolve(config.tempDir)
  fs.readdirSync(config.tempDir).forEach(file => {
    try {
      const filePath = path.join(config.tempDir, file)
      if (!filePath.startsWith(resolvedDir + path.sep)) return
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return
      if (now - stat.mtimeMs > ageThreshold) fs.unlinkSync(filePath)
    } catch {}
  })
}

function clearAllCache(config: Config): void {
  if (!fs.existsSync(config.tempDir)) return
  const resolvedDir = path.resolve(config.tempDir)
  fs.readdirSync(config.tempDir).forEach(file => {
    try {
      const filePath = path.join(config.tempDir, file)
      if (!filePath.startsWith(resolvedDir + path.sep)) return
      const stat = fs.statSync(filePath)
      if (stat.isFile()) fs.unlinkSync(filePath)
    } catch {}
  })
}

async function fetchImage(url: string, config: Config): Promise<FetchResult> {
  const empty: FetchResult = {
    success: false,
    type: '',
    data: '',
    timeout: false,
    networkError: false,
    apiUrl: url
  }
  if (IMAGE_URL_PATTERN.test(url)) {
    return { success: true, type: 'url', data: url, timeout: false, networkError: false, apiUrl: url }
  }
  const http = getAxios(config)
  try {
    const res = await http.get(url, { responseType: 'arraybuffer' })
    if (res.status === 200 && res.data) {
      return { success: true, type: 'buffer', data: res.data, timeout: false, networkError: false, apiUrl: url }
    }
    return empty
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') return { ...empty, timeout: true }
      if (!error.response) return { ...empty, networkError: true }
    }
    return empty
  }
}

function buildImageElement(result: FetchResult): h {
  if (result.type === 'url') return h.image(result.data as string)
  const base64 = Buffer.from(result.data as Buffer).toString('base64')
  return h.image(`data:${FALLBACK_MIME};base64,${base64}`)
}

function getFailureMessage(result: FetchResult, config: Config): MessageKey | null {
  if (result.success) return null
  if (result.timeout && config.showTimeoutTip) return 'messages.fetchTimeout'
  if (result.networkError) return 'messages.fetchNetworkError'
  return 'messages.fetchFailed'
}

async function sendTimeout(session: Session, content: string | h, config: Config): Promise<void> {
  if (config.imageSendTimeout <= 0) {
    await session.send(content).catch(() => {})
    return
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      session.send(content),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('send_timeout')), config.imageSendTimeout)
      })
    ])
  } catch {} finally {
    if (timer !== null) clearTimeout(timer)
  }
}

async function sendWithRetry(session: Session, content: string | h, config: Config): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt <= config.retryTimes; attempt++) {
    try {
      await sendTimeout(session, content, config)
      return
    } catch (e) {
      lastError = e
      if (attempt < config.retryTimes) {
        await delay(config.retryInterval)
      }
    }
  }
  if (!config.ignoreSendError) throw lastError
}

async function downloadFile(
  url: string,
  config: Config,
  ctx: Context,
  filePrefix: string,
  fileExts: string[]
): Promise<string> {
  await fsp.mkdir(config.tempDir, { recursive: true })
  const ext = fileExts.find(e => {
    const r = new RegExp('\\.' + e + '(\\?|$)', 'i')
    return r.test(url)
  }) || fileExts[0]
  const fileName = `${filePrefix}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`
  const filePath = path.resolve(config.tempDir, fileName)

  if (config.downloadEngine === 'downloads' && ctx.downloads) {
    try {
      const dest = await ctx.downloads.download(url, path.join(config.tempDir, fileName), {
        headers: { 'User-Agent': USER_AGENT },
        timeout: config.downloadTimeout
      })
      const stat = await fsp.stat(dest)
      if (config.maxMediaSize > 0 && stat.size > config.maxMediaSize * 1024 * 1024) {
        await fsp.unlink(dest).catch(() => {})
        throw new Error(`文件过大(${Math.round(stat.size / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`)
      }
      return dest
    } catch (e) {}
  } else if (config.downloadEngine === 'aria2') {
    let aria2: any
    try {
      aria2 = require('aria2')
    } catch {
      throw new Error('aria2 模块未安装')
    }
    const client = new aria2({
      host: config.aria2Host,
      port: config.aria2Port,
      secure: false,
      secret: config.aria2Secret,
      path: '/jsonrpc'
    })
    try {
      await client.open()
      const gid = await client.call('aria2.addUri', [url], {
        dir: config.tempDir,
        out: fileName,
        split: 4,
        continue: config.resumeDownload,
        maxConnectionPerServer: 5,
        timeout: config.downloadTimeout / 1000,
        header: [`User-Agent: ${USER_AGENT}`, 'Referer: https://www.baidu.com/']
      })
      let completed = false
      const start = Date.now()
      while (!completed) {
        if (Date.now() - start > config.downloadTimeout) {
          await client.call('aria2.remove', gid).catch(() => {})
          throw new Error('aria2下载超时')
        }
        const status = await client.call('aria2.tellStatus', gid)
        if (status.status === 'complete') {
          completed = true
        } else if (status.status === 'error' || status.status === 'removed') {
          throw new Error('aria2下载失败')
        } else {
          await delay(1000)
        }
      }
    } finally {
      await client.close().catch(() => {})
    }
  } else {
    const writer = createWriteStream(filePath)
    let response
    try {
      response = await getAxios(config).get(url, {
        responseType: 'stream',
        timeout: config.downloadTimeout,
        headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.baidu.com/' },
        maxRedirects: 5,
        validateStatus: (status: number) => status >= 200 && status < 300,
      })
    } catch (e) {
      writer.destroy()
      await fsp.unlink(filePath).catch(() => {})
      throw e
    }
    const contentLength = Number(response.headers['content-length'] || 0)
    const maxBytes = config.maxMediaSize * 1024 * 1024
    if (maxBytes > 0 && contentLength > maxBytes) {
      writer.destroy()
      await fsp.unlink(filePath).catch(() => {})
      throw new Error(`文件过大(${Math.round(contentLength / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`)
    }
    try {
      await pipeline(response.data, writer)
    } catch (e) {
      await fsp.unlink(filePath).catch(() => {})
      throw e
    }
  }

  const stat = await fsp.stat(filePath)
  if (config.maxMediaSize > 0 && stat.size > config.maxMediaSize * 1024 * 1024) {
    await fsp.unlink(filePath).catch(() => {})
    throw new Error(`文件过大(${Math.round(stat.size / 1024 / 1024)}MB)，超过限制(${config.maxMediaSize}MB)`)
  }
  return filePath
}

async function processRequest(
  session: Session,
  config: Config,
  type: 'hsjp' | 'dmjp',
  params: string[],
  ctx: Context
): Promise<void> {
  const apiUrl = buildApiUrl(type, params)

  if (dedupMap) {
    const lastTime = dedupMap.get(apiUrl)
    if (lastTime && Date.now() - lastTime < config.dedupInterval * 1000) {
      await sendWithRetry(session, getI18nText(session, 'messages.repeatRequest', config), config)
      return
    }
    dedupMap.set(apiUrl, Date.now())
  }

  let result: FetchResult | undefined
  if (resultCache) {
    result = resultCache.get(apiUrl)
  }

  if (!result) {
    result = await fetchImage(apiUrl, config)
    if (result.success && resultCache) {
      resultCache.set(apiUrl, result)
    }
  }

  const failMsg = getFailureMessage(result, config)
  if (failMsg) {
    await sendWithRetry(session, getI18nText(session, failMsg, config), config)
    return
  }

  if (config.imageSendMode === 'link') {
    await sendWithRetry(session, result.apiUrl, config)
  } else if (config.imageSendMode === 'file') {
    if (!downloadLimiter) downloadLimiter = new ConcurrencyLimiter(config.downloadConcurrency)
    await downloadLimiter.acquire()
    try {
      let filePath: string
      if (result.type === 'buffer') {
        await fsp.mkdir(config.tempDir, { recursive: true })
        const fileName = `img_${Date.now()}_${randomBytes(4).toString('hex')}.jpg`
        filePath = path.join(config.tempDir, fileName)
        await fsp.writeFile(filePath, result.data as Buffer)
      } else {
        filePath = await downloadFile(result.data as string, config, ctx, 'img', ['jpg', 'jpeg', 'png', 'gif', 'webp'])
      }
      await sendWithRetry(session, h.image(`file://${filePath}`), config)
    } catch (e) {
      await sendWithRetry(session, getI18nText(session, 'messages.fetchFailed', config), config)
    } finally {
      downloadLimiter.release()
    }
  } else {
    const imageElem = buildImageElement(result)
    if (config.showSuccessTip) {
      await sendWithRetry(session, getI18nText(session, 'messages.fetchSuccess', config), config)
      await delay(SUCCESS_DELAY_MS)
    }
    await sendWithRetry(session, imageElem, config)
  }
}

function validateInput(input: string): MessageKey | null {
  if (!input || input.trim().length === 0) return 'messages.inputError'
  if (input.length > MAX_INPUT_LENGTH) return 'messages.inputTooLong'
  return null
}

export function apply(ctx: Context, config: Config) {
  Object.keys(DEFAULT_LOCALES).forEach(lang => {
    ctx.i18n.define(lang as LocaleKey, DEFAULT_LOCALES[lang as LocaleKey])
  })

  sharedAxios = axios.create({
    timeout: config.timeout,
    headers: { 'User-Agent': USER_AGENT }
  })

  initCacheAndDedup(config)
  clearOldCacheFiles(config)
  ctx.logger.info('[custom-image] 插件已加载')

  ctx.command('hsjp <msg> [msg1] [msg2]', DEFAULT_LOCALES['zh-CN']['commands.hsjp'])
    .action(async ({ session }, msg, msg1 = '', msg2 = '') => {
      if (!config.enable || !config.hsjpEnabled || !session) return
      const errorKey = validateInput(msg)
      if (errorKey) {
        await sendWithRetry(session, getI18nText(session, errorKey, config), config)
        return
      }
      if (config.showWaitingTip) {
        await sendWithRetry(session, getI18nText(session, 'messages.fetchWaiting', config), config)
      }
      await processRequest(session, config, 'hsjp', [msg, msg1, msg2], ctx)
    })

  ctx.command('dmjp <text>', DEFAULT_LOCALES['zh-CN']['commands.dmjp'])
    .action(async ({ session }, text) => {
      if (!config.enable || !config.dmjpEnabled || !session) return
      const errorKey = validateInput(text)
      if (errorKey) {
        await sendWithRetry(session, getI18nText(session, errorKey, config), config)
        return
      }
      if (config.showWaitingTip) {
        await sendWithRetry(session, getI18nText(session, 'messages.fetchWaiting', config), config)
      }
      await processRequest(session, config, 'dmjp', [text], ctx)
    })

  ctx.command('clear-image-cache', DEFAULT_LOCALES['zh-CN']['commands.clear-image-cache'])
    .action(({ session }) => {
      clearAllCache(config)
      return getI18nText(session ?? null, 'messages.cacheCleared', config)
    })

  let clearTimer: ReturnType<typeof setInterval> | null = null
  if (config.autoClearCacheInterval > 0) {
    clearTimer = setInterval(() => {
      clearOldCacheFiles(config)
      ctx.logger.info('[custom-image] 缓存已自动清理')
    }, config.autoClearCacheInterval * 60000)
  }

  ctx.on('dispose', () => {
    if (clearTimer !== null) clearInterval(clearTimer)
    clearAllCache(config)
    sharedAxios = null
    resultCache?.clear()
    dedupMap?.clear()
    ctx.logger.info('[custom-image] 插件已卸载，缓存已清理')
  })
}

export const inject = { optional: ['i18n', 'downloads'] }
export const using = [] as const