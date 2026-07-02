# Plantilla DocuSeal de EasyCar

## Preparacion

1. Exportar el paquete final de documentos EasyCar a PDF.
2. Crear una plantilla en DocuSeal con el rol `Customer`.
3. Colocar los campos de firma, iniciales y fecha en cada documento que lo requiera.
4. Nombrar los campos de datos exactamente como aparecen abajo.
5. Marcar los datos comerciales prellenados como read-only.
6. Copiar el ID de la plantilla a `DOCUSEAL_TEMPLATE_ID`.

## Campos prellenados

- `Customer Name`
- `Customer Email`
- `Customer Phone`
- `Customer Address`
- `City`
- `State`
- `ZIP Code`
- `Driver License`
- `Co-Buyer Name`
- `Vehicle`
- `VIN`
- `Mileage`
- `Stock Number`
- `Contract Number`
- `Transaction Date`
- `Sales Representative`
- `Down Payment Total`
- `Financed Down Payment`
- `Payment Count`
- `Payment Frequency`
- `Payment 1 Date` hasta `Payment 12 Date`
- `Payment 1 Amount` hasta `Payment 12 Amount`

## Campos del cliente

Los nombres de firmas pueden variar, pero deben pertenecer al rol `Customer`:

- Firma del cliente en cada documento requerido.
- Iniciales donde corresponda.
- Fecha de firma.
- Confirmaciones o casillas obligatorias.

## Webhook

Configurar los eventos de formularios para esta URL:

```text
https://easycar-doc-platform.vercel.app/api/signature/webhook
```

Activar la firma HMAC del webhook y guardar el secreto en `DOCUSEAL_WEBHOOK_SECRET`.

El sistema relaciona DocuSeal con la venta mediante `external_id`, guarda los eventos y copia el PDF final al bucket privado `sale-documents`.
