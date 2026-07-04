# Firma DocuSeal de EasyCar

## Modelo actual

El sistema no depende de una plantilla manual ni de `DOCUSEAL_TEMPLATE_ID`.

Cada venta genera un paquete HTML desde los documentos EasyCar ya adaptados en la aplicacion. El servidor envia ese HTML a DocuSeal con el endpoint `/submissions/html`, usando el rol `Customer`.

El tipo de venta controla el paquete:

- `BHPH`: todos los documentos EasyCar.
- `BANCO`: solo `Initial Financing Agreement` y `Credit Card Authorization`.

Los datos del cliente, vehiculo, VIN, millas, pagos, vendedor, fechas, interes de la inicial, finance charge y total de pagos se imprimen directamente en el documento antes de enviarlo. DocuSeal solo pide al cliente completar los campos de firma definidos con `signature-field`.

## Campos de firma

Los campos de firma pertenecen al rol `Customer`:

- Firma del cliente en cada documento requerido.
- Firma de co-buyer marcada como opcional cuando aplique.
- La fecha no la llena el cliente; se imprime automaticamente con la fecha del contrato.
- Donde firma EasyCar se imprime el nombre del vendedor.

## Webhook

Configurar los eventos de formularios para esta URL:

```text
https://easycar-doc-platform.vercel.app/api/signature/webhook
```

Activar la firma HMAC del webhook y guardar el secreto en `DOCUSEAL_WEBHOOK_SECRET`.

El correo de respuesta de las solicitudes se configura con `DOCUSEAL_REPLY_TO`, actualmente `sales@easycarus.com`.

El sistema relaciona DocuSeal con la venta mediante `external_id`, guarda los eventos y copia el PDF final al bucket privado `easycar-documents`.
