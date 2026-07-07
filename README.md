# EasyCar Document Platform

Sistema para preparar, guardar, imprimir y firmar documentos de ventas EasyCar.

## Flujos preparados

### Firma digital

1. El vendedor inicia sesion con un enlace enviado a su correo.
2. Elige el tipo de venta: **BHPH** o **BANCO**.
3. Llena y guarda la venta en Supabase.
4. Selecciona **Enviar firma digital al cliente**.
5. El servidor genera el paquete correcto en HTML profesional, crea una solicitud privada en DocuSeal y envia el enlace al cliente.
6. DocuSeal informa eventos de apertura, firma o rechazo mediante webhook.
7. El PDF firmado se descarga y archiva en Supabase Storage.

### Tipos de venta

- **BHPH**: genera todos los documentos EasyCar.
- **BANCO**: genera solo `Initial Financing Agreement` y `Credit Card Authorization`.

El acuerdo de inicial permite escoger interes anual de 0% a 30%, calcula el calendario de pagos, finance charge, total de pagos, interes, capital y saldo. Tambien divulga el cargo de tarjeta de 1.8% y los fees aplicables del acuerdo.

### Firma fisica

1. El vendedor llena la venta.
2. Selecciona **Imprimir / guardar PDF**.
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
DOCUSEAL_BCC_COMPLETED
DOCUSEAL_SEND_SMS
DOCUSEAL_REQUIRE_PHONE_2FA
DOCUSEAL_REQUIRE_EMAIL_2FA
DOCUSEAL_COMPLETED_REDIRECT_URL
DOCUSEAL_EXPIRE_DAYS
DOCUSEAL_WEBHOOK_SECRET
```

`VITE_SUPABASE_URL` y `SUPABASE_URL` normalmente tienen el mismo valor.
`DOCUSEAL_API_URL` puede quedar como `https://api.docuseal.com`.
`DOCUSEAL_REPLY_TO` puede quedar como `sales@easycarus.com`.
`DOCUSEAL_BCC_COMPLETED` debe quedar como `sales@easycarus.com` para recibir copia final.
`DOCUSEAL_SEND_SMS=true` y `DOCUSEAL_REQUIRE_PHONE_2FA=true` activan el flujo Pro con verificacion SMS obligatoria.
`DOCUSEAL_COMPLETED_REDIRECT_URL=https://docs.easycarus.com/` devuelve al cliente al portal despues de firmar.
`DOCUSEAL_EXPIRE_DAYS=14` limita el tiempo de vigencia del enlace de firma.

## DocuSeal Pro

El sistema queda preparado para usar DocuSeal Pro:

- Solicitud por email al cliente y SMS obligatorio al telefono del cliente.
- `reply_to` y copia final a `sales@easycarus.com`.
- Mensaje profesional de EasyCar para la solicitud de firma.
- Redireccion final al portal `https://docs.easycarus.com/`.
- Expiracion automatica del enlace de firma.
- Metadata de venta, tipo de documento, VIN y stock enviada a DocuSeal.
- Logo EasyCar preparado para subir a DocuSeal: `public/easycar-docuseal-logo-400.png`.

En DocuSeal, revisar que la cuenta correcta sea EasyCar y que Billing muestre Pro activo. Luego configurar:

1. Settings -> Personalization -> Company Logo: subir `public/easycar-docuseal-logo-400.png`.
2. Settings -> Notifications: completar `sales@easycarus.com` como BCC de documentos completados.
3. Settings -> Personalization -> Email Templates: ajustar el HTML/texto de los correos si se desea.
4. Para que el correo salga realmente desde `sales@easycarus.com`, conectar Gmail/Outlook/SMTP de `sales@easycarus.com` en DocuSeal. Mientras eso no este conectado, el API solo garantiza `reply_to=sales@easycarus.com`, no el remitente real.

## Seguridad

- La llave `SUPABASE_SERVICE_ROLE_KEY` y la llave de DocuSeal son solo del servidor.
- Los vendedores ven sus propias ventas.
- Gerentes y administradores pueden ver todas las ventas.
- Cada venta crea o actualiza automaticamente un registro de cliente para historial y busqueda.
- Los documentos firmados se guardan en un bucket privado y se consultan desde el Archivo central de documentos.
- Los enlaces de firma se crean para un cliente especifico y requieren verificacion SMS cuando DocuSeal Pro esta activo.
- El guardado local del navegador se mantiene solo como respaldo temporal.

## Desarrollo

```bash
npm install
npm run check
npm run dev
npm run build
```

Sin credenciales, la aplicacion sigue permitiendo llenar, guardar localmente e imprimir. Las funciones centrales permanecen desactivadas.
