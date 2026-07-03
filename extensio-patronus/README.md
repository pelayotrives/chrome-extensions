# Extensiones Hub (Chrome MV3)

Hub para reducir saturación en barra: mantienes solo este icono fijado y gestionas tus otras extensiones desde su popup.

## Lo que sí hace

- Crea grupos personalizados (Trabajo, Dev, IA, etc.)
- Lista extensiones instaladas
- Asigna cada extensión a un grupo
- Busca por nombre
- Activa/Desactiva extensión (API `chrome.management`)
- Abre página de opciones de extensión (si existe)

## Límites de Chrome API (importante)

- No existe API para fijar/desfijar otras extensiones por código.
- No existe API para abrir popup de otra extensión desde tu extensión.
- El popup del icono de una extensión se abre por click, no por hover.

## Instalación local

1. Abre `chrome://extensions/`
2. Activa **Modo desarrollador**
3. Click en **Cargar descomprimida**
4. Selecciona carpeta `extensiones-hub`
5. Fija solo **Extensiones Hub** en barra
6. Desfija manualmente el resto que quieras compactar

## Estructura

- `manifest.json`
- `popup/popup.html`
- `popup/popup.css`
- `popup/popup.js`

## Permisos usados

- `management`: leer extensiones y activarlas/desactivarlas
- `storage`: guardar grupos y asignaciones
- `tabs`: abrir páginas de opciones
