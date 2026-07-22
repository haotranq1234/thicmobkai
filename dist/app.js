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
let splitFileSelect = null;
let splitFilePreview = null;

const ZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const THICMOB_SUPPORTED_TRIGGERS = ['on-spawn', 'on-damage', 'on-attack', 'custom'];
const RAW_BACKUP_DIR = 'compat/mythicmobs';

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((btn) => btn.classList.toggle('active', btn === tab));
    currentTab = tab.dataset.target;
    renderOutput();
    renderSplitPreview();
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

function initSplitControls() {
  splitFileSelect = document.getElementById('split-file-select');
  splitFilePreview = document.getElementById('split-file-preview');
  if (splitFileSelect) {
    splitFileSelect.addEventListener('change', () => renderSplitPreview());
  }
}

exportBtn.addEventListener('click', () => {
  if (!scanState) return;
  if (currentTab === 'split' && scanState.bundleFiles) {
    import(ZIP_URL).then(({ default: JSZip }) => {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(scanState.bundleFiles)) {
        zip.file(path, content);
      }
      return zip.generateAsync({ type: 'blob' });
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thicmobkai-split-pack.zip';
      a.click();
      URL.revokeObjectURL(url);
    });
    return;
  }

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

function renderSplitPreview() {
  if (currentTab !== 'split' || !scanState || !splitFileSelect || !splitFilePreview) return;
  const path = splitFileSelect.value;
  splitFilePreview.value = scanState.bundleFiles?.[path] || '';
}

function normalize(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function fileBaseName(path) {
  const clean = normalize(path);
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

function fileStem(path) {
  return fileBaseName(path).replace(/\.(bbmodel|json|yml|yaml)$/i, '');
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

function findDeepValue(value, keys) {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findDeepValue(item, keys);
      if (nested) return nested;
    }
    return '';
  }
  for (const key of Object.keys(value)) {
    const lowerKey = key.toLowerCase();
    if (keys.includes(lowerKey) && value[key] !== undefined && value[key] !== null) {
      const found = value[key];
      if (typeof found === 'string' && found.trim()) return found.trim();
      if (typeof found === 'number' || typeof found === 'boolean') return String(found);
    }
    const nested = findDeepValue(value[key], keys);
    if (nested) return nested;
  }
  return '';
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

function previewSplitFiles() {
  if (!scanState || !splitFileSelect) return;
  const paths = Object.keys(scanState.bundleFiles || {}).filter((path) => path.endsWith('.yml') || path.endsWith('.yaml'));
  splitFileSelect.innerHTML = paths.map((path) => `<option value="${path}">${path}</option>`).join('');
  if (!splitFileSelect.value && paths.length) splitFileSelect.value = paths[0];
  renderSplitPreview();
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
    spin: 'spin',
    animation: 'animation',
    particle: 'particle',
    particles: 'particle',
    dash: 'dash',
    lunge: 'dash',
    shield: 'shield',
    aura: 'aura',
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

function parseModelAsset(content, sourceName) {
  const ext = fileBaseName(sourceName).split('.').pop()?.toLowerCase();
  const stem = fileStem(sourceName);
  let modelId = '';
  let modelName = '';
  let modelType = 'unknown';

  if (ext === 'bbmodel' || ext === 'json') {
    try {
      const json = JSON.parse(content);
      modelId = findDeepValue(json, ['identifier', 'modelid', 'model_id', 'model', 'id', 'name']);
      modelName = findDeepValue(json, ['displayname', 'display_name', 'title', 'name']);
      const typeHint = findDeepValue(json, ['type', 'modeltype']);
      if (typeHint) modelType = typeHint;
    } catch {
      modelId = readTextByRegex(content, [
        /"identifier"\s*:\s*"([^"]+)"/i,
        /"model_id"\s*:\s*"([^"]+)"/i,
        /"modelId"\s*:\s*"([^"]+)"/i,
        /"name"\s*:\s*"([^"]+)"/i,
      ], '');
    }
  } else {
    modelId = readTextByRegex(content, [
      /^\s*identifier:\s*["']?(.+?)["']?\s*$/m,
      /^\s*model-id:\s*["']?(.+?)["']?\s*$/m,
      /^\s*model_id:\s*["']?(.+?)["']?\s*$/m,
      /^\s*id:\s*["']?(.+?)["']?\s*$/m,
      /^\s*name:\s*["']?(.+?)["']?\s*$/m,
    ], '');
    modelName = readTextByRegex(content, [/^\s*display-name:\s*["']?(.+?)["']?\s*$/m], '');
  }

  const normalizedId = (modelId || modelName || stem || '').trim();
  return {
    sourceName,
    stem: stem.toLowerCase(),
    modelId: normalizedId,
    displayName: modelName || normalizedId,
    type: modelType,
  };
}

function inferModelId(mob, modelCatalog) {
  const candidates = [
    mob.model,
    mob.id,
    fileStem(mob.sourceName),
    mob.displayName,
    fileBaseName(mob.sourceName),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/\.(bbmodel|json|yml|yaml)$/i, ''));

  for (const candidate of candidates) {
    const found = modelCatalog.find((entry) => {
      const entryId = String(entry.modelId || '').toLowerCase();
      const entryStem = String(entry.stem || '').toLowerCase();
      return candidate === entryId || candidate === entryStem || entryId === candidate || entryStem === candidate;
    });
    if (found) return found.modelId || found.stem || mob.model || '';
  }

  if (!mob.model && modelCatalog.length === 1) {
    return modelCatalog[0].modelId || modelCatalog[0].stem || '';
  }

  return mob.model || '';
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

function orderedTriggers(grouped) {
  const seen = new Set();
  const ordered = [];
  for (const trigger of THICMOB_SUPPORTED_TRIGGERS) {
    if (grouped[trigger]) {
      ordered.push(trigger);
      seen.add(trigger);
    }
  }
  for (const trigger of Object.keys(grouped || {})) {
    if (!seen.has(trigger)) ordered.push(trigger);
  }
  return ordered;
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
  const triggers = orderedTriggers(grouped);
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

function buildRawMythicBackup(mobs, bosses) {
  const lines = ['# MythicMobs raw backup', 'raw-packs:'];
  for (const mob of [...mobs, ...bosses]) {
    lines.push(`  ${mob.id}:`);
    lines.push(`    source-name: ${yamlScalar(mob.sourceName)}`);
    lines.push(`    display-name: ${yamlScalar(mob.displayName)}`);
    lines.push(`    model4-id: ${yamlScalar(mob.model || '')}`);
    lines.push(`    kept-triggers:`);
    const grouped = groupSkillsByTrigger(mob.skills);
    for (const [trigger, entries] of Object.entries(grouped)) {
      lines.push(`      ${trigger}:`);
      for (const entry of entries) {
        lines.push(`        - ${yamlScalar(entry.raw)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildSplitFiles(mobs, bosses) {
  const files = {};
  files['mobs/mobs.yml'] = buildThicMobYaml(mobs, []).mobs;
  files['bosses/bosses.yml'] = buildThicMobYaml([], bosses).bosses;
  files[`${RAW_BACKUP_DIR}/mythicmobs-raw.yml`] = buildRawMythicBackup(mobs, bosses);

  for (const mob of mobs) {
    files[`mobs/${mob.id}.yml`] = buildEntityYaml(mob, 'mobs').join('\n');
  }
  for (const boss of bosses) {
    files[`bosses/${boss.id}.yml`] = buildEntityYaml(boss, 'bosses').join('\n');
  }

  return files;
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
    const triggers = orderedTriggers(grouped);
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

  notes.push('- Skill MythicMobs được giữ nguyên trong lớp raw backup và đồng thời sinh layer ThicMobKai để hai bên không giẫm nhau.');
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
  const modelCatalog = [];
  const originalFiles = [];

  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      if (entry.dir) return;
      const name = normalize(entry.name);
      const bytes = await entry.async('uint8array');
      originalFiles.push({ path: name, data: bytes });
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
      } else if (/\.bbmodel$/i.test(name) || /model.*\.(json|yml|yaml)$/i.test(name)) {
        files.push({ name, kind: 'model' });
        modelCatalog.push(parseModelAsset(text, name));
      }
    }),
  );

  for (const mob of [...mobs, ...bosses]) {
    mob.model = inferModelId(mob, modelCatalog);
  }

  const generated = buildThicMobYaml(mobs, bosses);
  const skills = buildSkillsYaml(mobs, bosses);
  const fixNotes = buildFixNotes(scanned, mobs, bosses);
  const supportedSkills = [...mobs, ...bosses].reduce((sum, mob) => sum + (mob.skills || []).filter((skill) => skill.converted?.supported).length, 0);
  const unsupportedSkills = [...mobs, ...bosses].reduce((sum, mob) => sum + (mob.skills || []).filter((skill) => !skill.converted?.supported).length, 0);
  const droppedTriggers = [...mobs, ...bosses].reduce((sum, mob) => sum + (mob.skills || []).filter((skill) => !THICMOB_SUPPORTED_TRIGGERS.includes(skill.trigger)).length, 0);
  const modelIds = [...new Set(modelCatalog.map((item) => item.modelId).filter(Boolean))];
  const summary = [
    `Đã quét: ${scanned.length} file`,
    `Mob thường nhận diện: ${mobs.length}`,
    `Boss nhận diện: ${bosses.length}`,
    `ModelEngine 4: ${files.filter((item) => item.kind === 'model').length} file`,
    `MythicMobs: ${files.filter((item) => item.kind === 'yaml').length} file`,
    `Model ID tự nhận: ${modelIds.length}`,
    `Skill đã dịch: ${supportedSkills}`,
    `Skill giữ raw fallback: ${unsupportedSkills}`,
    `Skill bị bỏ do trigger chưa hỗ trợ: ${droppedTriggers}`,
  ].join('\n');

  const splitFiles = buildSplitFiles(mobs, bosses);
  const splitManifest = [
    '# ThicMobKai - split files',
    '',
    `# Mob files: ${mobs.length}`,
    `# Boss files: ${bosses.length}`,
    `# Raw backup: ${RAW_BACKUP_DIR}/mythicmobs-raw.yml`,
    `# Original pack mirrored: ${originalFiles.length} files`,
    '',
    ...Object.keys(splitFiles).sort().map((path) => `- ${path}`),
  ].join('\n');

  scanState = {
    thicmob: `${generated.mobs}\n\n${generated.bosses}`,
    skills,
    split: splitManifest,
    fixes: fixNotes,
    raw: JSON.stringify(
      {
        scanned,
        mobs,
        bosses,
        modelCatalog,
      },
      null,
      2,
    ),
    bundleFiles: {
      ...Object.fromEntries(originalFiles.map((item) => [`original-pack/${item.path}`, item.data])),
      'mobs/mobs.yml': generated.mobs,
      'bosses/bosses.yml': generated.bosses,
      ...splitFiles,
      'skills/skills.yml': skills,
      'manifest.txt': splitManifest,
    },
  };

  setReport([`<div class="good">Quét xong.</div>`, `<div class="file-pill">📦 ${file.name}</div>`, `<pre>${summary}</pre>`].join(''));
  renderOutput();
  exportBtn.disabled = false;
  previewSplitFiles();
}

function renderOutput() {
  if (!scanState) {
    output.value = '';
    return;
  }
  output.value = scanState[currentTab] || '';
}

renderOutput();
initSplitControls();
