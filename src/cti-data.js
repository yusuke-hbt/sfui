import { rng } from './data.js';

// CTI（脅威インテリジェンス）モードのダミーデータ。実在の組織・攻撃者とは無関係の架空の名前。
// キルチェーンの12列。技術ID（ATT&CK）は一般公開されているものを使う。
export const TACTICS = [
  { id: 'TA0001', en: 'INITIAL ACCESS', jp: '初期侵入', short: 'INITIAL', tech: [['T1190', 'Exploit Public-Facing App'], ['T1566', 'Phishing'], ['T1078', 'Valid Accounts'], ['T1133', 'External Remote Services'], ['T1195', 'Supply Chain Compromise']] },
  { id: 'TA0002', en: 'EXECUTION', jp: '実行', short: 'EXEC', tech: [['T1059', 'Command & Scripting'], ['T1203', 'Exploit for Client Exec'], ['T1204', 'User Execution'], ['T1047', 'WMI'], ['T1053', 'Scheduled Task']] },
  { id: 'TA0003', en: 'PERSISTENCE', jp: '永続化', short: 'PERSIST', tech: [['T1547', 'Boot/Logon Autostart'], ['T1543', 'Create/Modify Service'], ['T1136', 'Create Account'], ['T1505', 'Server Software Comp.'], ['T1098', 'Account Manipulation']] },
  { id: 'TA0004', en: 'PRIV ESCALATION', jp: '権限昇格', short: 'PRIVESC', tech: [['T1068', 'Exploit for Priv Esc'], ['T1548', 'Abuse Elevation Control'], ['T1055', 'Process Injection'], ['T1134', 'Access Token Manip.']] },
  { id: 'TA0005', en: 'DEFENSE EVASION', jp: '防御回避', short: 'EVASION', tech: [['T1027', 'Obfuscated Files'], ['T1070', 'Indicator Removal'], ['T1562', 'Impair Defenses'], ['T1036', 'Masquerading'], ['T1218', 'Signed Binary Proxy']] },
  { id: 'TA0006', en: 'CREDENTIAL ACCESS', jp: '認証情報', short: 'CRED', tech: [['T1003', 'OS Credential Dumping'], ['T1110', 'Brute Force'], ['T1558', 'Kerberos Tickets'], ['T1555', 'Password Stores']] },
  { id: 'TA0007', en: 'DISCOVERY', jp: '探索', short: 'DISCOVER', tech: [['T1082', 'System Info Discovery'], ['T1083', 'File & Dir Discovery'], ['T1018', 'Remote System Discovery'], ['T1046', 'Network Service Scan']] },
  { id: 'TA0008', en: 'LATERAL MOVEMENT', jp: '横展開', short: 'LATERAL', tech: [['T1021', 'Remote Services'], ['T1550', 'Alt Auth Material'], ['T1570', 'Lateral Tool Transfer'], ['T1210', 'Exploit Remote Services']] },
  { id: 'TA0009', en: 'COLLECTION', jp: '収集', short: 'COLLECT', tech: [['T1005', 'Data from Local System'], ['T1560', 'Archive Collected Data'], ['T1114', 'Email Collection'], ['T1074', 'Data Staged']] },
  { id: 'TA0011', en: 'COMMAND & CONTROL', jp: '指令制御', short: 'C2', tech: [['T1071', 'App Layer Protocol'], ['T1105', 'Ingress Tool Transfer'], ['T1572', 'Protocol Tunneling'], ['T1090', 'Proxy'], ['T1573', 'Encrypted Channel']] },
  { id: 'TA0010', en: 'EXFILTRATION', jp: '持出し', short: 'EXFIL', tech: [['T1041', 'Exfil Over C2'], ['T1567', 'Exfil Over Web Service'], ['T1048', 'Exfil Alt Protocol']] },
  { id: 'TA0040', en: 'IMPACT', jp: '影響', short: 'IMPACT', tech: [['T1486', 'Data Encrypted'], ['T1490', 'Inhibit Recovery'], ['T1489', 'Service Stop'], ['T1485', 'Data Destruction']] },
];

// 起点の地域（ミニマップ上の位置は0〜1）。JAPAN は守る側（このセル）の位置。
export const REGIONS = {
  'EAST ASIA': [0.80, 0.40], 'EASTERN EUROPE': [0.58, 0.27], 'MIDDLE EAST': [0.62, 0.45],
  'SOUTH ASIA': [0.71, 0.50], 'SOUTHEAST ASIA': [0.78, 0.62], UNKNOWN: [0.33, 0.58],
};
export const HOME = { name: 'JAPAN', p: [0.89, 0.36] };

const MOTIVE_JP = { ESPIONAGE: '諜報', FINANCIAL: '金銭', DESTRUCTIVE: '破壊', HACKTIVISM: '活動主義' };
const SUFFIX = ['LOADER', 'RAT', 'STEALER', 'WIPER', 'BACKDOOR', 'DROPPER', 'IMPLANT', 'LOCKER'];
const OPS = ['NIGHTFALL', 'GLASS HARBOR', 'COLD FRONT', 'PAPER LANTERN', 'DEEP CURRENT', 'SALT ROAD', 'IRON ORCHID', 'LAST SIGNAL', 'BLUE LEDGER', 'HOLLOW CROWN', 'TIDE LOCK', 'RED MERIDIAN'];
const FEEDS = ['OSINT', 'ISAC', 'VENDOR', 'HONEYPOT', 'DARKWEB', 'CERT'];
export const SECTOR_JP = { Government: '政府', Telecom: '通信', Defense: '防衛', Energy: 'エネルギー', Media: '報道', Finance: '金融', Retail: '小売', Aviation: '航空', Healthcare: '医療', Manufacturing: '製造', Education: '教育', Technology: '情報技術', Semiconductors: '半導体', Crypto: '暗号資産', Maritime: '海運', Logistics: '物流', Hospitality: '宿泊', Automotive: '自動車' };

const RAW = [
  ['SILENT LOTUS', ['Lotus Blossom-7', 'TA-4141'], 'EAST ASIA', 'ESPIONAGE', ['Government', 'Telecom', 'Defense'], 2016, 8.6, 'HIGH', 'LOTUS'],
  ['IRON MERIDIAN', ['Meridian Bear', 'UNC-2288'], 'EASTERN EUROPE', 'DESTRUCTIVE', ['Energy', 'Government', 'Media'], 2014, 9.4, 'HIGH', 'MERIDIAN'],
  ['PALE HERON', ['Heron Spider', 'FIN-19'], 'EASTERN EUROPE', 'FINANCIAL', ['Finance', 'Retail'], 2018, 7.1, 'MEDIUM', 'HERON'],
  ['OBSIDIAN KITE', ['Kite Runner-X', 'TA-0932'], 'MIDDLE EAST', 'ESPIONAGE', ['Energy', 'Aviation'], 2017, 7.8, 'MEDIUM', 'KITE'],
  ['CRIMSON VESPER', ['Vesper Lock'], 'UNKNOWN', 'FINANCIAL', ['Healthcare', 'Manufacturing'], 2021, 9.1, 'MEDIUM', 'VESPER'],
  ['GHOST CARTOGRAPH', ['Mapmaker', 'UNC-5011'], 'SOUTH ASIA', 'ESPIONAGE', ['Government', 'Education'], 2019, 6.2, 'LOW', 'CARTO'],
  ['AZURE TIDEWALKER', ['Tidewalk', 'TA-3307'], 'EAST ASIA', 'ESPIONAGE', ['Technology', 'Semiconductors'], 2015, 8.9, 'HIGH', 'TIDE'],
  ['NEON SPARROW', ['Sparrow Kit'], 'SOUTHEAST ASIA', 'FINANCIAL', ['Finance', 'Crypto'], 2022, 6.8, 'MEDIUM', 'SPARROW'],
  ['STATIC WRAITH', ['Wraith Noise', 'UNC-7740'], 'EASTERN EUROPE', 'HACKTIVISM', ['Media', 'Government'], 2022, 5.9, 'LOW', 'WRAITH'],
  ['AMBER CORSAIR', ['Corsair-M'], 'MIDDLE EAST', 'ESPIONAGE', ['Maritime', 'Logistics'], 2020, 6.5, 'MEDIUM', 'CORSAIR'],
  ['VOID ORCHARD', ['Orchard Bloom', 'FIN-44'], 'UNKNOWN', 'FINANCIAL', ['Retail', 'Hospitality'], 2023, 5.4, 'LOW', 'ORCHARD'],
  ['COBALT HALCYON', ['Halcyon-J', 'TA-2216'], 'EAST ASIA', 'ESPIONAGE', ['Manufacturing', 'Automotive'], 2018, 8.2, 'HIGH', 'HALCYON'],
];

// 動機ごとに選ばれやすい戦術（ATT&CKの戦術番号）
const BIAS = {
  ESPIONAGE: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10],
  FINANCIAL: [0, 1, 2, 5, 6, 7, 8, 10, 11],
  DESTRUCTIVE: [0, 1, 2, 3, 4, 7, 11],
  HACKTIVISM: [0, 1, 4, 9, 10, 11],
};

const hex = (r, n) => Array.from({ length: n }, () => '0123456789abcdef'[(r() * 16) | 0]).join('');
const word = (r, n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[(r() * 26) | 0]).join('');

function iocFor(r) {
  const k = r();
  if (k < 0.34) return { type: 'IPV4', v: `${['203.0.113', '198.51.100', '192.0.2'][(r() * 3) | 0]}.${1 + ((r() * 250) | 0)}` };
  if (k < 0.62) return { type: 'DOMAIN', v: `${word(r, 4)}-${['sync', 'cdn', 'update', 'auth', 'mail'][(r() * 5) | 0]}[.]${['xyz', 'top', 'site', 'info'][(r() * 4) | 0]}` };
  if (k < 0.86) return { type: 'SHA256', v: `${hex(r, 8)}…${hex(r, 4)}` };
  return { type: 'URL', v: `hxxps://${word(r, 5)}[.]${['xyz', 'top'][(r() * 2) | 0]}/${word(r, 3)}` };
}

export function makeActors() {
  return RAW.map(([name, aliases, origin, motive, sectors, since, sev, conf, stem], i) => {
    const r = rng(i * 977 + 41);
    // 使う技術: 動機に合う戦術を中心に、各戦術から1〜2個
    const used = [];
    TACTICS.forEach((T, ti) => {
      const likely = BIAS[motive].includes(ti);
      if (r() < (likely ? 0.86 : 0.34)) {
        const n = likely && r() < 0.4 ? 2 : 1, picks = new Set();
        while (picks.size < Math.min(n, T.tech.length)) picks.add((r() * T.tech.length) | 0);
        picks.forEach((k) => used.push({ tactic: ti, k, id: T.tech[k][0], name: T.tech[k][1] }));
      }
    });
    const nm = 2 + ((r() * 3) | 0);
    const malware = Array.from({ length: nm }, (_, j) => `${stem} ${SUFFIX[(i * 3 + j * 5 + ((r() * 8) | 0)) % SUFFIX.length]}`);
    const nc = 2 + ((r() * 2) | 0);
    const campaigns = Array.from({ length: nc }, (_, j) => ({
      name: `OP ${OPS[(i * 5 + j * 7) % OPS.length]}`, year: 2023 + ((r() * 4) | 0), active: r() < 0.6,
    }));
    const iocs = Array.from({ length: 8 + ((r() * 3) | 0) }, () => iocFor(r));
    const activity = Array.from({ length: 48 }, (_, k) => Math.min(1, Math.max(0.04, 0.2 + 0.35 * Math.abs(Math.sin(k * 0.23 + i)) + 0.35 * r() * (k > 34 ? 1.2 : 0.6))));
    return {
      index: i, name, aliases, origin, motive, motiveJp: MOTIVE_JP[motive], sectors, since, sev, conf, stem,
      used, malware: [...new Set(malware)], campaigns, iocs, activity,
      feed: FEEDS[i % FEEDS.length], seen: `${1 + ((r() * 55) | 0)}m`,
    };
  });
}

// 情報フィードの流れる文言
export const FEED_POOL = [
  ['IOC', 'New C2 infrastructure linked to {A}'], ['TTP', 'Technique shift observed: {T}'], ['RPT', 'Report updated: {C}'],
  ['IOC', 'Hash cluster attributed to {A}'], ['TTP', '{T} usage spike in telemetry'], ['RPT', 'Vendor advisory: {A} activity'],
  ['IOC', 'Infrastructure overlap detected: {A}'], ['RPT', 'ISAC bulletin: {C} targeting {S}'], ['TTP', 'New detection rule matched {T}'],
];
