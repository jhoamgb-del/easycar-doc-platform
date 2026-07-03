# EasyCar Document Platform

Sistema para preparar, guardar, imprimir y firmar documentos de ventas EasyCar.

## Flujos preparados

### Firma digital

1. El vendedor inicia sesion con un enlace enviado a su correo.
2. Elige el tipo de venta: **BHPH** o **BANCO**.
3. Llena y guarda la venta en Supabase.
4. Selecciona **Enviar para firma digital**.
5. El servidor genera el paquete correcto en HTML profesional, crea una solicitud privada en DocuSeal y envia el enlace al cliente.
6. DocuSeal informa eventos de apertura, firma o rechazo mediante webhook.
7. El PDF firmado se descarga y archiva en Supabase Storage.

### Tipos de venta

- **BHPH**: genera todos los documentos EasyCar.
- **BANCO**: genera solo `Pick-Up Payment` y `Credit Card Authorization`.

### Firma fisica

1. El vendedor llena la venta.
2. Selecciona **Imprimir para firma fisica**.
3. El sistema imprime el paquete correspondiente al tipo de venta con los datos ya colocados.
4. El cliente firma manualmente los documentos impresos.

## Componentes

- Vercel: sitio y servicios privados.
- Supabase Auth: acceso de vendedores.
- Supabase Postgres: clientes, ventas, estados y auditoria.
- Supabase Storage: documentos firmados digitalmente y archivos privados.
- DocuSeal: solicitud y registro de firma electronica.

## Puesta en marcha

1. Crear un proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en Supabase SQL Editor.
3. Configurar el proveedor de correo de Supabase Auth y las URLs permitidas.
4. Crear el primer usuario y promoverlo a administrador:

```sql
update public.doc_user_profiles
set role = 'admin'
where id = 'USER_UUID';
```

5. Revisar la configuracion DocuSeal siguiendo `docs/DOCUSEAL_TEMPLATE.md`.
6. Agregar en Vercel todas las variables descritas en `.env.example`.
7. Crear el webhook DocuSeal apuntando a:

```text
https://easycar-doc-platform.vercel.app/api/signature/webhook
```

8. Volver a desplegar el proyecto en Vercel.

## Variables de Vercel

Estas variables deben existir en Production:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DOCUSEAL_API_URL
DOCUSEAL_API_KEY
DOCUSEAL_CUSTOMER_ROLE
DOCUSEAL_REPLY_TO
DOCUSEAL_WEBHOOK_SECRET
```

`VITE_SUPABASE_URL` y `SUPABASE_URL` normalmente tienen el mismo valor.
`DOCUSEAL_API_URL` puede quedar como `https://api.docuseal.com`.
`DOCUSEAL_REPLY_TO` puede quedar como `sales@easycarrus.com`.

## Seguridad

- La llave `SUPABASE_SERVICE_ROLE_KEY` y la llave de DocuSeal son solo del servidor.
- Los vendedores ven sus propias ventas.
- Gerentes y administradores pueden ver todas las ventas.
- Cada venta crea o actualiza automaticamente un registro de cliente para historial y busqueda.
- Los documentos se guardan en un bucket privado.
- Los enlaces de firma se crean para un cliente especifico y requieren verificacion por correo.
- El guardado local del navegador se mantiene solo como respaldo temporal.

## Desarrollo

```bash
npm install
npm run check
npm run dev
npm run build
```

Sin credenciales, la aplicacion sigue permitiendo llenar, guardar localmente e imprimir. Las funciones centrales permanecen desactivadas.
