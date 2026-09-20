/**
 * Transport-schema boundary. Route-local Zod schemas are added with the
 * procedure implementation so transport contracts stay separate from
 * application commands and domain models.
 */
export type TransportSchemaModule = Record<string, unknown>;
