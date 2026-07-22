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
const YAML_URL = 'https://cdn.jsdelivr.net/npm/yaml@2.5.1/+esm';

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
  if (file) {
    setFile(file);
  }
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

function parseMobLike(content, sourceName) {
  const mobName = readTextByRegex(content, [/^\s*display-name:\s*["']?(.+?)["']?\s*$/m, /^\s*name:\s*["']?(.+?)["']?\s*$/m], fileBaseName(sourceName));
  const entityType = readTextByRegex(content, [/^\s*entity-type:\s*([A-Za-z0-9_]+)\s*$/m, /^\s*type:\s*([A-Za-z0-9_]+)\s*$/m], 'ZOMBIE');
  const dungeon = readTextByRegex(content, [/^\s*dungeon:\s*["']?(.+?)["']?\s*$/m], '');
  const model = readTextByRegex(content, [/^\s*model4-id:\s*["']?(.+?)["']?\s*$/m, /^\s*model:\s*["']?(.+?)["']?\s*$/m], '');
  const levelMin = readTextByRegex(content, [/^\s*level\.min:\s*([0-9]+)\s*$/m], '1');
  const levelMax = readTextByRegex(content, [/^\s*level\.max:\s*([0-9]+)\s*$/m], '100');
  const boss = /(^|\n)\s*boss:\s*true\s*$/m.test(content) || /(^|\n)\s*is-boss:\s*true\s*$/m.test(content);
  const worldBoss = /(^|\n)\s*world-boss:\s*true\s*$/m.test(content);
  const useMythic = /(^|\n)\s*use-mythicmobs:\s*true\s*$/m.test(content);

  const spawnSkills = [...content.matchAll(/^\s*-\s*([A-Za-z0-9_\-:]+)\s*$/gm)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith('material') && !s.startsWith('chance'));

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
    skills: spawnSkills.slice(0, 8),
    sourceName,
  };
}

function buildThicMobYaml(mobs, bosses) {
  const mobLines = ['# ThicMobKai - mobs.yml', 'mobs:'];
  for (const mob of mobs) {
    mobLines.push(`  ${mob.id}:`);
    mobLines.push(`    display-name: "${mob.displayName}"`);
    mobLines.push(`    entity-type: ${mob.entityType}`);
    mobLines.push(`    dungeon: "${mob.dungeon || ''}"`);
    mobLines.push(`    model4-id: "${mob.model || ''}"`);
    mobLines.push(`    level:`);
    mobLines.push(`      min: ${mob.levelMin}`);
    mobLines.push(`      max: ${mob.levelMax}`);
    mobLines.push(`    boss: ${mob.boss ? 'true' : 'false'}`);
    mobLines.push(`    world-boss: ${mob.worldBoss ? 'true' : 'false'}`);
    mobLines.push(`    use-mythicmobs: ${mob.useMythic ? 'true' : 'false'}`);
    mobLines.push(`    skills:`);
    mobLines.push(`      on-spawn: [${mob.skills.join(', ')}]`);
    mobLines.push(`      on-damage: []`);
    mobLines.push(`      on-death: []`);
    mobLines.push('');
  }

  const bossLines = ['# ThicMobKai - bosses.yml', 'bosses:'];
  for (const mob of bosses) {
    bossLines.push(`  ${mob.id}:`);
    bossLines.push(`    display-name: "${mob.displayName}"`);
    bossLines.push(`    entity-type: ${mob.entityType}`);
    bossLines.push(`    dungeon: "${mob.dungeon || ''}"`);
    bossLines.push(`    model4-id: "${mob.model || ''}"`);
    bossLines.push(`    level:`);
    bossLines.push(`      min: ${mob.levelMin}`);
    bossLines.push(`      max: ${mob.levelMax}`);
    bossLines.push(`    boss: true`);
    bossLines.push(`    world-boss: ${mob.worldBoss ? 'true' : 'false'}`);
    bossLines.push(`    use-mythicmobs: ${mob.useMythic ? 'true' : 'false'}`);
    bossLines.push(`    skills:`);
    bossLines.push(`      on-spawn: [${mob.skills.join(', ')}]`);
    bossLines.push(`      on-damage: []`);
    bossLines.push(`      on-death: []`);
    bossLines.push('');
  }

  return { mobs: mobLines.join('\n'), bosses: bossLines.join('\n') };
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
  }
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

  const [{ default: JSZip }, { parse }] = await Promise.all([import(ZIP_URL), import(YAML_URL)]);
  const zip = await JSZip.loadAsync(file);
  const files = [];
  const mobs = [];
  const bosses = [];
  const scanned = [];

  await Promise.all(Object.values(zip.files).map(async (entry) => {
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
  }));

  const generated = buildThicMobYaml(mobs, bosses);
  const fixNotes = buildFixNotes(scanned, mobs, bosses);
  const summary = [
    `Đã quét: ${scanned.length} file`,
    `Mob thường nhận diện: ${mobs.length}`,
    `Boss nhận diện: ${bosses.length}`,
    `ModelEngine 4: ${files.filter((item) => item.kind === 'model').length} file`,
    `MythicMobs: ${files.filter((item) => item.kind === 'yaml').length} file`,
  ].join('\n');

  scanState = {
    thicmob: `${generated.mobs}\n\n${generated.bosses}`,
    fixes: fixNotes,
    raw: JSON.stringify({
      scanned,
      mobs,
      bosses,
    }, null, 2),
  };

  setReport([
    `<div class="good">Quét xong.</div>`,
    `<div class="file-pill">📦 ${file.name}</div>`,
    `<pre>${summary}</pre>`,
  ].join(''));
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
