# Cimbra — sitio web

Sitio estático (HTML/CSS/JS puro, sin build step) de la plataforma Cimbra.

## Estructura
- `index.html` — landing principal (con selector de idioma y comparador)
- `registro.html` — alta de fábrica / constructora / transportista
- `publicar-solicitud.html` — licitación inversa
- `solicitudes-abiertas.html` — búsqueda directa para fábricas
- `perfil-fabrica.html` — perfil público de ejemplo
- `panel.html` — panel de la constructora
- `precios.html` — planes y comisiones
- `*.pdf` — documentos legales enlazados desde el pie de página

## Despliegue
Este repositorio está pensado para desplegarse directamente en **Netlify**, conectado a este repo de GitHub. No requiere build: `netlify.toml` publica la raíz tal cual.

## Dominio
Dominio gestionado en Hostinger, apuntando por DNS a Netlify (ver guía de despliegue).
