#!/usr/bin/env node
/**
 * receta_completa.js — misrx.com.ar prescription automation v2
 *
 * Flujo:
 *  1. First-run setup: crea .env con credenciales del médico
 *  2. Solicita datos del paciente interactivamente
 *  3. Automatiza la prescripción en misrx.com.ar
 *  4. Screenshot preview antes de confirmar
 *  5. Opciones de compartir tras emitir
 *
 * Uso:
 *   node receta_completa.js               # flujo normal
 *   node receta_completa.js --setup       # reconfigurar credenciales
 */

const { chromium } = require('@playwright/test');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '.env');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// ─── Env helpers ──────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  return Object.fromEntries(
    fs.readFileSync(ENV_PATH, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#'))
      .map(l => {
        const i = l.indexOf('=');
        if (i === -1) return null;
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
      .filter(Boolean)
  );
}

function saveEnv(dni, password) {
  const content = [
    '# misrx credenciales del médico — NO compartir ni subir a git',
    `MISRX_DNI=${dni}`,
    `MISRX_PASSWORD=${password}`,
    '',
  ].join('\n');
  fs.writeFileSync(ENV_PATH, content, { mode: 0o600 });
  console.log(`\n✅ Credenciales guardadas en ${ENV_PATH} (permisos 600)\n`);

  // Agregar al .gitignore si existe o crear uno
  const gitignorePath = path.join(__dirname, '.gitignore');
  const needed = ['.env', 'screenshots/', 'node_modules/'];
  let existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';
  const toAdd = needed.filter(e => !existing.includes(e));
  if (toAdd.length) {
    fs.appendFileSync(gitignorePath, '\n' + toAdd.join('\n') + '\n');
  }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

/** Lee contraseña ocultando caracteres con asteriscos */
function askPassword(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      let input = '';
      const handler = (buf) => {
        const ch = buf.toString();
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(input);
        } else if (ch === '\u0003') {
          process.exit();
        } else if (ch === '\u007f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += ch;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', handler);
    } else {
      // No TTY (pipe) — leer igualmente
      const rl = createRl();
      rl.question('', ans => { rl.close(); resolve(ans.trim()); });
    }
  });
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

async function runSetup() {
  const rl = createRl();
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   MISRX — Configuración inicial      ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log('Ingresá tus credenciales de médico para misrx.com.ar.');
  console.log('Se guardarán localmente en .env con permisos 600.\n');

  const dni = (await ask(rl, 'DNI del médico: ')).trim();
  rl.close();
  const password = await askPassword('Contraseña (se oculta al escribir): ');

  if (!dni || !password) {
    console.error('\n❌ DNI y contraseña son requeridos.');
    process.exit(1);
  }

  saveEnv(dni, password);
}

// ─── Recolección de datos del paciente ───────────────────────────────────────

async function collectPatientData() {
  const rl = createRl();
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Datos de la Receta                 ║');
  console.log('╚══════════════════════════════════════╝\n');

  const dniPaciente = (await ask(rl, 'DNI del paciente: ')).trim();

  let sexo = '';
  while (!['M', 'F', 'X'].includes(sexo)) {
    sexo = ((await ask(rl, 'Sexo del paciente [M/F/X]: ')).trim()).toUpperCase();
    if (!['M', 'F', 'X'].includes(sexo)) console.log('  → Ingresá M, F o X');
  }

  console.log('\nObra social:');
  const obraSocial = (await ask(rl, '  Texto de búsqueda (ej: "particular", "osde"): ')).trim();
  const obraSocialItem = (await ask(rl, '  Nombre exacto en lista (ej: "Paciente Particular"): ')).trim();

  console.log('\nMedicamento:');
  const diagnostico = (await ask(rl, '  Diagnóstico: ')).trim();
  const medicamentoQuery = (await ask(rl, '  Buscar medicamento (ej: "paracetamol"): ')).trim();
  console.log('  (Si no sabés el texto exacto de la lista, dejá vacío — se mostrará un picker interactivo)');
  const medicamentoHint = (await ask(rl, '  Filtro opcional (ej: "500 mg", "comp.x 20"): ')).trim();

  rl.close();

  return { dniPaciente, sexo, obraSocial, obraSocialItem, diagnostico, medicamentoQuery, medicamentoHint };
}

// ─── Preview con screenshot ───────────────────────────────────────────────────

async function previewAndConfirm(page, screenshotPath) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   PREVIEW — Revisá antes de emitir   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n📸 Screenshot guardado en:\n   ${screenshotPath}\n`);

  try {
    execSync(`xdg-open "${screenshotPath}" 2>/dev/null &`, { stdio: 'ignore' });
  } catch (_) {
    // xdg-open no disponible — continuar igualmente
  }

  const rl = createRl();
  const answer = (await ask(rl, '¿Los datos son correctos? Confirmar y emitir receta [s/N]: ')).trim().toLowerCase();
  rl.close();

  return answer === 's';
}

// ─── Compartir ────────────────────────────────────────────────────────────────

function tryOpen(url) {
  try { execSync(`xdg-open "${url}" 2>/dev/null &`, { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

function copyToClipboard(text) {
  try { execSync(`printf '%s' "${text}" | xclip -selection clipboard 2>/dev/null`); return true; }
  catch (_) {}
  try { execSync(`printf '%s' "${text}" | xsel --clipboard --input 2>/dev/null`); return true; }
  catch (_) { return false; }
}

async function shareMenu(recetaUrl, nroReceta) {
  const waUrl = `https://wa.me/?text=${encodeURIComponent('Receta electrónica: ' + recetaUrl)}`;
  const mailtoUrl = `mailto:?subject=Receta%20electr%C3%B3nica&body=${encodeURIComponent('Tu receta: ' + recetaUrl)}`;

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Receta emitida exitosamente ✅      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n  Nro. Recetario : ${nroReceta}`);
  console.log(`  URL de receta  : ${recetaUrl}\n`);

  console.log('Opciones para compartir:');
  console.log('  [1] Abrir en navegador');
  console.log('  [2] Copiar URL al portapapeles');
  console.log('  [3] Compartir por WhatsApp');
  console.log('  [4] Compartir por Email');
  console.log('  [5] Instrucciones para imprimir');
  console.log('  [0] Salir\n');

  const rl = createRl();
  let running = true;

  while (running) {
    const choice = (await ask(rl, 'Elegí una opción [0-5]: ')).trim();
    switch (choice) {
      case '1':
        if (!tryOpen(recetaUrl)) console.log(`  → Abrí manualmente: ${recetaUrl}`);
        else console.log('  → Abriendo en navegador...');
        break;
      case '2':
        if (copyToClipboard(recetaUrl)) console.log('  ✅ URL copiada al portapapeles');
        else console.log(`  → Copiá manualmente: ${recetaUrl}`);
        break;
      case '3':
        if (!tryOpen(waUrl)) console.log(`  → Abrí: ${waUrl}`);
        else console.log('  → Abriendo WhatsApp Web...');
        break;
      case '4':
        if (!tryOpen(mailtoUrl)) console.log(`  → Abrí tu cliente de correo y pegá: ${recetaUrl}`);
        else console.log('  → Abriendo cliente de correo...');
        break;
      case '5':
        console.log(`  → Abrí ${recetaUrl} en el navegador y usá Ctrl+P para imprimir.`);
        break;
      case '0':
        running = false;
        break;
      default:
        console.log('  → Opción no válida. Ingresá un número del 0 al 5.');
        continue;
    }
    if (running) {
      const again = (await ask(rl, '\n¿Otra opción? [s/N]: ')).trim().toLowerCase();
      running = again === 's';
    }
  }

  rl.close();
}

// ─── Selector interactivo de ítems en modal ionic-selectable ─────────────────

async function selectItemFromModal(page, hint, screenshotDir) {
  // ion-item con contenido real (con radio/checkbox) — excluye headers de grupo
  const itemsLoc = page.locator('ion-item:has(ion-radio), ion-item:has(ion-checkbox), ion-item:has(.item-inner)');
  const count = await itemsLoc.count();

  const candidates = [];
  for (let i = 0; i < count; i++) {
    const item = itemsLoc.nth(i);
    if (!await item.isVisible().catch(() => false)) continue;
    const txt = (await item.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    if (txt.length < 4) continue; // saltar ítems vacíos o headers muy cortos
    candidates.push({ txt, item });
  }

  if (candidates.length === 0) throw new Error('No se encontraron ítems en el modal de búsqueda');

  // Intentar match automático si hay hint
  if (hint) {
    const hintLower = hint.toLowerCase();
    const match = candidates.find(c => c.txt.toLowerCase().includes(hintLower));
    if (match) {
      await match.item.click();
      console.log(`   ✓ Medicamento auto-seleccionado: ${match.txt}`);
      return;
    }
    console.log(`   ⚠️  Hint "${hint}" no encontró match exacto — mostrando opciones`);
  }

  // Sin match → screenshot + picker interactivo
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ss = path.join(screenshotDir, `picker_medicamento_${ts}.png`);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: ss });
  try { execSync(`xdg-open "${ss}" 2>/dev/null &`, { stdio: 'ignore' }); } catch (_) {}

  const shown = candidates.slice(0, 12);
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  Resultados de búsqueda (elegí un nro.) │');
  console.log('└─────────────────────────────────────────┘');
  shown.forEach((c, n) => console.log(`  [${n + 1}] ${c.txt}`));
  if (candidates.length > 12) console.log(`  ... y ${candidates.length - 12} más (scrolleá el browser)`);
  console.log(`\n📸 Ver screenshot: ${ss}`);

  const rl = createRl();
  let selected = null;
  while (!selected) {
    const pick = (await ask(rl, `\nElegí [1-${shown.length}]: `)).trim();
    const n = parseInt(pick, 10);
    if (n >= 1 && n <= shown.length) {
      selected = shown[n - 1];
    } else {
      console.log(`  → Ingresá un número entre 1 y ${shown.length}`);
    }
  }
  rl.close();

  await selected.item.click();
  console.log(`   ✓ Medicamento seleccionado: ${selected.txt}`);
}

// ─── Cerrar side menu de Ionic ────────────────────────────────────────────────

async function closeSideMenu(page) {
  try {
    // Ionic pone ion-backdrop cuando el menú lateral está abierto
    const backdrop = page.locator('ion-backdrop').first();
    if (await backdrop.isVisible({ timeout: 800 })) {
      await backdrop.click({ force: true });
      await page.waitForTimeout(600);
      console.log('   (menú lateral cerrado)');
    }
  } catch (_) {}
}

// ─── Automatización ───────────────────────────────────────────────────────────

async function runAutomation(creds, patient) {
  const { DNI_MEDICO, PASSWORD } = creds;
  const { dniPaciente, sexo, obraSocial, obraSocialItem, diagnostico, medicamentoQuery, medicamentoHint } = patient;

  const browser = await chromium.launch({ headless: false, slowMo: 700 });
  const page = await browser.newPage();

  try {
    // PASO 1: Login
    console.log('\n→ PASO 1: Login');
    await page.goto('https://misrx.com.ar/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('input', { timeout: 15000 });
    await page.fill('#ion-input-0', DNI_MEDICO);
    await page.fill('#ion-input-1', PASSWORD);
    await page.click('ion-button');
    await page.waitForURL('**/home', { timeout: 10000 });
    console.log('   ✓ Login OK');

    // PASO 2: Nueva prescripción
    console.log('→ PASO 2: Nueva prescripción');
    // Usar selector más preciso para evitar tocar el hamburger/menu
    await page.locator('ion-button:has-text("NUEVA"), button:has-text("NUEVA")').first().click();
    await page.waitForTimeout(3000);
    await closeSideMenu(page);

    // PASO 3: Obra social
    console.log('→ PASO 3: Obra social');
    await page.locator('ionic-selectable').first().click();
    await page.waitForTimeout(2000);
    await page.locator('ion-searchbar').first().click();
    await page.keyboard.type(obraSocial);
    await page.waitForTimeout(1500);
    await page.locator(`ion-item:has-text("${obraSocialItem}")`).first().click();
    await page.waitForTimeout(2000);
    // Cerrar cualquier backdrop/menú que haya quedado abierto
    await closeSideMenu(page);
    await page.waitForTimeout(500);
    console.log(`   ✓ Obra social: ${obraSocialItem}`);

    // PASO 4: Datos del paciente
    console.log('→ PASO 4: Datos del paciente');
    await page.fill('#ion-input-2', dniPaciente);
    await page.waitForTimeout(500);
    await page.locator('ion-select').first().click();
    await page.waitForSelector('ion-popover', { timeout: 10000 });
    await page.waitForTimeout(500);
    const sexoRegex = new RegExp(`^${sexo}$`);
    await page.locator('ion-popover ion-item').filter({ hasText: sexoRegex }).first().click();
    await page.waitForTimeout(2000);
    // Esperar que el popover se cierre y cerrar side menu si quedó abierto
    await page.waitForSelector('ion-popover', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await closeSideMenu(page);
    await page.waitForTimeout(500);
    console.log(`   ✓ DNI: ${dniPaciente}, Sexo: ${sexo}`);

    // PASO 5: Validar paciente
    console.log('→ PASO 5: Validar paciente');
    // Buscar el botón BUSCAR entre todos los ion-button visibles (no confiar solo en texto)
    const buscaBtn = page.locator('ion-button').filter({ hasText: /buscar/i });
    try {
      await buscaBtn.first().waitFor({ state: 'visible', timeout: 10000 });
    } catch (_) {
      throw new Error(
        'Botón BUSCAR no apareció. Si la obra social requiere número de afiliado (ej. OSDE), completalo antes.'
      );
    }
    await buscaBtn.first().click();
    await page.waitForTimeout(4000);

    // PASO 6: Medicamentos
    console.log('→ PASO 6: Ir a Medicamentos');
    const medBtn = page.locator('ion-button').filter({ hasText: /medicamentos/i });
    await medBtn.first().waitFor({ state: 'visible', timeout: 10000 });
    await medBtn.first().click();
    await page.waitForURL('**/medico-prescripcion-productos', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // PASO 7: Diagnóstico y medicamento
    console.log('→ PASO 7: Diagnóstico y medicamento');
    try {
      await page.waitForSelector('#ion-input-7:not([readonly])', { timeout: 3000 });
      await page.fill('#ion-input-7', diagnostico);
    } catch (_) {
      await page.locator('ion-input[placeholder*="diagnóstico"], ion-input[placeholder*="diagnostico"]')
        .first().fill(diagnostico);
    }
    await page.waitForTimeout(500);

    const allSelectables = page.locator('ionic-selectable');
    const count = await allSelectables.count();
    for (let i = 0; i < count; i++) {
      const sel = allSelectables.nth(i);
      if (await sel.isVisible()) { await sel.click(); break; }
    }
    await page.waitForTimeout(2000);
    await page.locator('ion-searchbar').first().click();
    await page.keyboard.type(medicamentoQuery);
    await page.waitForTimeout(3500); // ⚠ mínimo para que la API responda
    // Selección inteligente: auto-match si hay hint, picker interactivo si no
    await selectItemFromModal(page, medicamentoHint, SCREENSHOTS_DIR);
    await page.waitForTimeout(2000);

    // PASO 8: Agregar
    console.log('→ PASO 8: Agregar medicamento');
    const agregarBtn = page.locator('ion-button').filter({ hasText: /agregar/i });
    await agregarBtn.first().waitFor({ state: 'visible', timeout: 8000 });
    await agregarBtn.first().click();
    await page.waitForTimeout(4000);

    // PASO 9: Continuar
    console.log('→ PASO 9: Continuar');
    const continuarBtn = page.locator('ion-button').filter({ hasText: /continuar/i });
    await continuarBtn.first().waitFor({ state: 'visible', timeout: 8000 });
    await continuarBtn.first().click();
    await page.waitForURL('**/medico-prescripcion-confirma', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // PASO 10: Preview — screenshot antes de confirmar
    console.log('→ PASO 10: Preview de confirmación');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const previewPath = path.join(SCREENSHOTS_DIR, `preview_${ts}.png`);

    const confirmed = await previewAndConfirm(page, previewPath);
    if (!confirmed) {
      console.log('\n❌ Receta cancelada por el usuario.\n');
      await browser.close();
      return;
    }

    // PASO 11: Confirmar
    console.log('→ PASO 11: Confirmando...');
    const allBtns = page.locator('ion-button');
    const btnCount = await allBtns.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = allBtns.nth(i);
      const visible = await btn.isVisible().catch(() => false);
      const txt = (await btn.innerText().catch(() => '')).trim().toUpperCase();
      if (visible && txt.includes('CONFIRM')) { await btn.click(); break; }
    }
    await page.waitForTimeout(5000);

    // Resultado
    const finalUrl = page.url();

    // Capturar nroRecetario del DOM si está disponible
    let nroReceta = 'N/A';
    try {
      const bodyText = await page.locator('body').innerText();
      const m = bodyText.match(/\b\d{13}\b/);
      if (m) nroReceta = m[0];
    } catch (_) {}

    // Screenshot final
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const finalSS = path.join(SCREENSHOTS_DIR, `receta_${ts}.png`);
    await page.screenshot({ path: finalSS });
    console.log(`📸 Screenshot final guardado: ${finalSS}`);

    await shareMenu(finalUrl, nroReceta);

    await page.waitForTimeout(3000);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const errSS = path.join(SCREENSHOTS_DIR, `error_${Date.now()}.png`);
    try { await page.screenshot({ path: errSS }); } catch (_) {}
    console.log(`   Screenshot de error guardado: ${errSS}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const forceSetup = process.argv.includes('--setup');

  if (forceSetup || !fs.existsSync(ENV_PATH)) {
    await runSetup();
  }

  const env = loadEnv();
  if (!env.MISRX_DNI || !env.MISRX_PASSWORD) {
    console.error('❌ Faltan credenciales. Ejecutá con --setup para configurar.');
    process.exit(1);
  }

  const creds = { DNI_MEDICO: env.MISRX_DNI, PASSWORD: env.MISRX_PASSWORD };
  const patient = await collectPatientData();
  await runAutomation(creds, patient);
})();
