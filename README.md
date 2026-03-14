# misrx-playwright skill

Automatización del flujo completo de recetas electrónicas en [misrx.com.ar](https://misrx.com.ar) usando Playwright (Node.js).

Disponible como **skill para Claude Code** o como **contexto reutilizable en cualquier plataforma de agentes IA**.

## ¿Qué hace?

- Emitir recetas electrónicas en misrx.com.ar automáticamente
- Automatizar prescripciones médicas paso a paso
- Manejar el flujo completo: login → obra social → paciente → medicamento → confirmación
- Resolver errores comunes de scripting sobre la plataforma Ionic/Angular de misrx

---

## Contenido del repositorio

```
skillmisrx/
├── misrx-playwright.skill   # Skill empaquetada para Claude Code (ZIP)
│   ├── SKILL.md             # Instrucciones y contexto del agente
│   └── references/
│       └── receta_completa.js  # Script Playwright de referencia end-to-end
└── README.md
```

> El archivo `.skill` es simplemente un ZIP. Podés extraer `SKILL.md` y
> `receta_completa.js` con `unzip misrx-playwright.skill` para usarlos en
> cualquier plataforma.

---

## Setup de Playwright (requerido en todos los casos)

```bash
mkdir -p /tmp/pw_misrx
cd /tmp/pw_misrx
npm init -y
npm install @playwright/test
npx playwright install chromium
```

> **Importante:** misrx usa Ionic + Angular SPA. Siempre usar `headless: false`
> y `slowMo: 700`, de lo contrario los componentes no renderizan correctamente.

---

## Instalación por plataforma

### Claude Code

```bash
claude skill install misrx-playwright.skill
```

La skill se activa automáticamente cuando mencionás: `receta electrónica`,
`misrx`, `prescripción automatizada` o cualquier tarea de scripting sobre misrx.

---

### OpenAI Assistants (API)

Extraer el contexto del skill y cargarlo como instrucciones del asistente:

```bash
unzip misrx-playwright.skill misrx-playwright/SKILL.md -d /tmp/misrx
```

```python
from openai import OpenAI

client = OpenAI()

with open("/tmp/misrx/misrx-playwright/SKILL.md") as f:
    skill_context = f.read()

assistant = client.beta.assistants.create(
    name="misrx-playwright",
    instructions=skill_context,
    model="gpt-4o",
    tools=[{"type": "code_interpreter"}],
)
```

---

### LangChain

Cargar el `SKILL.md` como contexto del sistema e invocar el agente:

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI  # o ChatAnthropic

with open("misrx-playwright/SKILL.md") as f:
    skill_context = f.read()

prompt = ChatPromptTemplate.from_messages([
    ("system", skill_context),
    ("human", "{input}"),
])

llm = ChatOpenAI(model="gpt-4o")  # o Anthropic, etc.
chain = prompt | llm

response = chain.invoke({
    "input": "Creá una receta para DNI 37835412, ANAFLEX 500mg, Paciente Particular"
})
```

---

### AutoGen

```python
import autogen

with open("misrx-playwright/SKILL.md") as f:
    skill_context = f.read()

assistant = autogen.AssistantAgent(
    name="misrx_agent",
    system_message=skill_context,
    llm_config={"model": "gpt-4o"},
)

user_proxy = autogen.UserProxyAgent(
    name="user",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "/tmp/pw_misrx"},
)

user_proxy.initiate_chat(
    assistant,
    message="Creá una receta para DNI 37835412, ANAFLEX 500mg, Paciente Particular",
)
```

AutoGen ejecutará el código Playwright generado directamente en `work_dir`.

---

### Claude API (Anthropic SDK)

```python
import anthropic

with open("misrx-playwright/SKILL.md") as f:
    skill_context = f.read()

client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    system=skill_context,
    messages=[{
        "role": "user",
        "content": "Creá una receta para DNI 37835412, ANAFLEX 500mg, Paciente Particular"
    }],
)
print(message.content[0].text)
```

---

### Cualquier otro agente / LLM

El patrón es siempre el mismo:

1. Extraer `SKILL.md` del ZIP: `unzip misrx-playwright.skill`
2. Cargar su contenido como **system prompt** o **contexto inicial** del agente
3. Opcionalmente, incluir `receta_completa.js` como archivo de referencia adjunto
4. El agente generará scripts Playwright basados en ese contexto

---

## Ejemplo de prompt (universal)

```
Creá una receta electrónica en misrx para el paciente con DNI 37835412,
obra social Paciente Particular, medicamento ANAFLEX 500mg,
diagnóstico "Dolor leve".
```

---

## Desinstalar (Claude Code)

```bash
claude skill remove misrx-playwright
```
