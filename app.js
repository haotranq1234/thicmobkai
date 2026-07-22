const dropzone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const scanBtn = document.getElementById('scan-btn');
const exportBtn = document.getElementById('export-btn');
const report = document.getElementById('report');
const output = document.getElementById('output');
const tabs = [...document.querySelectorAll('.tab')];

let selectedFile = null;
let scanState = null;
let currentTab = 'thicmob';

const ZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((btn) => btn.classList.toggle('active', btn === tab));
    currentTab = tab.dataset.target;
    renderOutput();
  });
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  const file = event.dataTransfer.files?.[0];
  if (file) setFile(file);
});
input.addEventListener('change', () => {
  if (input.files?.[0]) setFile(input.files[0]);
});

scanBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    setReport('<span class="warn">Bạn chưa chọn file pack.</span>');
    return;
  }
  await scanPack(selectedFile);
});

exportBtn.addEventListener('click', () => {
  if (!scanState) return;
  const blob = new Blob([scanState[currentTab]], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thicmobkai-${currentTab}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

function setFile(file) {
  selectedFile = file;
  dropzone.querySelector('.drop-title').textContent = file.name;
  dropzone.querySelector('.drop-sub').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · bấm Quét pack để chuyển đổi`;
}

function setReport(html) {
  report.classList.remove('empty');
  report.innerHTML = html;
}

function normalize(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function fileBaseName(path) {
  const clean = normalize(path);
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

function safeId(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'mob';
}

function readTextByRegex(content, patterns, fallback = '') {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }
  return fallback;
}

function splitBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const nameMatch = line.match(/^([A-Za-z0-9_\-]+):\s*$/);
    if (nameMatch && !line.startsWith(' ')) {
      if (current) blocks.push(current);
      current = { id: nameMatch[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (current) blocks.push(current);
  return blocks;
}

function getIndent(line) {
  return (line.match(/^\s*/)?.[0] || '').length;
}

function stripQuotes(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '');
}

function normalizeValue(value) {
  const clean = stripQuotes(String(value || '').trim());
  if (/^(true|false)$/i.test(clean)) return clean.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(clean)) return clean;
  return `"${clean.replace(/"/g, '\\"')}"`;
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (/^(true|false|null)$/i.test(text)) return text.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function parseParamBlock(raw) {
  const brace = raw.match(/\{([^}]*)\}/);
  if (!brace) return {};
  const params = {};
  for (const part of brace[1].split(/[;,|]/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const [key, ...rest] = chunk.split(/[:=]/);
    if (!key || !rest.length) {
      params[chunk] = 'true';
      continue;
    }
    params[key.trim()] = normalizeValue(rest.join('=').trim());
  }
  return params;
}

function isLikelySkillLine(raw) {
  const base = String(raw || '').trim().split(/[({\s]/)[0].toLowerCase();
  const commonPrefixes = new Set([
    'damage',
    'heal',
    'message',
    'sound',
    'effect',
    'potion',
    'potioneffect',
    'summon',
    'teleport',
    'command',
    'randomskill',
    'skill',
    'leap',
    'lightning',
    'throw',
    'setstance',
    'sethealth',
    'setfaction',
    'projectile',
    'velocity',
    'strike',
    'modelengine',
  ]);
  return raw.includes('{') || raw.includes('(') || commonPrefixes.has(base);
}

function parseMythicSkillEntries(content) {
  const lines = content.split(/\r?\n/);
  const stack = [];
  const entries = [];
  const triggerMap = new Map([
    ['onspawn', 'on-spawn'],
    ['ondamaged', 'on-damage'],
    ['onattack', 'on-attack'],
    ['ondeath', 'on-death'],
    ['ontimer', 'on-timer'],
    ['onload', 'on-load'],
    ['onshoot', 'on-shoot'],
    ['onhit', 'on-hit'],
    ['oninteract', 'on-interact'],
  ]);
  const skillContainerNames = new Set(['skills', 'skill', 'mechanics', 'mechanic', 'actions', 'action']);

  const getCurrentTrigger = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const trigger = triggerMap.get(stack[i].name);
      if (trigger) return trigger;
    }
    return 'custom';
  };

  const hasSkillContext = () => stack.some((item) => skillContainerNames.has(item.name) || triggerMap.has(item.name));

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = getIndent(line);
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();

    const sectionMatch = trimmed.match(/^([A-Za-z0-9_\-]+):\s*$/);
    if (sectionMatch && !trimmed.startsWith('-')) {
      stack.push({ indent, name: sectionMatch[1].toLowerCase() });
      continue;
    }

    const listMatch = trimmed.match(/^-\s*(.+)$/);
    if (listMatch) {
      const raw = listMatch[1].trim();
      if (!hasSkillContext() && !isLikelySkillLine(raw)) continue;
      entries.push({
        trigger: getCurrentTrigger(),
        raw,
      });
    }
  }

  return entries;
}

function convertMythicSkill(rawSkill) {
  const raw = String(rawSkill || '').trim();
  const base = raw.split(/[({\s]/)[0].toLowerCase();
  const convertedNameMap = {
    damage: 'damage',
    heal: 'heal',
    message: 'message',
    sound: 'sound',
    effect: 'effect',
    potion: 'potion',
    potioneffect: 'potion',
    summon: 'summon',
    teleport: 'teleport',
    command: 'command',
    randomskill: 'random-skill',
    skill: 'skill-chain',
    leap: 'leap',
    lightning: 'lightning',
    throw: 'knockback',
    setstance: 'stance',
    sethealth: 'set-health',
    setfaction: 'faction',
    modelengine: 'model-engine',
    projectile: 'projectile',
    velocity: 'velocity',
    strike: 'strike',
  };

  const params = parseParamBlock(raw);
  const type = convertedNameMap[base] || null;

  if (!type) {
    return {
      supported: false,
      type: 'raw',
      raw,
      params,
      reason: 'Chưa có luật dịch tự động',
    };
  }

  return {
    supported: true,
    type,
    raw,
    params,
  };
}

function groupSkillsByTrigger(skills) {
  const grouped = {};
  for (const entry of skills || []) {
    const trigger = entry.trigger || 'custom';
    if (!grouped[trigger]) grouped[trigger] = [];
    grouped[trigger].push(entry);
  }
  return grouped;
}

function appendSkillYaml(lines, skill, indent) {
  const pad = ' '.repeat(indent);
  lines.push(`${pad}- raw: ${yamlScalar(skill.raw)}`);
  lines.push(`${pad}  type: ${yamlScalar(skill.converted.type)}`);
  lines.push(`${pad}  supported: ${skill.converted.supported ? 'true' : 'false'}`);
  if (skill.converted.reason) lines.push(`${pad}  reason: ${yamlScalar(skill.converted.reason)}`);
  const paramKeys = Object.keys(skill.converted.params || {});
  if (paramKeys.length) {
    lines.push(`${pad}  params:`);
    for (const key of paramKeys) {
      lines.push(`${pad}    ${key}: ${skill.converted.params[key]}`);
    }
  } else {
    lines.push(`${pad}  params: {}`);
  }
}

function parseMobLike(content, sourceName) {
  const mobName = readTextByRegex(
    content,
    [/^\s*display-name:\s*["']?(.+?)["']?\s*$/m, /^\s*name:\s*["']?(.+?)["']?\s*$/m],
    fileBaseName(sourceName),
  );
  const entityType = readTextByRegex(
    content,
    [/^\s*entity-type:\s*([A-Za-z0-9_]+)\s*$/m, /^\s*type:\s*([A-Za-z0-9_]+)\s*$/m],
    'ZOMBIE',
  );
  const dungeon = readTextByRegex(content, [/^\s*dungeon:\s*["']?(.+?)["']?\s*$/m], '');
  const model = readTextByRegex(content, [/^\s*model4-id:\s*["']?(.+?)["']?\s*$/m, /^\s*model:\s*["']?(.+?)["']?\s*$/m], '');
  const levelMin = readTextByRegex(content, [/^\s*level\.min:\s*([0-9]+)\s*$/m], '1');
  const levelMax = readTextByRegex(content, [/^\s*level\.max:\s*([0-9]+)\s*$/m], '100');
  const boss = /(^|\n)\s*boss:\s*true\s*$/m.test(content) || /(^|\n)\s*is-boss:\s*true\s*$/m.test(content);
  const worldBoss = /(^|\n)\s*world-boss:\s*true\s*$/m.test(content);
  const useMythic = /(^|\n)\s*use-mythicmobs:\s*true\s*$/m.test(content);
  const skillEntries = parseMythicSkillEntries(content).map((entry) => ({
    ...entry,
    converted: convertMythicSkill(entry.raw),
  }));

  return {
    id: safeId(sourceName.replace(/\.(yml|yaml)$/i, '')),
    displayName: mobName,
    entityType,
    dungeon,
    model,
    levelMin: Number(levelMin),
    levelMax: Number(levelMax),
    boss,
    worldBoss,
    useMythic,
    skills: skillEntries,
    sourceName,
  };
}

function buildEntityYaml(mob, headerName) {
  const lines = [`# ThicMobKai - ${headerName}`, `${headerName}:`];
  lines.push(`  ${mob.id}:`);
  lines.push(`    display-name: ${yamlScalar(mob.displayName)}`);
  lines.push(`    entity-type: ${mob.entityType}`);
  lines.push(`    dungeon: ${yamlScalar(mob.dungeon || '')}`);
  lines.push(`    model4-id: ${yamlScalar(mob.model || '')}`);
  lines.push(`    level:`);
  lines.push(`      min: ${mob.levelMin}`);
  lines.push(`      max: ${mob.levelMax}`);
  lines.push(`    boss: ${mob.boss ? 'true' : 'false'}`);
  lines.push(`    world-boss: ${mob.worldBoss ? 'true' : 'false'}`);
  lines.push(`    use-mythicmobs: ${mob.useMythic ? 'true' : 'false'}`);
  lines.push(`    skills:`);

  const grouped = groupSkillsByTrigger(mob.skills);
  const triggers = ['on-spawn', 'on-damage', 'on-attack', 'on-death', 'on-timer', 'on-load', 'on-shoot', 'on-hit', 'on-interact', 'custom'];
  for (const trigger of triggers) {
    const entries = grouped[trigger] || [];
    if (!entries.length) {
      lines.push(`      ${trigger}: []`);
      continue;
    }
    lines.push(`      ${trigger}:`);
    for (const skill of entries) appendSkillYaml(lines, skill, 8);
  }

  lines.push('');
  return lines;
}

function buildThicMobYaml(mobs, bosses) {
  const mobLines = buildEntityYaml.bind(null);
  const builtMobs = ['# ThicMobKai - mobs.yml', 'mobs:'];
  for (const mob of mobs) builtMobs.push(...mobLines(mob, 'mobs').slice(2));

  const builtBosses = ['# ThicMobKai - bosses.yml', 'bosses:'];
  for (const mob of bosses) builtBosses.push(...mobLines(mob, 'bosses').slice(2));

  return { mobs: builtMobs.join('\n'), bosses: builtBosses.join('\n') };
}

function buildSkillsYaml(mobs, bosses) {
  const packs = [...mobs, ...bosses];
  const lines = ['# ThicMobKai - skills.yml', 'skill-packs:'];

  for (const mob of packs) {
    lines.push(`  ${mob.id}:`);
    lines.push(`    display-name: ${yamlScalar(mob.displayName)}`);
    lines.push(`    source: ${yamlScalar(mob.useMythic ? 'mythicmobs' : 'native')}`);
    lines.push(`    model4-id: ${yamlScalar(mob.model || '')}`);
    lines.push(`    converted-skills:`);
    const grouped = groupSkillsByTrigger(mob.skills);
    const triggers = ['on-spawn', 'on-damage', 'on-attack', 'on-death', 'on-timer', 'on-load', 'on-shoot', 'on-hit', 'on-interact', 'custom'];
    for (const trigger of triggers) {
      const entries = grouped[trigger] || [];
      if (!entries.length) {
        lines.push(`      ${trigger}: []`);
        continue;
      }
      lines.push(`      ${trigger}:`);
      for (const skill of entries) appendSkillYaml(lines, skill, 8);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildFixNotes(files, mobs, bosses) {
  const notes = [];
  if (!files.length) notes.push('- Chưa có file cấu hình mob nào được nhận diện.');
  if (!mobs.length) notes.push('- Không tìm thấy mob thường theo mẫu MythicMobs.');
  if (!bosses.length) notes.push('- Không tìm thấy boss theo mẫu MythicMobs.');

  for (const mob of [...mobs, ...bosses]) {
    if (!mob.model) notes.push(`- ${mob.sourceName}: chưa thấy model4-id/model; cần gán model để dùng ModelEngine 4.`);
    if (!mob.displayName) notes.push(`- ${mob.sourceName}: chưa có display-name.`);
    if (mob.useMythic && !mob.skills.length) notes.push(`- ${mob.sourceName}: bật use-mythicmobs nhưng không thấy skill list.`);
    const unsupported = (mob.skills || []).filter((skill) => !skill.converted?.supported);
    if (unsupported.length) {
      notes.push(`- ${mob.sourceName}: có ${unsupported.length} skill chưa có luật dịch tự động, tool sẽ giữ raw fallback.`);
    }
  }

  notes.push('- Skill MythicMobs phổ biến sẽ được dịch sang draft ThicMobKai; mechanic quá đặc thù vẫn giữ raw để bạn chỉnh tiếp.');
  return notes.length ? notes.join('\n') : '- Không phát hiện lỗi lớn trong pack.';
}

async function scanPack(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'zip') {
    setReport(`<span class="warn">Bản v1 mới hỗ trợ .zip. File bạn chọn là .${ext || 'unknown'}.</span>`);
    output.value = 'RAR support sẽ được thêm ở bản sau để converter chạy trực tiếp trên pack nén kiểu .rar.';
    exportBtn.disabled = true;
    scanState = null;
    return;
  }

  const { default: JSZip } = await import(ZIP_URL);
  const zip = await JSZip.loadAsync(file);
  const files = [];
  const mobs = [];
  const bosses = [];
  const scanned = [];

  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      if (entry.dir) return;
      const name = normalize(entry.name);
      if (!/\.(yml|yaml|bbmodel|json|txt)$/i.test(name)) return;
      const text = await entry.async('string');
      scanned.push(name);

      if (/mobs?\.yml$/i.test(name) || /bosses?\.yml$/i.test(name) || /mythic.*\.yml$/i.test(name)) {
        const blocks = splitBlocks(text);
        if (blocks.length) {
          for (const block of blocks) {
            const body = block.lines.join('\n');
            const mob = parseMobLike(body, block.id);
            if (block.id.toLowerCase().includes('boss') || /(^|\n)\s*boss:\s*true\s*$/m.test(body)) bosses.push(mob);
            else mobs.push(mob);
          }
        } else {
          const mob = parseMobLike(text, fileBaseName(name));
          if (mob.boss) bosses.push(mob);
          else mobs.push(mob);
        }
        files.push({ name, kind: 'yaml' });
      } else if (/\.bbmodel$/i.test(name)) {
        files.push({ name, kind: 'model' });
      }
    }),
  );

  const generated = buildThicMobYaml(mobs, bosses);
  const skills = buildSkillsYaml(mobs, bosses);
  const fixNotes = buildFixNotes(scanned, mobs, bosses);
  const supportedSkills = [...mobs, ...bosses].reduce((sum, mob) => sum + (mob.skills || []).filter((skill) => skill.converted?.supported).length, 0);
  const unsupportedSkills = [...mobs, ...bosses].reduce((sum, mob) => sum + (mob.skills || []).filter((skill) => !skill.converted?.supported).length, 0);
  const summary = [
    `Đã quét: ${scanned.length} file`,
    `Mob thường nhận diện: ${mobs.length}`,
    `Boss nhận diện: ${bosses.length}`,
    `ModelEngine 4: ${files.filter((item) => item.kind === 'model').length} file`,
    `MythicMobs: ${files.filter((item) => item.kind === 'yaml').length} file`,
    `Skill đã dịch: ${supportedSkills}`,
    `Skill giữ raw fallback: ${unsupportedSkills}`,
  ].join('\n');

  scanState = {
    thicmob: `${generated.mobs}\n\n${generated.bosses}`,
    skills,
    fixes: fixNotes,
    raw: JSON.stringify(
      {
        scanned,
        mobs,
        bosses,
      },
      null,
      2,
    ),
  };

  setReport([`<div class="good">Quét xong.</div>`, `<div class="file-pill">📦 ${file.name}</div>`, `<pre>${summary}</pre>`].join(''));
  renderOutput();
  exportBtn.disabled = false;
}

function renderOutput() {
  if (!scanState) {
    output.value = '';
    return;
  }
  output.value = scanState[currentTab] || '';
}

renderOutput();
