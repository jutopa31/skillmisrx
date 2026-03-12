# misrx-playwright skill

Skill para Claude Code que automatiza la creación de recetas electrónicas en [misrx.com.ar](https://misrx.com.ar) usando Playwright (Node.js).

## ¿Qué hace esta skill?

Cuando la instalas, Claude Code puede ayudarte a:

- Emitir recetas electrónicas en misrx.com.ar automáticamente
- Automatizar prescripciones médicas paso a paso
- Manejar el flujo completo: login → obra social → paciente → medicamento → confirmación
- Resolver errores comunes de scripting en la plataforma

---

## Instalación

### Requisitos previos

- [Claude Code CLI](https://docs.anthropic.com/es/docs/claude-code) instalado
- El archivo `misrx-playwright.skill` descargado desde este repositorio

### Paso 1 — Descargar el archivo `.skill`

```bash
# Clonar el repositorio
git clone <url-de-este-repositorio>
cd skillmisrx
```

O descargar solo el archivo:

```bash
curl -LO https://<url-de-este-repositorio>/raw/main/misrx-playwright.skill
```

### Paso 2 — Instalar la skill en Claude Code

```bash
claude skill install misrx-playwright.skill
```

Eso es todo. La skill quedará disponible en tu instalación de Claude Code.

---

## Uso

Una vez instalada, Claude Code activará la skill automáticamente cuando menciones:

- `receta electrónica`
- `misrx` / `misrx.com.ar`
- `prescripción automatizada`
- Cualquier tarea de scripting o automatización sobre la plataforma misrx

### Ejemplo de prompt

```
Creá una receta electrónica en misrx para el paciente con DNI 37835412,
obra social Paciente Particular, medicamento ANAFLEX 500mg,
diagnóstico "Dolor leve".
```

Claude Code generará y ejecutará el script de Playwright correspondiente.

---

## Setup de Playwright (necesario la primera vez)

La skill usa Playwright para la automatización. Si no lo tenés instalado, ejecutá:

```bash
mkdir -p /tmp/pw_misrx
cd /tmp/pw_misrx
npm init -y
npm install @playwright/test
npx playwright install chromium
```

> **Nota:** La plataforma misrx usa Ionic + Angular SPA, por lo que Playwright debe
> ejecutarse con `headless: false` y `slowMo: 700`. La skill ya configura esto
> automáticamente en los scripts que genera.

---

## Estructura del repositorio

```
skillmisrx/
├── misrx-playwright.skill   # Archivo de la skill (instalar este)
└── README.md                # Este archivo
```

---

## Desinstalar

```bash
claude skill remove misrx-playwright
```
