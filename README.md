# misrx-playwright skill

Automatización del flujo completo de recetas electrónicas en [misrx.com.ar](https://misrx.com.ar) usando Playwright (Node.js).

Disponible como **skill para Claude Code** o como **contexto reutilizable en cualquier plataforma de agentes IA**.

## ¿Qué hace?

- Emite recetas electrónicas en misrx.com.ar automáticamente
- **Setup interactivo**: crea `.env` con credenciales en el primer uso
- **Credenciales seguras**: guardadas en `.env` con permisos 600, excluido de git
- **Solicita datos del paciente** antes de cada receta (DNI, sexo, obra social, medicamento)
- **Preview con screenshot** antes de confirmar — el médico aprueba o cancela
- **Opciones de compartir**: navegador, portapapeles, WhatsApp, email, impresión
- Screenshots de error automáticos para diagnóstico

---

## Contenido del repositorio

```
skillmisrx/
├── misrx-playwright.skill         # Skill empaquetada para Claude Code (ZIP)
│   ├── SKILL.md                   # Instrucciones y contexto del agente
│   └── references/
│       ├── receta_completa.js     # Script Playwright v2 (setup + preview + share)
│       └── .env.example           # Template de credenciales
└── README.md
```

> El archivo `.skill` es simplemente un ZIP. Podés extraer su contenido con:
> ```bash
> unzip misrx-playwright.skill
> ```

---

## Setup de Playwright (requerido)

```bash
mkdir -p /tmp/pw_misrx
cd /tmp/pw_misrx
npm init -y
npm install @playwright/test
npx playwright install chromium
cp /ruta/al/receta_completa.js .
```

> **Importante:** misrx usa Ionic + Angular SPA. Siempre usar `headless: false`
> y `slowMo: 700`, de lo contrario los componentes no renderizan correctamente.

---

## Primer uso

```bash
node receta_completa.js
```

Si no existe `.env`, se lanza el wizard de configuración automáticamente:

```
╔══════════════════════════════════════╗
║   MISRX — Configuración inicial      ║
╚══════════════════════════════════════╝

DNI del médico: 12345678
Contraseña (se oculta al escribir): ********

✅ Credenciales guardadas en .env (permisos 600)
```

Para reconfigurar:

```bash
node receta_completa.js --setup
```

---

## Flujo de ejecución

1. **Credenciales** → cargadas desde `.env` (o setup si no existe)
2. **Datos del paciente** → ingresados interactivamente (DNI, sexo, obra social, medicamento, diagnóstico)
3. **Automatización** → login → nueva receta → obra social → paciente → medicamento → continuar
4. **Preview** → screenshot de la pantalla de confirmación; el médico aprueba o cancela
5. **Emisión** → si se confirma, se emite la receta
6. **Compartir** → menú con opciones: navegador, portapapeles, WhatsApp, email, imprimir

---

## Instalación como skill en Claude Code

```bash
claude skill install misrx-playwright.skill
```

La skill se activa automáticamente cuando mencionás: `receta electrónica`,
`misrx`, `prescripción automatizada` o cualquier tarea de scripting sobre misrx.

---

## Desinstalar (Claude Code)

```bash
claude skill remove misrx-playwright
```

---

## Integración con otros agentes / LLMs

El patrón es siempre el mismo:

1. Extraer `SKILL.md` del ZIP: `unzip misrx-playwright.skill`
2. Cargar su contenido como **system prompt** o **contexto inicial** del agente
3. Opcionalmente, incluir `receta_completa.js` como archivo de referencia adjunto
4. El agente generará scripts Playwright basados en ese contexto
