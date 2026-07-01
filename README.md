# EasyCar Document Platform

Sistema para preparar, guardar, imprimir y firmar documentos de ventas EasyCar.

## Flujos preparados

### Firma digital

1. El vendedor inicia sesion con un enlace enviado a su correo.
2. Llena y guarda la venta en Supabase.
3. Selecciona **Enviar para firma digital**.
4. El servidor crea una solicitud privada en DocuSeal y envia el enlace al cliente.
5. DocuSeal informa eventos de apertura, firma o rechazo mediante webhook.
6. El PDF firmado se descarga y archiva en Supabase Storage.

### Firma fisica

1. El vendedor llena la venta.
2. Selecciona **Imprimir para firma fisica**.
3. El sistema imprime el paquete completo con los datos ya colocados.
4. El cliente firma manualmente los documentos impresos.

## Componentes

- Vercel: sitio y servicios privados.
- Supabase Auth: acceso de vendedores.
- Supabase Postgres: ventas, estados y auditoria.
- Supabase Storage: documentos firmados digitalmente y archivos privados.
- DocuSeal: solicitud y registro de firma electronica.

## Puesta en marcha

1. Crear un proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en Supabase SQL Editor.
3. Configurar el proveedor de correo de Supabase Auth y las URLs permitidas.
4. Crear el primer usuario y promoverlo a administrador:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID';
```

5. Preparar la plantilla DocuSeal siguiendo `docs/DOCUSEAL_TEMPLATE.md`.
6. Agregar en Vercel todas las variables descritas en `.env.example`.
7. Crear el webhook DocuSeal apuntando a:

```text
https://easycar-doc.vercel.app/api/signature/webhook
```

8. Volver a desplegar el proyecto en Vercel.

## Seguridad

- La llave `SUPABASE_SERVICE_ROLE_KEY` y la llave de DocuSeal son solo del servidor.
- Los vendedores ven sus propias ventas.
- Gerentes y administradores pueden ver todas las ventas.
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
