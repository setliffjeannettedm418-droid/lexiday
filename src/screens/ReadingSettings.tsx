import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Picker } from "../components/ui";
import type { State, SaveState } from "../types";
import type { useReading } from "../features/reading/useReading";
import { clearService, configureService, MODELS } from "../features/reading/service";
export default function ReadingSettings({ state, save, controls }: { state: State; save: SaveState; controls: ReturnType<typeof useReading> }) {
  const [key, setKey] = useState(""); const [model, setModel] = useState(controls.service.model);
  const [consent, setConsent] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => setModel(controls.service.model), [controls.service.model]);
  async function configure() {
    if (!consent) return; setPending(true); setMessage("");
    try { await configureService(key, model); setKey(""); await save(s => ({ ...s, settings: { ...s.settings, readingAuto: true } })); await controls.refreshService();
      setMessage("配置已保存在本机，自动生成已开启。密钥是否可用将在首次生成时检查。"); setConsent(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败，请重试。"); } finally { setPending(false); }
  }
  async function clear() {
    setPending(true);
    try { controls.pause(); await clearService(); await save(s => ({ ...s, settings: { ...s.settings, readingAuto: false } })); await controls.refreshService(); setMessage("本机生成密钥已移除，已保存文章不受影响。"); }
    catch { setMessage("移除失败，请重试。"); } finally { setPending(false); }
  }
  return <section className="settings-section reading-service-settings" id="reading-service"><h2>DeepSeek · 阅读与拍照识词</h2>
    <div className="setting-row"><div><strong>满 80 词自动生成</strong><p>按首次提交测试的不同单词累计，跨天累积。App 打开且联网时生成；失败后需手动重试。</p></div><Switch aria-label="满80词自动生成" checked={!!state.settings.readingAuto} disabled={!controls.service.configured || pending} onCheckedChange={v => { if (!v) controls.pause(); void save(s => ({ ...s, settings: { ...s.settings, readingAuto: v } })); }} /></div>
    <div className="reading-service-description"><strong>DeepSeek 官方生成服务</strong><p>每组 80 词生成 4 篇短文，附逐句译文、语法和词义应用。生成时发送当篇的 20 个词及其词义、搭配；手动补全待核对词时，还会发送该篇已有英文正文。阅读查词的词典释义离线提供；手动获取本句详解时发送所选词、所在句及该句译文。不上传 Word 原文件、文件名、答题记录或整本词库。</p><p>拍照识词复用此密钥，固定使用支持图片的 Flash 模型。在导入页手动点“识别并整理”才发送本次选择的照片，补全释义、考点、搭配和例句。照片不写入词库或学习备份；核对确认后仅保存词条内容。</p><p>使用你自己的 API 账户并按用量计费，App 不代充值。取消或网络中断，请求仍可能已计费。查看 <a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noreferrer">官方计费说明</a>。</p></div>
    <div className="setting-row"><div><strong>生成模型</strong><p>Flash 适合日常练习，Pro 可用于较复杂的语言分析。</p></div><Picker label="文章生成模型" value={model} onChange={setModel} items={MODELS} /></div>
    <div className="reading-key-field"><label htmlFor="reading-api-key">API 密钥 · {controls.service.configured ? "已配置" : "尚未配置"}</label><input id="reading-api-key" aria-label="文章生成API密钥" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={controls.service.configured ? "留空保留已有密钥，填写则替换" : "在本机填写自己的 DeepSeek API 密钥"} value={key} onChange={e => setKey(e.target.value)} /><p className="muted">{Capacitor.isNativePlatform() ? "密钥经 Android 系统密钥库加密保存在本机，不回显、不加入学习备份。" : "网页版只在当前页面内存保存密钥，关闭后失效；跨域受限时请使用 Android 版。"}</p></div>
    <label className="reading-consent"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} aria-label="同意发送本批词汇并承担API调用费用" /><span>我了解上述数据发送范围与按量费用，允许生成文章并开启自动生成，以及手动使用拍照识词。</span></label>
    <div className="reading-actions"><button className="primary" disabled={pending || !consent || (!controls.service.configured && !key.trim())} onClick={() => void configure()}>{pending ? "处理中…" : "保存并启用生成"}</button>{controls.service.configured && <button className="secondary" disabled={pending} onClick={() => void clear()}>移除密钥</button>}</div>
    {(message || controls.serviceError) && <p role="status" className="reading-settings-message">{message || controls.serviceError}</p>}
  </section>;
}
