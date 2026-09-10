import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
if (!process.argv[2]) throw new Error('Uso: node tools/verify_workspace_dom.mjs /caminho/happy-dom/lib/index.js');
const { Window } = await import(pathToFileURL(resolve(process.argv[2])).href);
import { normalizeUiConfiguration } from '../packages/ui-config/src/index.js';
import { WorkspaceShell, FloatingPanelManager, composeToolbar, UiActionRegistry } from '../packages/ui-widgets/src/index.js';

const html = await fs.readFile(new URL('../apps/web/index.html', import.meta.url), 'utf8');
const config = normalizeUiConfiguration(JSON.parse(await fs.readFile(new URL('../apps/web/config/ui.default.json', import.meta.url), 'utf8')));
const checks = [];
for (const [width, height] of [[1440, 900], [390, 900], [360, 640], [844, 390]]) {
  const compact = width <= 760 || height <= 500;
  const win = new Window({ url: 'http://localhost/', width, height,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const doc = win.document;
  for (const key of ['window', 'document', 'localStorage', 'ResizeObserver', 'CustomEvent']) globalThis[key] = key === 'window' ? win : win[key];
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  doc.write(html);
  for (const name of ['workspace.css', 'style.css']) {
    const style = doc.createElement('style');
    style.textContent = await fs.readFile(new URL('../apps/web/'+name, import.meta.url), 'utf8');
    doc.head.append(style);
    // Happy DOM incorrectly treats comma-separated media queries as AND.
    // Expand the equivalent OR rules in this fixture, keeping production CSS intact.
    const sheet = style.sheet;
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const rule = sheet.cssRules[i];
      if (!rule.media?.mediaText.includes(',')) continue;
      const queries = rule.media.mediaText.split(',');
      const body = [...rule.cssRules].map(item => item.cssText).join('\n');
      sheet.deleteRule(i);
      for (const query of queries) sheet.insertRule(`@media ${query} { ${body} }`, i);
    }
  }
  const $ = id => doc.getElementById(id);
  const ids = [...doc.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs duplicados na entrada HTML');
  const originalControls = [...doc.querySelectorAll('#toolbar button, #toolbar select, .edit-hud-strip button, .edit-hud-strip label')];
  win.localStorage.setItem(config.toolbar.storageKey, JSON.stringify({ layout: 'horizontal', left: 111, workspace: { section: 'removed' } }));
  win.localStorage.setItem('spatialseed.edit.hud.v1', JSON.stringify({ dock: 'floating', left: 83, top: 65, groups: { snap: false } }));
  const toolbar = composeToolbar({ root: doc, configuration: config.toolbar });
  const panels = new FloatingPanelManager({ root: doc, storageKey: config.panels.storageKey });
  for (const [id, defaultLayout] of Object.entries(config.panels.items)) panels.register('#'+id, { defaultLayout });
  const visibility = [];
  const shell = new WorkspaceShell({ root: doc, configuration: config, panelManager: panels, storage: win.localStorage,
    onPanelVisibility: (id, visible) => visibility.push({ id, visible }) });
  assert.equal(doc.documentElement.dataset.workspace, 'guided');
  assert.equal(shell.section, 'select');
  assert.equal(shell.collapsed, compact);
  assert.ok($('selection-panel').hidden);
  assert.ok(originalControls.every(control => control.isConnected), 'Controle foi removido na composição');
  const section = id => doc.querySelector(`[data-workspace-section="${id}"]`);
  assert.ok(section('transform').hidden);
  shell.update({ selection: { members: [{ objectId: 'one' }] }, editor: { tool: { mode: 'translate' }, pivot: { policy: 'active' } }, frame: 'local' });
  assert.equal(shell.section, 'transform');
  assert.match($('workspace-context').textContent, /Mover · Objeto/);
  assert.equal(doc.querySelector('[data-edit-hud-group="frame"]').dataset.workspaceHidden, 'false');
  assert.equal(doc.querySelector('[data-edit-hud-group="creation"]').dataset.workspaceHidden, 'true');
  assert.equal(win.getComputedStyle(doc.querySelector('[data-edit-hud-group="creation"]')).display, 'none', 'CSS expõe grupo de outra seção');
  assert.equal(win.getComputedStyle(doc.querySelector('[data-edit-hud-group="frame"]')).display, 'grid', 'CSS legado venceu o layout guiado');
  shell.update({ selection: { members: [] } });
  assert.equal(shell.section, 'select');
  assert.ok($('inspector-panel').hidden, 'Seleção abriu Inspector');
  panels.show('#inspector-panel');
  panels.show('#geometry-create-panel');
  assert.equal($('inspector-panel').hidden, compact, 'Exclusividade mobile ou múltiplos painéis desktop quebrados');
  if (compact) assert.ok(visibility.some(event => event.id === 'inspector-panel' && event.visible === false));
  for (const id of Object.keys(config.panels.items)) {
    const panel = $(id);
    panels.show(panel);
    panels.hide(panel);
    assert.equal(win.getComputedStyle(panel).display, 'none', `Painel fechado ainda renderiza: ${id}`);
  }
  panels.show('#inspector-panel');
  panels.show('#geometry-create-panel');
  $('workspace-hud-compact').click();
  assert.equal(shell.mode, 'free');
  assert.equal($('edit-hud-size').value, 'compact');
  assert.equal(doc.querySelectorAll('.ss-floating-panel:not([hidden])').length, 0, 'Atalho HUD deixou painel aberto');
  assert.equal($('workspace-hud-compact').parentElement.id, 'toolbar', 'HUD compacto ficou preso em um menu');
  panels.show('#inspector-panel');
  panels.show('#geometry-create-panel');
  assert.equal($('inspector-panel').hidden, compact, 'HUD livre perdeu exclusividade no telefone');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.ok($('geometry-create-panel').hidden, 'Escape não fechou painel');
  if (compact) {
    shell.setMode('guided');
    panels.show('#mesh-edit-panel');
    const panel = $('mesh-edit-panel');
    panel.style.left = '12px'; panel.style.top = '180px';
    const css = win.getComputedStyle(panel);
    assert.equal(css.left, '12px', 'CSS bloqueou posição horizontal de arraste');
    assert.equal(css.top, '180px', 'CSS bloqueou posição vertical de arraste');
    assert.equal(css.display, 'block', `Painel móvel voltou a comprimir o conteúdo em flex em ${width}x${height}`);
    assert.equal(win.getComputedStyle(panel.querySelector('.mesh-edit-content')).overflow, 'visible', 'Conteúdo ficou em uma segunda área de rolagem');
    assert.notEqual(win.getComputedStyle($('edit-hud')).visibility, 'hidden', 'Painel escondeu o HUD');
    assert.equal(win.getComputedStyle(panel.querySelector('header')).flexShrink, '0', 'Cabeçalho pode ser comprimido');
    assert.ok(Number(win.getComputedStyle($('toolbar')).zIndex) > 1000, 'Barra de acesso ficou sob painel maximizado');
    panels.hideAll();
  }
  shell.selectSection('draw');
  shell.setMode('free');
  assert.equal(JSON.parse(win.localStorage.getItem(config.toolbar.storageKey)).left, 111, 'Posição da barra perdida');
  assert.equal(JSON.parse(win.localStorage.getItem('spatialseed.edit.hud.v1')).left, 83, 'Preferências HUD perdidas');
  shell.setMode('guided');
  shell.update({ selection: { members: [{objectId:'one'}] }, mesh: { active: true, frameMode:'local' }, editor:{tool:{mode:'select'}} });
  shell.update({ selection: { members: [{objectId:'one'}] }, mesh: { active: true, frameMode:'local' }, editor:{tool:{mode:'translate'}} });
  assert.equal(shell.section, 'mesh', 'Troca de ferramenta abandonou sessão de malha');
  const actions = new UiActionRegistry({ root: doc, configuration: config.shortcuts, storage: win.localStorage });
  let undoCount = 0;
  actions.register('history.undo', () => undoCount++);
  actions.bindControl($('undo'), 'history.undo');
  $('undo').disabled = false;
  $('undo').click();
  assert.equal(undoCount, 1, 'Botão duplicou a execução');
  const field = $('console-input');
  field.focus();
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(undoCount, 1, 'Atalho de cena capturou edição textual');
  const menus = [...doc.querySelectorAll('.ss-toolbar-menu')];
  menus[0].open = true;
  menus[0].dispatchEvent(new win.Event('toggle'));
  doc.body.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
  assert.ok(menus.every(menu => !menu.open), 'Menu não fecha com clique externo');
  menus[1].open = true;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.ok(!menus[1].open, 'Escape não fecha menu');
  assert.equal(doc.activeElement, menus[1].querySelector('summary'));
  shell.dispose(); actions.dispose(); panels.dispose(); toolbar.dispose();
  await win.happyDOM.close();
  checks.push({ width, height, ok: true, controlCount: originalControls.length });
}
console.log(JSON.stringify({ scope: 'workspace-dom-integration', ok: true, checks }, null, 2));
