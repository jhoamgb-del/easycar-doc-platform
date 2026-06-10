# EasyCar Document Platform

Plataforma web para llenar e imprimir documentos de ventas EasyCar desde una sola pantalla.

## Estado actual

- Lista para publicar en Vercel como pagina estatica.
- El logo esta incluido dentro de `index.html`.
- No necesita servidor para llenar e imprimir.
- Puede guardar ventas en Supabase cuando se configuran `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Incluye 10 documentos:
  - GPS Disclosure
  - GPS Fee Notice
  - Maintenance Package
  - Personal Vehicle Use
  - Vehicle History / CARFAX
  - Credit Card Authorization
  - Pick-Up Payment
  - Conditional Delivery
  - Communication Authorization
  - Credit Application

## Siguiente paso recomendado

1. Subir este proyecto a GitHub.
2. Conectar el repositorio en Vercel.
3. Publicar.
4. Crear proyecto Supabase.
5. Aplicar `supabase/schema.sql`.
6. Configurar variables de entorno en Vercel.

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Variables de entorno

```bash
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

## Nota

La version actual guarda cliente, vehiculo y la sesion completa del formulario. El historial administrativo y busqueda de ventas debe agregarse despues con acceso controlado.
