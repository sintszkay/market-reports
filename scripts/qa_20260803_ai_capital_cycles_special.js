#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'reports', '2026-08-03-ai-capital-cycles-special.html');
const html = fs.readFileSync(reportPath, 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const count = re => (html.match(re) || []).length;
const hasAll = values => values.every(value => html.includes(value));
const opening = tag => count(new RegExp(`<${tag}(?:\\s|>)`, 'g'));
const closing = tag => count(new RegExp(`</${tag}>`, 'g'));

const periods = ['美國鐵路擴張', '電信與光纖建設', 'AI 算力與資料中心'];
const eventReturns = [
  ['SNDK', '-55.32%'], ['NBIS', '-46.33%'], ['BE', '-45.90%'],
  ['CRWV', '-38.90%'], ['MU', '-35.97%'], ['IREN', '-35.91%'],
  ['WDAY', '+37.24%'], ['ADBE', '+28.49%'], ['INTU', '+28.20%'],
  ['CRM', '+20.25%'], ['VEEV', '+17.15%']
];

const checks = {
  fileSize: Buffer.byteLength(html, 'utf8') > 55000,
  documentShell: hasAll(['<!doctype html>', '<html lang="zh-Hant">', '<meta charset="utf-8">', '<main class="wrap">']),
  balancedCoreTags: ['html', 'head', 'body', 'main', 'header', 'nav', 'section', 'table', 'thead', 'tbody', 'tr'].every(tag => opening(tag) === closing(tag)),
  noPlaceholders: !/undefined|NaN|REPLACE_ME|<!--\s*DATA:|TODO|TBD/.test(html),
  noMojibake: !/锝|銆|鍓|鐩|鈻|鈥|妯欏|鏁據|�/.test(html),
  flatVisuals: !/linear-gradient|box-shadow|font-weight\s*:\s*(?:600|700|800|900)/.test(html),
  sharedAssets: /report-shared\.css\?v=20260803-ai-capital-cycles/.test(html) && /report-runtime\.js\?v=20260803-ai-capital-cycles/.test(html),
  allThreePeriods: periods.every(period => html.includes(period)) && count(/class="period-card"/g) === 3,
  comparisonDimensions: hasAll(['需求承諾', '供給反應', '資產壽命', '融資脆弱點', '過建訊號', '資本受損者', '後續價值捕獲']),
  articleAudit: hasAll(['原文核驗', '作者引述', '未經公開審計', '已交叉確認', '尚未證明']),
  fullTextIntegration: hasAll(['7 月 24 日', '上半年淨回報 +439%', '上市多空組合約 160 億美元', '月度 -67%，年內仍 +80%', '附件全文已融入']),
  unwindCausalChain: count(/class="causal-flow"/g) === 1 && hasAll(['錯向交易 × 槓桿 × 集中度', '不聲稱單一基金平倉', 'prime-broker']),
  microsoftAttribution: hasAll(['390.54 美元', '451.10 美元', '15.51%', '1.102 億股', 'Azure 增速', '+43%', '6,780 億美元', '逾 3,000 萬席', '不能把漲幅主要歸因於被迫回補']),
  longbridgeReturns: eventReturns.every(([ticker, ret]) => html.includes(ticker) && html.includes(ret)),
  eventWindowExplicit: hasAll(['2026-06-30', '2026-07-29', '未復權收盤', '2026-07-31 正式收盤']),
  notSingleCause: hasAll(['不聲稱單一基金平倉', '唯一原因']),
  captureNuance: hasAll(['不能二分', '專有瓶頸與技術標準', '算力、模型與分發垂直整合', '系統紀錄與受監管工作流', '可替代容量與槓桿資產']),
  tollBoothMechanism: hasAll(['Adams Express', 'American Express', 'Pullman', 'Global Crossing', '身分與權限', '系統紀錄', '合規與稽核', '工作流與資料', '合約與轉換成本']),
  softwareEvidence: hasAll(['Agentforce ARR', '12 億美元', 'AI-first ARR', 'Vault CRM', 'AI agents 免費提供至 2030 年', 'AI 淨新增 ARR']),
  capitalAccounting: hasAll(['FY26 Q4 Capex 410 億美元', '三分之二為 CPU／GPU', '折舊多 14 億美元', '淨利多 25.9 億美元', 'Capex 556.63 億美元', 'senior notes 淨所得 427 億美元', '經濟折舊是否快於會計折舊']),
  usefulLifeNuance: hasAll(['建築壽命與伺服器壽命', '不等於 GPU 延壽', '拒絕把披露的估計變更直接定性為造假']),
  scenarioMath: hasAll(['35%', '45%', '20%']) && (35 + 45 + 20 === 100) && count(/class="scenario(?: bull| risk)?"/g) === 3,
  monitoringFramework: hasAll(['超大雲商資本效率', '算力供需', '電力與資料中心', '第二層融資', '企業軟體 AI 變現', '市場價格驗證']),
  sectionConclusions: count(/section-summary/g) >= 7 && count(/callout/g) >= 8,
  sources: count(/<a href="https:\/\//g) >= 18 && hasAll(['Porter Stansberry 原文', 'Federal Reserve History', 'NBER／鐵路投資與恐慌', 'Federal Reserve／2001 光纖容量與槓桿', 'Microsoft FY26 Q4 財報', 'Microsoft FY26 Q4 電話會', 'Amazon 2025 10-K', 'Meta 2025 10-K', 'Oracle FY26 10-K']),
  qaVisible: hasAll(['QA 審查', '三時期完整性', '原文與事實分離', '附件全文融入', 'Microsoft 歸因', '耐用年限與會計', '因果限制', '情境機率']),
  tableLayout: count(/class="report-data-table/g) >= 9 && count(/class="num(?:"| )/g) >= 60,
  homepageLink: index.includes('reports/2026-08-03-ai-capital-cycles-special.html') && index.includes('三次基礎設施狂潮：鐵路、光纖與 AI 算力'),
  homepageCounts: index.includes('id="type-count-all">84</span>') && index.includes('id="type-count-special">4</strong>') && index.includes('id="report-count">84</span>'),
  noSimplifiedStructuralText: !/[这为与个从时后数据过长会发关开门体线进应实术资产势]/.test(
    html.replace(/https?:\/\/[^"<\s]+/g, '').replace(/<style>[\s\S]*?<\/style>/g, '')
  )
};

console.log(JSON.stringify(checks, null, 2));
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error(`QA failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`PASS: ${path.basename(reportPath)} (${Buffer.byteLength(html, 'utf8')} bytes)`);
