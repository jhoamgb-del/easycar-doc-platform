# EasyCar Document Platform

Plataforma web para llenar e imprimir documentos de ventas EasyCar desde una sola pantalla.

## Estado actual

- Lista para publicar en Vercel como pagina estatica.
- El logo esta incluido dentro de `index.html`.
- No necesita servidor para funcionar.
- Incluye 7 documentos:
  - GPS Disclosure
  - GPS Fee Notice
  - Maintenance Package
  - Personal Vehicle Use
  - Vehicle History / CARFAX
  - Credit Card Authorization
  - Pick-Up Payment

## Siguiente paso recomendado

1. Subir este proyecto a GitHub.
2. Conectar el repositorio en Vercel.
3. Publicar.
4. Crear proyecto Supabase.
5. Aplicar `supabase/schema.sql`.
6. Conectar guardado de ventas y documentos generados.

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Nota

La version actual no guarda datos en la nube. Eso es intencional para tener primero una version estable para ventas. Supabase debe activarse en una segunda fase para guardar historial, clientes, vehiculos y sesiones de documentos.
